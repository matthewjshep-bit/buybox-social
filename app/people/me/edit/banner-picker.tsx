"use client";

import { Check, ImagePlus, Move } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { setMyBanner } from "@/app/people/[id]/actions";
import { Banner } from "@/components/banner";
import { BRAND_SCENES, WARM_SCENES } from "@/components/banner-art";
import type { BannerChoice } from "@/lib/banner";
import { cn } from "@/lib/format";
import { BANNER_FRAME, bannerSource, renderBanner, type BannerFrame } from "@/lib/resize-photo";
import { button } from "@/lib/ui";
import { BannerAdjust } from "./banner-adjust";

// The band across the top of your profile, yours to choose: your own image
// (an agent's branding), nothing at all, or one of the drawn scenes (an
// agent's four in their own colour first). It's set once and seldom again,
// so the page shows only what's on now and "Change banner"; the choices open
// from there. One tap saves it; the one that's on has a tick. Your own image
// can be moved and resized in the band ("Move or resize": banner-adjust.tsx),
// which opens by itself just after one is added.
export function BannerPicker({
  seed,
  brand,
  choice,
  frame,
  agent,
}: {
  seed: string;
  brand: string | null;
  choice: BannerChoice;
  // How their own image is framed in the band, as stored.
  frame: unknown;
  // An agent's scenes take their colour, set on Your brand.
  agent: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  // Moving and resizing their own image; `n` gives each opening the image afresh.
  const [adjusting, setAdjusting] = useState<{ n: number } | null>(null);
  const fileId = useId();
  const listId = useId();

  const save = (style: string, image?: string, source?: string, framed?: BannerFrame, then?: () => void) =>
    startTransition(async () => {
      setSaved(false);
      const result = await setMyBanner(style, image, source, framed);
      setError(result.ok ? null : result.error);
      setSaved(result.ok);
      if (result.ok) then?.();
    });

  const options: { style: string; name: string }[] = [
    ...(choice.image ? [{ style: "image", name: "Your image" }] : []),
    { style: "blank", name: "Blank" },
    ...(brand ? BRAND_SCENES.map((style, i) => ({ style, name: `Your color, scene ${i + 1}` })) : []),
    ...WARM_SCENES.map((style, i) => ({ style, name: `Scene ${i + 1}` })),
  ];

  return (
    <div>
      {/* What's on now, small, and the way to change it: the choices stay out
          of sight until they're asked for. */}
      <div className="mt-3 flex items-center gap-4">
        <div aria-hidden className="h-12 w-40 shrink-0 overflow-hidden rounded-xl ring-1 ring-stone-200">
          <Banner seed={seed} brand={brand} choice={choice} />
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => setOpen((now) => !now)}
          className={button({ kind: "secondary" })}
        >
          {open ? "Done" : "Change banner"}
        </button>
        {saved && !pending && !error && (
          <p role="status" className="flex items-center gap-1 text-meta font-semibold text-emerald-700">
            <Check aria-hidden size={14} /> Saved
          </p>
        )}
      </div>
      {open && (
        <div id={listId}>
          <ul className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {options.map((option) => {
              const on = choice.style === option.style;
              return (
                <li key={option.style}>
                  <button
                    type="button"
                    disabled={pending}
                    aria-pressed={on}
                    aria-label={option.name}
                    onClick={() => {
                      setAdjusting(null);
                      save(option.style);
                    }}
                    className={cn(
                      "relative block h-11 w-full overflow-hidden rounded-lg ring-1 ring-stone-300 hover:ring-stone-500",
                      on && "ring-2 ring-brand hover:ring-brand",
                    )}
                  >
                    <Banner seed={seed} brand={brand} choice={{ style: option.style, image: choice.image }} />
                    {option.style === "blank" && (
                      <span className={cn("absolute inset-0 grid place-items-center text-tiny font-semibold", brand ? "text-white" : "text-stone-600")}>
                        Blank
                      </span>
                    )}
                    {on && (
                      <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-brand text-white">
                        <Check aria-hidden size={12} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <label
          htmlFor={fileId}
          aria-disabled={pending}
          className={cn(button({ kind: "secondary" }), "cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand")}
        >
          <ImagePlus aria-hidden size={16} /> {pending ? "Saving…" : choice.image ? "Change image" : "Use your own image"}
          <input
            id={fileId}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={pending}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              try {
                // On at once, filling the band from its middle; then theirs to move.
                const { canvas, dataUrl } = await bannerSource(file);
                save("image", renderBanner(canvas, BANNER_FRAME), dataUrl, BANNER_FRAME, () =>
                  setAdjusting((now) => ({ n: (now?.n ?? 0) + 1 })),
                );
              } catch {
                setError("We couldn't read that image. Try a JPEG or PNG.");
              }
            }}
          />
        </label>
            {choice.style === "image" && choice.image && !adjusting && (
              <button type="button" onClick={() => setAdjusting({ n: Date.now() })} className={button({ kind: "secondary" })}>
                <Move aria-hidden size={16} /> Move or resize
              </button>
            )}
            {agent && (
              <Link href="#details" className="inline-flex min-h-11 items-center font-semibold text-brand underline-offset-2 hover:underline">
                Change your color
              </Link>
            )}
          </div>
          {adjusting && choice.style === "image" && choice.image && (
            <BannerAdjust
              key={adjusting.n}
              source={`/people/${seed}/banner?source=1&n=${adjusting.n}`}
              frame={frame}
              pending={pending}
              onSave={(image, framed) => save("image", image, undefined, framed, () => setAdjusting(null))}
              onCancel={() => setAdjusting(null)}
            />
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
