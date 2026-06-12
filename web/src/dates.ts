const ord = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};

// "Thursday, 11th June 2026"
export function longDate(d: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone,
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")}, ${ord(Number(get("day")))} ${get("month")} ${get("year")}`;
}
