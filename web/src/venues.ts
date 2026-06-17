// Each 2026 World Cup venue's host country + state/province, keyed by the venue
// string the API sends (see GROUP_VENUES / SCHEDULE on the server). Lets the match
// cards show a country flag and the state alongside the stadium + city.
type VenueMeta = { country: string; state: string };

const VENUES: Record<string, VenueMeta> = {
  // United States
  "SoFi Stadium, Inglewood": { country: "United States", state: "CA" },
  "Levi's Stadium, Santa Clara": { country: "United States", state: "CA" },
  "Lumen Field, Seattle": { country: "United States", state: "WA" },
  "Gillette Stadium, Foxborough": { country: "United States", state: "MA" },
  "MetLife Stadium, East Rutherford": { country: "United States", state: "NJ" },
  "Lincoln Financial Field, Philadelphia": { country: "United States", state: "PA" },
  "Mercedes-Benz Stadium, Atlanta": { country: "United States", state: "GA" },
  "Hard Rock Stadium, Miami Gardens": { country: "United States", state: "FL" },
  "AT&T Stadium, Arlington": { country: "United States", state: "TX" },
  "NRG Stadium, Houston": { country: "United States", state: "TX" },
  "Arrowhead Stadium, Kansas City": { country: "United States", state: "MO" },
  // Canada
  "BC Place, Vancouver": { country: "Canada", state: "BC" },
  "BMO Field, Toronto": { country: "Canada", state: "ON" },
  // Mexico
  "Estadio Azteca, Mexico City": { country: "Mexico", state: "CDMX" },
  "Estadio BBVA, Guadalupe": { country: "Mexico", state: "NL" },
  "Estadio Akron, Guadalajara": { country: "Mexico", state: "JAL" },
};

export function venueMeta(venue?: string | null): VenueMeta | null {
  return venue ? VENUES[venue] ?? null : null;
}
