// Where an address is on the map, for a listing an agent adds themselves (an
// MLS listing comes with its own). Asked of the US Census Bureau's free
// geocoder: no key, US addresses only. Null when it can't say, or doesn't
// answer within a few seconds, or when it's turned off (GEOCODER=off: the
// e2e suite, which never reaches the internet).

export type Place = { latitude: number; longitude: number };

const BASE = "https://geocoding.geo.census.gov/geocoder/locations";
const WAIT_MS = 5000;

type Match = { coordinates?: { x?: unknown; y?: unknown } };

async function ask(path: string, params: Record<string, string>): Promise<Place | null> {
  const url = `${BASE}/${path}?${new URLSearchParams({ ...params, benchmark: "Public_AR_Current", format: "json" })}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(WAIT_MS), cache: "no-store" });
  if (!response.ok) return null;
  const body = (await response.json()) as { result?: { addressMatches?: Match[] } };
  const { x, y } = body.result?.addressMatches?.[0]?.coordinates ?? {};
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { latitude: Math.round(y * 1e6) / 1e6, longitude: Math.round(x * 1e6) / 1e6 };
}

export async function placeOf(address: {
  street: string;
  city: string;
  state: string;
  zip: string;
}): Promise<Place | null> {
  if (process.env.GEOCODER === "off") return null;
  const street = address.street.trim();
  if (!street) return null;
  try {
    // By its parts first; then as one line, which forgives a ZIP or city a
    // little off.
    return (
      (await ask("address", { street, city: address.city, state: address.state, zip: address.zip })) ??
      (await ask("onelineaddress", {
        address: [street, address.city, `${address.state} ${address.zip}`.trim()].filter(Boolean).join(", "),
      }))
    );
  } catch {
    return null;
  }
}
