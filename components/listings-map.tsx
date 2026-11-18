"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MapHome } from "@/components/listing-map";

// The map draws with WebGL in the browser, so it never renders on the server.
const ListingMap = dynamic(() => import("@/components/listing-map"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-stone-200" />,
});

// Where an agent's listings are, under the listings themselves: each a price
// on the map, opening that home full screen as its photo above does.
export function ListingsMap({ homes, from }: { homes: MapHome[]; from: string }) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <section aria-labelledby="listings-map-title" className="mt-8">
      <h2 id="listings-map-title" className="px-1 text-lg font-semibold">
        Map
      </h2>
      <div className="mt-2 h-80 overflow-hidden rounded-2xl bg-stone-200 ring-1 ring-stone-200 sm:h-[26rem]">
        <ListingMap
          homes={homes}
          activeKey={null}
          hoveredKey={hovered}
          onHover={setHovered}
          onSelect={(key) => router.push(`/reel?${new URLSearchParams({ from, home: key })}`)}
          // In a page that scrolls: one finger scrolls the page, two move the map.
          cooperative
        />
      </div>
    </section>
  );
}
