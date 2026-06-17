// Each 2026 World Cup venue's host country + the city to show, keyed by the venue
// string the API sends (see GROUP_VENUES / SCHEDULE on the server). A few stadiums
// sit in a smaller town, so we show the larger nearby city instead (Inglewood ->
// Los Angeles, etc). Lets the cards show a country flag + stadium + city.
type VenueMeta = { country: string; city: string };

const VENUES: Record<string, VenueMeta> = {
  // United States
  "SoFi Stadium, Inglewood": { country: "United States", city: "Los Angeles" },
  "Levi's Stadium, Santa Clara": { country: "United States", city: "San Francisco" },
  "Lumen Field, Seattle": { country: "United States", city: "Seattle" },
  "Gillette Stadium, Foxborough": { country: "United States", city: "Boston" },
  "MetLife Stadium, East Rutherford": { country: "United States", city: "New York" },
  "Lincoln Financial Field, Philadelphia": { country: "United States", city: "Philadelphia" },
  "Mercedes-Benz Stadium, Atlanta": { country: "United States", city: "Atlanta" },
  "Hard Rock Stadium, Miami Gardens": { country: "United States", city: "Miami" },
  "AT&T Stadium, Arlington": { country: "United States", city: "Dallas" },
  "NRG Stadium, Houston": { country: "United States", city: "Houston" },
  "Arrowhead Stadium, Kansas City": { country: "United States", city: "Kansas City" },
  // Canada
  "BC Place, Vancouver": { country: "Canada", city: "Vancouver" },
  "BMO Field, Toronto": { country: "Canada", city: "Toronto" },
  // Mexico
  "Estadio Azteca, Mexico City": { country: "Mexico", city: "Mexico City" },
  "Estadio BBVA, Guadalupe": { country: "Mexico", city: "Guadalupe" },
  "Estadio Akron, Guadalajara": { country: "Mexico", city: "Guadalajara" },
};

/** { country, label } for a venue string, where label is "Stadium, City" with the
 * larger nearby city. Returns null for an unknown venue (cards fall back to the raw string). */
export function venueMeta(venue?: string | null): { country: string; label: string } | null {
  if (!venue) return null;
  const meta = VENUES[venue];
  if (!meta) return null;
  const stadium = venue.split(",")[0].trim();
  return { country: meta.country, label: `${stadium}, ${meta.city}` };
}
