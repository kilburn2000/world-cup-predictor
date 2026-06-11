import "dotenv/config";
import sharp from "sharp";
import type { ParsedPrediction } from "./importSheet.js";

const KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = process.env.VISION_MODEL ?? "claude-opus-4-8";

export interface ExtractedSheet {
  name: string;
  group: { home: string; homeGoals: number; awayGoals: number; away: string }[];
  knockout: { round: string; home: string; homeGoals: number; awayGoals: number; away: string }[];
}

const PROMPT = `These image tiles together make up ONE World Cup 2026 prediction sheet (read left-to-right, top-to-bottom: a 2-column x 3-row grid covering the page). The left side lists GROUP-stage fixtures (date, group letter, home team, a red two-box predicted score, away team). The right side has the KNOCKOUT bracket with sections "Round of 32", "Round of 16", "Quarter final", "Semi-Final", "Third place", "Final".

Extract the entrant's NAME (the big title at the top) and EVERY predicted result. Read the small red score boxes carefully (single digits). Keep fixtures in the order they appear.

CRITICAL counts — the sheet ALWAYS has EXACTLY these, no more, no fewer:
- GROUP stage: 72 matches
- Round of 32: 16 matches
- Round of 16: 8 matches
- Quarter final: 4 matches
- Semi-Final: 2 matches
- Third place: 1 match
- Final: 1 match
(knockout = 32 total). The tiles overlap at their edges — if a match is visible in two tiles, include it ONCE only. Never invent, duplicate, or carry a match into the wrong round. If you can't read a score, still include the match with your best read.

Output STRICT JSON only, no prose, no markdown fences:
{"name":"...","group":[{"home":"Mexico","homeGoals":2,"awayGoals":0,"away":"South Africa"}],"knockout":[{"round":"Round of 32","home":"...","homeGoals":1,"awayGoals":0,"away":"..."}]}`;

// Rotate upright, tile into a 2x3 grid for resolution, and ask the vision model
// to read the whole sheet. Robust to varying photo sizes.
export async function extractFromPhoto(image: Buffer): Promise<ExtractedSheet> {
  if (!KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const rotated = await sharp(image).rotate(90).toBuffer();
  const meta = await sharp(rotated).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const cols = 2;
  const rows = 3;
  const tw = Math.floor(W / cols);
  const th = Math.floor(H / rows);
  // overlap so a match row on a tile boundary still appears whole in a tile
  const ox = Math.floor(W * 0.05);
  const oy = Math.floor(H * 0.04);

  const images: any[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const left = Math.max(0, c * tw - ox);
      const top = Math.max(0, r * th - oy);
      const right = Math.min(W, (c + 1) * tw + ox);
      const bottom = Math.min(H, (r + 1) * th + oy);
      const buf = await sharp(rotated)
        .extract({ left, top, width: right - left, height: bottom - top })
        .resize({ width: 1500 })
        .jpeg({ quality: 85 })
        .toBuffer();
      images.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") } });
    }
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      messages: [{ role: "user", content: [...images, { type: "text", text: PROMPT }] }],
    }),
  });
  const data: any = await res.json();
  if (data.type === "error") throw new Error(data.error?.message ?? "vision API error");
  const text = data.content.map((b: any) => b.text ?? "").join("");
  const json = text.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(json) as ExtractedSheet;
}

const ROUND_PREFIX: Record<string, string> = {
  "round of 32": "R32",
  "round of 16": "R16",
  "quarter final": "QF",
  "quarter-final": "QF",
  "quarterfinal": "QF",
  "semi-final": "SF",
  "semi final": "SF",
  "semifinal": "SF",
  "third place": "THIRD",
  "final": "FINAL",
};

// Convert the extracted sheet into the common ParsedPrediction[] shape, assigning
// bracket slots per round in read order.
export function toPredictions(x: ExtractedSheet): ParsedPrediction[] {
  const out: ParsedPrediction[] = x.group.map((g) => ({
    kind: "group" as const,
    home: g.home,
    away: g.away,
    homeGoals: Number(g.homeGoals),
    awayGoals: Number(g.awayGoals),
  }));

  const counters: Record<string, number> = {};
  for (const k of x.knockout) {
    const prefix = ROUND_PREFIX[k.round.toLowerCase().trim()] ?? k.round;
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    const slot = prefix === "THIRD" || prefix === "FINAL" ? prefix : `${prefix}-${counters[prefix]}`;
    out.push({
      kind: "knockout",
      slot,
      home: k.home,
      away: k.away,
      homeGoals: Number(k.homeGoals),
      awayGoals: Number(k.awayGoals),
    });
  }
  return out;
}
