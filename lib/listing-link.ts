// A link to a home on another site (Zillow, Redfin, Realtor.com, Trulia,
// Google Maps and the like), read for the address in it: those addresses
// carry the street, so nothing is fetched. What comes back is the street
// ("123 Main St NE"), which is what a search here goes by. Anything that
// isn't a link, or has no address in it, is null.

const SUFFIX =
  /^(st|street|ave|avenue|rd|road|dr|drive|ln|lane|way|ct|court|pl|place|blvd|boulevard|ter|terrace|cir|circle|pkwy|parkway|hwy|highway|trl|trail|loop|sq|square|aly|alley|pt|point|run|row|walk|xing|crossing)$/i;
const COMPASS = /^(n|s|e|w|ne|nw|se|sw|north|south|east|west)$/i;

export const looksLikeLink = (text: string) => /^(https?:\/\/|www\.)\S+$/i.test(text.trim()) || /^[\w-]+(\.[\w-]+)+\/\S+$/.test(text.trim());

// The street out of an address written in one run ("123 Main St Seattle WA
// 98101"): up to its street word (and a compass point after it), or, with
// none, without the state and ZIP at its end.
function streetOf(address: string): string {
  const beforeComma = address.split(",")[0].trim();
  const words = beforeComma.split(/\s+/).filter(Boolean);
  // (From the third word on: "12 Court St" is on Court Street.)
  for (let i = words.length - 1; i >= 2; i--) {
    if (!SUFFIX.test(words[i])) continue;
    const end = words[i + 1] && COMPASS.test(words[i + 1]) ? i + 2 : i + 1;
    return words.slice(0, end).join(" ");
  }
  const trimmed = [...words];
  if (/^\d{5}(-\d{4})?$/.test(trimmed.at(-1) ?? "")) trimmed.pop();
  if (/^[a-z]{2}$/i.test(trimmed.at(-1) ?? "") && trimmed.length > 3) trimmed.pop();
  return trimmed.join(" ");
}

const spaced = (part: string) => decodeURIComponent(part.replace(/\+/g, " ")).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
// A part of an address that reads as one: a house number, then words.
const addressy = (part: string) => /^\d+[a-z]?[-+_ %][a-z0-9]/i.test(part);

export function addressFromLink(text: string): string | null {
  const raw = text.trim();
  if (!looksLikeLink(raw)) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  let parts: string[];
  try {
    parts = url.pathname.split("/").filter(Boolean);
  } catch {
    return null;
  }
  const done = (address: string | undefined | null) => {
    if (!address) return null;
    let street: string;
    try {
      street = streetOf(spaced(address));
    } catch {
      return null;
    }
    return /^\d+\S*\s+\S/.test(street) && street.length <= 80 ? street : null;
  };

  // Google Maps: /maps/place/123+Main+St,+Seattle,+WA+98101/…, or ?q= / ?query=.
  if (host.includes("google.") || host === "maps.app.goo.gl" || host === "goo.gl") {
    const at = parts.indexOf("place") >= 0 ? parts.indexOf("place") : parts.indexOf("search");
    const place = at >= 0 ? parts[at + 1] : null;
    const asked = url.searchParams.get("q") ?? url.searchParams.get("query") ?? url.searchParams.get("destination");
    return done(place && addressy(place) ? place.replace(/\+/g, " ") : asked);
  }
  // Realtor.com: /realestateandhomes-detail/123-Main-St_Seattle_WA_98101_M12345-67890
  if (host.endsWith("realtor.com")) {
    const detail = parts[parts.indexOf("realestateandhomes-detail") + 1];
    return done(detail?.split("_")[0]);
  }
  // Redfin: /WA/Seattle/123-Main-St-98101/home/12345 (and with a unit: /unit-4/).
  if (host.endsWith("redfin.com")) {
    const part = parts.find(addressy);
    return done(part?.replace(/-\d{5}$/, ""));
  }
  // Zillow (/homedetails/123-Main-St-Seattle-WA-98101/123_zpid/), Trulia,
  // Homes.com, Compass and the rest: the part that reads as an address.
  const part = parts.find(addressy);
  return done(part?.replace(/[-_]+\d{6,}$/, ""));
}
