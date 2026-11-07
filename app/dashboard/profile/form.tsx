"use client";

import { Check } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { formatPhone, isContactPhone, phoneDigits } from "@/lib/contact";
import { BRAND_COLORS, cn } from "@/lib/format";
import { saveProfile, type ContactField, type ProfileState } from "../actions";

const PHOTO_SIZE = 256;

// Crops to a small square JPEG in the browser, small enough to store with the profile.
async function resizePhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PHOTO_SIZE;
  const side = Math.min(bitmap.width, bitmap.height);
  canvas
    .getContext("2d")!
    .drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      PHOTO_SIZE,
      PHOTO_SIZE,
    );
  return canvas.toDataURL("image/jpeg", 0.82);
}

const inputClass =
  "mt-1 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

export function ProfileForm(props: {
  fullName: string;
  brokerage: string;
  brandColor: string;
  photo: string | null;
  // Digits, or empty.
  contactPhone: string;
  contactEmail: string;
  // The phone they gave when they signed up, offered but never filled in for them.
  suggestedPhone: string;
}) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, {});
  const [photo, setPhoto] = useState(props.photo);
  const [color, setColor] = useState(props.brandColor);
  const [fullName, setFullName] = useState(props.fullName);
  const [phone, setPhone] = useState(formatPhone(props.contactPhone));
  const [photoError, setPhotoError] = useState<string | null>(null);
  const suggested = phoneDigits(props.suggestedPhone);
  const suggestion = !phone && isContactPhone(suggested) ? formatPhone(suggested) : null;
  const phoneField = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  // After a save that didn't go through, the cursor goes to what needs fixing,
  // rather than being lost with the Save button while it was busy.
  useEffect(() => {
    if (!state.error) return;
    form.current?.querySelector<HTMLInputElement>(`#${state.field ?? "fullName"}`)?.focus();
  }, [state]);
  // A mistake in one of the contact fields shows under that field.
  const invalid = (field: ContactField) =>
    state.field === field
      ? { "aria-invalid": true as const, "aria-describedby": `${field}-error contact-hint` }
      : { "aria-describedby": "contact-hint" };

  return (
    <form ref={form} action={action} className="mt-6 flex flex-col gap-5">
      <input type="hidden" name="photo" value={photo ?? ""} />
      <input type="hidden" name="brandColor" value={color} />

      <div className="flex items-center gap-4 rounded-2xl p-4 text-white" style={{ background: color }}>
        <AgentAvatar agent={{ full_name: fullName, photo_data_url: photo }} size={64} className="ring-2 ring-white/70" />
        <div className="min-w-0 flex-1">
          <label htmlFor="photo-file" className="block text-sm font-semibold">
            Your photo
          </label>
          <input
            id="photo-file"
            type="file"
            accept="image/*"
            className="mt-1 max-w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-white file:px-3 file:font-semibold file:text-stone-900"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                setPhoto(await resizePhoto(file));
                setPhotoError(null);
              } catch {
                setPhotoError("We couldn't read that image. Try a JPEG or PNG.");
              }
            }}
          />
          {photoError && <p role="alert" className="mt-1 text-sm">{photoError}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="fullName" className="text-sm font-medium">
          Full name
        </label>
        <input
          id="fullName"
          name="fullName"
          required
          maxLength={80}
          autoComplete="name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="brokerage" className="text-sm font-medium">
          Company (brokerage)
        </label>
        <input
          id="brokerage"
          name="brokerage"
          maxLength={80}
          autoComplete="organization"
          defaultValue={state.values?.brokerage ?? props.brokerage}
          aria-describedby="brokerage-hint"
          className={inputClass}
        />
        <p id="brokerage-hint" className="mt-1 text-sm text-stone-600">
          Optional. A brokerage, team or company, if you work with one.
        </p>
      </div>

      <div>
        <label htmlFor="contactPhone" className="text-sm font-medium">
          Phone for clients (optional)
        </label>
        <input
          ref={phoneField}
          id="contactPhone"
          name="contactPhone"
          type="tel"
          inputMode="tel"
          maxLength={30}
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          {...invalid("contactPhone")}
          className={cn(inputClass, "aria-invalid:border-red-600")}
        />
        {suggestion && (
          <button
            type="button"
            onClick={() => {
              setPhone(suggestion);
              // The button goes once it's used; the cursor carries on in the field.
              phoneField.current?.focus();
            }}
            className="mt-1 min-h-11 rounded-full px-1 text-sm font-semibold text-brand underline-offset-2 hover:underline"
          >
            Use {suggestion}
          </button>
        )}
        {state.field === "contactPhone" && (
          <p id="contactPhone-error" role="alert" className="mt-1 text-sm text-red-700">
            {state.error}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="contactEmail" className="text-sm font-medium">
          Email for clients (optional)
        </label>
        <input
          id="contactEmail"
          name="contactEmail"
          type="email"
          maxLength={254}
          autoComplete="email"
          defaultValue={state.values?.contactEmail ?? props.contactEmail}
          {...invalid("contactEmail")}
          className={cn(inputClass, "aria-invalid:border-red-600")}
        />
        {state.field === "contactEmail" && (
          <p id="contactEmail-error" role="alert" className="mt-1 text-sm text-red-700">
            {state.error}
          </p>
        )}
        <p id="contact-hint" className="mt-1 text-sm text-stone-600">
          Shown on your links so clients can text, call or email you.
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Brand color</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {BRAND_COLORS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-label={option.name}
              aria-pressed={color === option.value}
              onClick={() => setColor(option.value)}
              style={{ background: option.value }}
              className={cn(
                "flex size-11 items-center justify-center rounded-full text-white",
                color === option.value && "ring-2 ring-stone-900 ring-offset-2",
              )}
            >
              {color === option.value && <Check aria-hidden size={18} />}
            </button>
          ))}
        </div>
      </fieldset>

      {state.error && !state.field && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        style={{ background: color }}
        className="min-h-12 rounded-xl font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
