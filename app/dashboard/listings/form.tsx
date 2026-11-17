"use client";

import { Check, ImagePlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/format";
import { listingPhoto } from "@/lib/resize-photo";
import { button, field } from "@/lib/ui";
import { addListingPhoto, createListing, saveListing, type ListingField, type ListingState } from "./actions";

export type ListingValues = {
  address: string;
  city: string;
  state: string;
  zip: string;
  price: string;
  beds: string;
  baths: string;
  sqft: string;
  about: string;
  shown: boolean;
  // No longer available: sold, or the deal done.
  closed: boolean;
  // The optional ones: empty, they aren't shown on the listing.
  yearBuilt: string;
  arv: string;
  rehab: string;
  // Whether the price per square foot shows.
  perSqft: boolean;
};

const inputClass = cn(field(), "mt-1");

// What a listing is: where, how much, how big, a few words, and whether it's
// on their profile. Shared by adding one and changing one. Something wrong
// is marked on its field.
function Fields({ values, state }: { values: ListingValues; state: ListingState }) {
  const text = (
    name: Exclude<ListingField, "about">,
    label: string,
    extra: { inputMode?: "numeric"; autoComplete?: string; maxLength?: number; className?: string; optional?: boolean } = {},
  ) => (
    <div className={extra.className}>
      <label htmlFor={name} className="block text-sm font-semibold">
        {label}
      </label>
      <input
        id={name}
        name={name}
        defaultValue={values[name]}
        required={!extra.optional}
        inputMode={extra.inputMode}
        autoComplete={extra.autoComplete ?? "off"}
        maxLength={extra.maxLength ?? 120}
        aria-invalid={state.field === name ? true : undefined}
        aria-describedby={state.field === name ? "listing-error" : undefined}
        className={inputClass}
      />
    </div>
  );
  return (
    <>
      {text("address", "Street address", { autoComplete: "street-address" })}
      <div className="grid grid-cols-6 gap-3">
        {text("city", "City", { className: "col-span-6 sm:col-span-3", maxLength: 60 })}
        {text("state", "State", { className: "col-span-2 sm:col-span-1", maxLength: 2 })}
        {text("zip", "ZIP", { className: "col-span-4 sm:col-span-2", inputMode: "numeric", maxLength: 5 })}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {text("price", "Price", { inputMode: "numeric", maxLength: 14 })}
        {text("beds", "Beds", { inputMode: "numeric", maxLength: 3 })}
        {text("baths", "Baths", { inputMode: "numeric", maxLength: 3 })}
        {text("sqft", "Sq ft", { inputMode: "numeric", maxLength: 8 })}
      </div>
      <div>
        <label htmlFor="about" className="block text-sm font-semibold">
          Description
        </label>
        <textarea
          id="about"
          name="about"
          rows={4}
          maxLength={2000}
          defaultValue={values.about}
          aria-invalid={state.field === "about" ? true : undefined}
          className={cn(field({ lines: true }), "mt-1")}
        />
      </div>
      {/* What else the listing says: each shows only when it's filled in, and
          the price per square foot only when it's ticked. */}
      <fieldset className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
        <legend className="px-1 text-sm font-semibold">More to show (optional)</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {text("arv", "After repair value", { inputMode: "numeric", maxLength: 14, optional: true })}
          {text("rehab", "Estimated rehab", { inputMode: "numeric", maxLength: 14, optional: true })}
          {text("yearBuilt", "Year built", { inputMode: "numeric", maxLength: 4, optional: true })}
        </div>
        <label className="mt-3 flex min-h-11 items-center gap-3 text-body">
          <input type="checkbox" name="perSqft" defaultChecked={values.perSqft} className="size-5 accent-brand" />
          Show price per sq ft
        </label>
      </fieldset>
      {/* Whether it can still be had: a closed one stays on their profile, marked. */}
      <fieldset>
        <legend className="text-sm font-semibold">Status</legend>
        <div className="mt-1 flex gap-2">
          {(
            [
              ["available", "Available"],
              ["closed", "Closed"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-body font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40"
            >
              <input
                type="radio"
                name="status"
                value={value}
                defaultChecked={values.closed === (value === "closed")}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex min-h-11 items-center gap-3 text-body">
        <input type="checkbox" name="shown" defaultChecked={values.shown} className="size-5 accent-brand" />
        Show on my profile
      </label>
      {state.error && (
        <p id="listing-error" role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
    </>
  );
}

// One of their listings, changed. A save that doesn't go through says why,
// puts the cursor on the field, and keeps what was typed.
export function ListingForm({ listingKey, values: stored }: { listingKey: string; values: ListingValues }) {
  const [state, action, pending] = useActionState<ListingState, FormData>(saveListing.bind(null, listingKey), {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error && state.field) form.current?.querySelector<HTMLElement>(`#${state.field}`)?.focus();
  }, [state]);
  return (
    <form ref={form} action={action} aria-label="Listing details" className="flex flex-col gap-4">
      <Fields values={state.values ?? stored} state={state} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={button({ kind: "primary", size: "lg" })}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state.saved && !pending && (
          <p role="status" className="flex items-center gap-1 text-meta font-semibold text-emerald-700">
            <Check aria-hidden size={14} /> Saved
          </p>
        )}
      </div>
    </form>
  );
}

const EMPTY: ListingValues = {
  address: "",
  city: "",
  state: "WA",
  zip: "",
  price: "",
  beds: "",
  baths: "",
  sqft: "",
  about: "",
  shown: true,
  closed: false,
  yearBuilt: "",
  arv: "",
  rehab: "",
  perSqft: true,
};

// A new listing, in one go: its photos (several at once, the first one
// leading) and what it is, then one button. The listing is made first and
// its photos follow one by one, with how far along it is; then it's back to
// their listings, where it is. With no photo it's kept, and says it needs one
// to show on their profile.
export function NewListingForm({ most }: { most: number }) {
  const router = useRouter();
  const [state, setState] = useState<ListingState>({});
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const fileId = useId();

  useEffect(() => {
    if (state.error && state.field) form.current?.querySelector<HTMLElement>(`#${state.field}`)?.focus();
  }, [state]);

  const submit = (data: FormData) =>
    startTransition(async () => {
      setProgress(null);
      const made = await createListing(data);
      if (!made.key) return setState(made);
      let failed = 0;
      for (const [i, photo] of photos.entries()) {
        setProgress(`Adding photo ${i + 1} of ${photos.length}…`);
        try {
          const ready = await listingPhoto(photo.file);
          if ((await addListingPhoto(made.key, ready.dataUrl, ready.width, ready.height)).error) failed++;
        } catch {
          failed++;
        }
      }
      // Any photo that didn't make it can be added again on the listing's own page.
      router.push(failed ? `/dashboard/listings/${made.key}` : "/dashboard/listings");
    });

  return (
    <form
      ref={form}
      aria-label="Listing details"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
    >
      <div>
        <p className="text-sm font-semibold">Photos</p>
        {photos.length > 0 && (
          <ul aria-label="Photos to add" className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photos.map((photo, i) => (
              <li key={photo.url} className="relative">
                {/* A photo still on their device, shown as it is. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={`Photo ${i + 1}`}
                  className={cn("aspect-[4/3] w-full rounded-xl bg-stone-200 object-cover", i === 0 && "ring-2 ring-brand")}
                />
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => {
                    URL.revokeObjectURL(photo.url);
                    setPhotos((now) => now.filter((other) => other !== photo));
                  }}
                  className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X aria-hidden size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label
          htmlFor={fileId}
          aria-disabled={pending || photos.length >= most}
          className={cn(
            button({ kind: "secondary", size: "lg" }),
            "mt-2 cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
          )}
        >
          <ImagePlus aria-hidden size={18} /> Add photos
          <input
            id={fileId}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={pending || photos.length >= most}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              setPhotos((now) => [...now, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, most));
            }}
          />
        </label>
      </div>
      <Fields values={state.values ?? EMPTY} state={state} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={button({ kind: "primary", size: "lg" })}>
          {pending ? "Adding…" : "Add listing"}
        </button>
        {progress && (
          <p role="status" className="text-meta text-muted">
            {progress}
          </p>
        )}
      </div>
    </form>
  );
}
