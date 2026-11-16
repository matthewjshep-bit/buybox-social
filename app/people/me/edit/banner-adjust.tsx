"use client";

import { ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  BANNER_FRAME,
  BANNER_HEIGHT,
  BANNER_WIDTH,
  BANNER_ZOOM_MOST,
  bannerZoomLeast,
  clampFrame,
  drawBanner,
  loadImage,
  renderBanner,
  type BannerFrame,
} from "@/lib/resize-photo";
import { button } from "@/lib/ui";

// Your own banner image, moved and resized: drag it (or use the arrow keys)
// to say which part shows, and the slider for how large it is, down to the
// whole image with room around it (a logo). A dashed circle marks where your
// photo sits over the band on your profile, so nothing that matters ends up
// under it. Nothing is saved until Save.
export function BannerAdjust({
  source,
  frame,
  pending,
  onSave,
  onCancel,
}: {
  // The image as it was added.
  source: string;
  // How it's framed now, as stored (anything else: the middle, filling the band).
  frame: unknown;
  pending: boolean;
  onSave: (image: string, frame: BannerFrame) => void;
  onCancel: () => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [at, setAt] = useState<BannerFrame>(BANNER_FRAME);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const sizeId = useId();

  useEffect(() => {
    let live = true;
    loadImage(source)
      .then((loaded) => {
        if (!live) return;
        const stored = frame as Partial<BannerFrame> | null;
        const start =
          stored && [stored.x, stored.y, stored.zoom].every((n) => typeof n === "number" && Number.isFinite(n))
            ? (stored as BannerFrame)
            : BANNER_FRAME;
        setAt(clampFrame(start, loaded));
        setImage(loaded);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [source, frame]);

  useEffect(() => {
    if (image && canvas.current) drawBanner(canvas.current, image, at);
  }, [image, at]);

  if (failed) {
    return (
      <p role="alert" className="mt-3 text-sm text-red-700">
        We couldn&apos;t open that image. Add it again to move it.
      </p>
    );
  }

  // How far a move of the pointer (or a key) moves the image's middle, as a
  // part of the image: by how large the image is drawn in the box.
  const moveBy = (dx: number, dy: number) => {
    const box = canvas.current;
    if (!box || !image) return;
    const shown = box.getBoundingClientRect();
    const scale = Math.max(shown.width / image.width, shown.height / image.height) * at.zoom;
    setAt((now) => clampFrame({ ...now, x: now.x - dx / (image.width * scale), y: now.y - dy / (image.height * scale) }, image));
  };
  const least = image ? bannerZoomLeast(image) : 1;

  return (
    <div className="mt-3">
      <div
        tabIndex={0}
        role="group"
        aria-label="Your banner image. Drag it, or use the arrow keys, to move it."
        onKeyDown={(event) => {
          const step = event.shiftKey ? 40 : 10;
          const by: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          const move = by[event.key];
          if (!move) return;
          event.preventDefault();
          moveBy(move[0], move[1]);
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          moveBy(event.clientX - drag.current.x, event.clientY - drag.current.y);
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        className="relative cursor-grab touch-none select-none overflow-hidden rounded-xl bg-stone-200 ring-1 ring-stone-300 active:cursor-grabbing"
        style={{ aspectRatio: `${BANNER_WIDTH} / ${BANNER_HEIGHT}` }}
      >
        <canvas ref={canvas} width={BANNER_WIDTH} height={BANNER_HEIGHT} className="block size-full" />
        {/* Where your photo sits on your profile: over the band's lower left. */}
        <span
          aria-hidden
          // (Drawn at its largest, as on a phone: a dark ring under a white dashed one, to show on any image.)
          className="pointer-events-none absolute left-[3.5%] top-[61%] aspect-square h-[78%] rounded-full bg-black/15 outline outline-2 outline-black/50 [outline-offset:-2px] border-2 border-dashed border-white"
        />
      </div>
      <p className="mt-1.5 text-meta text-muted">Drag to move. The circle is where your photo sits.</p>
      <div className="mt-2 flex items-center gap-2">
        <ZoomOut aria-hidden size={18} className="shrink-0 text-stone-500" />
        <label htmlFor={sizeId} className="sr-only">
          Size
        </label>
        <input
          id={sizeId}
          type="range"
          min={least}
          max={BANNER_ZOOM_MOST}
          step={0.01}
          value={at.zoom}
          disabled={!image}
          onChange={(event) => image && setAt((now) => clampFrame({ ...now, zoom: Number(event.target.value) }, image))}
          className="h-11 min-w-0 flex-1 accent-brand"
        />
        <ZoomIn aria-hidden size={18} className="shrink-0 text-stone-500" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !image}
          onClick={() => image && onSave(renderBanner(image, at), at)}
          className={button({ kind: "primary" })}
        >
          {pending ? "Saving…" : "Save banner"}
        </button>
        <button type="button" disabled={pending} onClick={onCancel} className={button({ kind: "ghost" })}>
          Cancel
        </button>
      </div>
    </div>
  );
}
