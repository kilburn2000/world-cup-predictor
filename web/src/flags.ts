// Team name -> flag emoji. Keyed by normalised name (our DB / football-data
// names). England & Scotland use subdivision flag tag-sequences.

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

const ISO2: Record<string, string> = {
  algeria: "DZ", argentina: "AR", australia: "AU", austria: "AT", belgium: "BE",
  bosniaherzegovina: "BA", brazil: "BR", canada: "CA", capeverde: "CV",
  colombia: "CO", congodr: "CD", croatia: "HR", curaao: "CW", czechia: "CZ",
  ecuador: "EC", egypt: "EG", france: "FR", germany: "DE", ghana: "GH",
  haiti: "HT", iran: "IR", iraq: "IQ", ivorycoast: "CI", japan: "JP",
  jordan: "JO", mexico: "MX", morocco: "MA", netherlands: "NL", newzealand: "NZ",
  norway: "NO", panama: "PA", paraguay: "PY", portugal: "PT", qatar: "QA",
  saudiarabia: "SA", senegal: "SN", southafrica: "ZA", southkorea: "KR",
  spain: "ES", sweden: "SE", switzerland: "CH", tunisia: "TN", turkey: "TR", trkiye: "TR",
  unitedstates: "US", uruguay: "UY", uzbekistan: "UZ",
};

const SPECIAL: Record<string, string> = {
  england: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  scotland: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
  wales: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}",
};

function iso2ToEmoji(cc: string): string {
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function flagFor(name: string | null | undefined): string {
  if (!name) return "";
  const n = norm(name);
  if (SPECIAL[n]) return SPECIAL[n];
  const cc = ISO2[n];
  return cc ? iso2ToEmoji(cc) : "";
}
