// Places in the US, as someone types where they are ("Seattle, WA", "Seattle,
// Washington", "seattle wa"): read into a city and its state's two letters.
// Safe anywhere, the browser included.

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const BY_NAME = new Map(Object.entries(US_STATES).map(([abbr, name]) => [name.toLowerCase(), abbr]));

export type Place = { city: string; state: string };

// "Seattle, WA" (or nothing at all).
export const placeLabel = (place: { city: string; state: string } | null | undefined) =>
  place?.city && place.state ? `${place.city}, ${place.state}` : "";

// A city's name as people write it: each word with a capital.
export const titled = (city: string) =>
  city
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, gap: string, letter: string) => gap + letter.toUpperCase());

// What someone typed, read as a place: the city, then its state (two
// letters or its name), with or without a comma. Null when there's no state
// to be found at its end, or the city isn't one.
export function parsePlace(typed: string): Place | null {
  const text = typed.replace(/\s+/g, " ").trim();
  if (!text || text.length > 80) return null;
  const parts = text.includes(",") ? text.split(",").map((part) => part.trim()) : null;
  let city: string;
  let stateText: string;
  if (parts && parts.length === 2) {
    [city, stateText] = parts;
  } else {
    // No comma: the state is the last word or two ("New York", "North Dakota").
    const words = text.split(" ");
    const two = words.slice(-2).join(" ").toLowerCase();
    if (words.length > 2 && BY_NAME.has(two)) {
      city = words.slice(0, -2).join(" ");
      stateText = two;
    } else {
      city = words.slice(0, -1).join(" ");
      stateText = words.at(-1) ?? "";
    }
  }
  const upper = stateText.toUpperCase().replace(/\./g, "");
  const state = US_STATES[upper] ? upper : BY_NAME.get(stateText.toLowerCase());
  if (!state || !/^[\p{L}][\p{L} .'-]{0,58}$/u.test(city)) return null;
  return { city: titled(city), state };
}
