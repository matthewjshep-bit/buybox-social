"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { getVersion, setWorkerUrl } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
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

// Zoomed out, homes are dots so nearby ones don't pile up; prices appear closer in.
const PRICE_ZOOM = 10;

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
  const [zoom, setZoom] = useState(0);
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

  return (
    <Map
      ref={map}
      initialViewState={{ bounds, fitBoundsOptions: { padding: 60, maxZoom: 13 } }}
      mapStyle={MAP_STYLE}
      style={{ width: "100%", height: "100%" }}
      attributionControl={{ compact: true }}
      onZoom={(event) => setZoom(event.viewState.zoom)}
      onLoad={(event) => setZoom(event.target.getZoom())}
    >
      <NavigationControl position="top-right" showCompass={false} />
      {homes.map((home) => {
        const showing = home.key === activeKey;
        const lit = showing || home.key === hoveredKey;
        const asDot = zoom < PRICE_ZOOM && !lit;
        return (
          <Marker
            key={home.key}
            longitude={home.longitude}
            latitude={home.latitude}
            anchor="bottom"
            style={{ zIndex: showing ? 3 : lit ? 2 : 1 }}
          >
            <button
              type="button"
              aria-label={`${home.address}, ${formatPrice(home.price)}`}
              aria-pressed={showing}
              onMouseEnter={() => onHover(home.key)}
              onMouseLeave={() => onHover(null)}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(home.key);
              }}
              className={cn(
                "transition-transform",
                // A dot keeps a 24px target around its smaller visible circle.
                asDot
                  ? "flex size-6 items-center justify-center hover:scale-125"
                  : "rounded-full px-2.5 py-1 text-xs font-bold tabular-nums shadow-md ring-1",
                !asDot && (lit ? "scale-110 bg-brand text-white ring-white" : "bg-white text-stone-900 ring-stone-300"),
              )}
            >
              {asDot ? (
                <span aria-hidden className="block size-4 rounded-full bg-brand shadow-md ring-2 ring-white" />
              ) : (
                shortPrice(home.price)
              )}
            </button>
          </Marker>
        );
      })}
    </Map>
  );
}
