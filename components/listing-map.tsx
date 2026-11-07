"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { getVersion, setWorkerUrl } from "maplibre-gl";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, NavigationControl, type MapRef } from "react-map-gl/maplibre";
import { cn, formatPrice } from "@/lib/format";

export type MapHome = {
  key: string;
  latitude: number;
  longitude: number;
  price: number;
  address: string;
};

// Free OpenStreetMap-based tiles from OpenFreeMap: no API key and no per-view billing.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

// See scripts/copy-map-worker.mjs.
setWorkerUrl(`/vendor/maplibre-gl-worker-${getVersion()}.mjs`);

// Zoomed out, the price chips get smaller so nearby ones pile up less.
const CLOSE_ZOOM = 10;

const shortPrice = (price: number) =>
  price >= 1_000_000
    ? `$${(price / 1_000_000).toFixed(price >= 10_000_000 ? 0 : 2).replace(/\.?0+$/, "")}M`
    : `$${Math.round(price / 1000)}K`;

function boundsOf(homes: MapHome[]): [[number, number], [number, number]] {
  const lngs = homes.map((h) => h.longitude);
  const lats = homes.map((h) => h.latitude);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

// Washington state, for when nothing matches.
const WASHINGTON: [[number, number], [number, number]] = [
  [-124.8, 45.5],
  [-116.9, 49.0],
];

// Where a chip's middle sits, from its home's point on the map. Right above
// the point is { x: 0, y: -height / 2 }; anywhere else, it has moved.
type Offset = { x: number; y: number; moved?: boolean };
type Box = { left: number; top: number; right: number; bottom: number };

const GAP = 2;
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// Chips that would cover each other move apart, each to the nearest free
// place, keeping a line back to its home, so every price can be read and
// tapped. Homes further north are placed first; the rest find room around them.
function arrange(
  chips: { key: string; x: number; y: number; w: number; h: number }[],
  view: { width: number; height: number },
): Record<string, Offset> {
  // The zoom buttons sit in the top right corner.
  const blocked: Box[] = [{ left: view.width - 48, top: 0, right: view.width, bottom: 80 }];
  const inView = (box: Box) => box.left >= 4 && box.top >= 4 && box.right <= view.width - 4 && box.bottom <= view.height - 4;
  const placed: Box[] = [];
  const offsets: Record<string, Offset> = {};
  for (const chip of [...chips].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const home = { x: 0, y: -chip.h / 2 };
    const boxAt = (o: Offset): Box => ({
      left: chip.x + o.x - chip.w / 2 - GAP,
      top: chip.y + o.y - chip.h / 2 - GAP,
      right: chip.x + o.x + chip.w / 2 + GAP,
      bottom: chip.y + o.y + chip.h / 2 + GAP,
    });
    // Other homes' points stay uncovered by a chip that has moved.
    const points = chips
      .filter((other) => other.key !== chip.key)
      .map((other): Box => ({ left: other.x - 4, top: other.y - 4, right: other.x + 4, bottom: other.y + 4 }));
    const free = (o: Offset, moved: boolean) => {
      const box = boxAt(o);
      if (placed.some((b) => overlaps(b, box))) return false;
      if (!moved) return true;
      return inView(box) && !blocked.some((b) => overlaps(b, box)) && !points.some((b) => overlaps(b, box));
    };
    let best: Offset = home;
    // A home off the edge of the map keeps its chip where it is.
    if (!free(home, false) && inView(boxAt(home))) {
      const steps = { x: chip.w / 2 + GAP, y: chip.h + GAP };
      const tries: Offset[] = [];
      for (let i = -4; i <= 4; i++) {
        for (let j = -4; j <= 4; j++) {
          if (i || j) tries.push({ x: home.x + i * steps.x, y: home.y + j * steps.y });
        }
      }
      tries.sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y));
      const found = tries.find((o) => free(o, true));
      if (found) best = { ...found, moved: true };
    }
    offsets[chip.key] = best;
    placed.push(boxAt(best));
  }
  return offsets;
}

// Every home in the search as a pin. The one showing beside the map is
// highlighted, and the map follows it when it's out of view.
export default function ListingMap({
  homes,
  activeKey,
  hoveredKey,
  onHover,
  onSelect,
}: {
  homes: MapHome[];
  // The home showing beside the map.
  activeKey: string | null;
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
  onSelect: (key: string) => void;
}) {
  const map = useRef<MapRef>(null);
  const chips = useRef(new globalThis.Map<string, HTMLButtonElement>());
  const [zoom, setZoom] = useState(0);
  // Bumped each time the map comes to rest, to lay the chips out again.
  const [rested, setRested] = useState(0);
  const [offsets, setOffsets] = useState<Record<string, Offset>>({});
  const bounds = useMemo(() => (homes.length ? boundsOf(homes) : WASHINGTON), [homes]);

  // Re-frame the map whenever the results change.
  useEffect(() => {
    map.current?.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 400 });
  }, [bounds]);

  // Keep the home showing beside the map in view.
  const active = homes.find((h) => h.key === activeKey);
  useEffect(() => {
    const current = map.current;
    if (!current || !active) return;
    if (!current.getBounds().contains([active.longitude, active.latitude])) {
      current.easeTo({ center: [active.longitude, active.latitude], duration: 500 });
    }
  }, [active]);

  // Once the map is still, the chips find room. Laid out from the chips'
  // drawn sizes, before the page paints.
  useLayoutEffect(() => {
    const current = map.current;
    if (!current || !rested) return;
    const container = current.getContainer();
    const next = arrange(
      homes.flatMap((home) => {
        const chip = chips.current.get(home.key);
        if (!chip) return [];
        const point = current.project([home.longitude, home.latitude]);
        return [{ key: home.key, x: point.x, y: point.y, w: chip.offsetWidth, h: chip.offsetHeight }];
      }),
      { width: container.clientWidth, height: container.clientHeight },
    );
    setOffsets((was) => (JSON.stringify(was) === JSON.stringify(next) ? was : next));
  }, [homes, rested]);

  return (
    <Map
      ref={map}
      initialViewState={{ bounds, fitBoundsOptions: { padding: 60, maxZoom: 13 } }}
      mapStyle={MAP_STYLE}
      style={{ width: "100%", height: "100%" }}
      attributionControl={{ compact: true }}
      onZoom={(event) => setZoom(event.viewState.zoom)}
      onLoad={(event) => {
        setZoom(event.target.getZoom());
        setRested((n) => n + 1);
      }}
      onMoveEnd={() => setRested((n) => n + 1)}
      onResize={() => setRested((n) => n + 1)}
    >
      <NavigationControl position="top-right" showCompass={false} />
      {homes.map((home) => {
        const showing = home.key === activeKey;
        const lit = showing || home.key === hoveredKey;
        const far = zoom < CLOSE_ZOOM;
        const offset = offsets[home.key];
        return (
          <Marker
            key={home.key}
            longitude={home.longitude}
            latitude={home.latitude}
            anchor="center"
            style={{ zIndex: showing ? 3 : lit ? 2 : 1 }}
          >
            <div className="relative size-0">
              {/* A chip moved to make room keeps a line to its home. */}
              {offset?.moved && (
                <>
                  <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
                    <line
                      x1="0"
                      y1="0"
                      x2={offset.x}
                      y2={offset.y}
                      strokeWidth="1.5"
                      className={lit ? "stroke-brand" : "stroke-stone-500"}
                    />
                  </svg>
                  <span
                    aria-hidden
                    className={cn(
                      "absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white",
                      lit ? "bg-brand" : "bg-stone-700",
                    )}
                  />
                </>
              )}
              {/* Every home shows its price, as on the big listing sites. Its
                  name starts with the price it shows, then the full one. */}
              <button
                ref={(chip) => {
                  if (chip) chips.current.set(home.key, chip);
                  else chips.current.delete(home.key);
                }}
                type="button"
                aria-label={`${shortPrice(home.price)}, ${home.address}, ${formatPrice(home.price)}`}
                aria-pressed={showing}
                onMouseEnter={() => onHover(home.key)}
                onMouseLeave={() => onHover(null)}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(home.key);
                }}
                style={offset ? { left: offset.x, top: offset.y } : { left: 0, top: 0 }}
                className={cn(
                  "absolute flex min-h-6 -translate-x-1/2 items-center whitespace-nowrap rounded-full font-bold tabular-nums shadow-md ring-1 transition-[scale,left,top] duration-200",
                  // Before it's laid out: right above its home.
                  !offset && "-translate-y-full",
                  offset && "-translate-y-1/2",
                  far ? "px-2 text-[11px]" : "px-2.5 py-1 text-xs",
                  lit ? "scale-110 bg-brand text-white ring-white" : "bg-white text-ink ring-stone-300 hover:scale-110",
                )}
              >
                {shortPrice(home.price)}
              </button>
            </div>
          </Marker>
        );
      })}
    </Map>
  );
}
