"use client";

import { Camera, Check } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { formatPhone, isContactPhone, phoneDigits } from "@/lib/contact";
import { BRAND_COLORS, cn } from "@/lib/format";
import { resizePhoto } from "@/lib/resize-photo";
import { button, field } from "@/lib/ui";
import { saveProfile, type ContactField, type ProfileState } from "../actions";

const inputClass = cn(field(), "mt-1");

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
  // Their MLS ID, or empty: which listings are theirs.
  mlsAgentId: string;
  // Among their other profile settings (Edit profile): their photo has its
  // own place there, saving stays on the page, and the button says what it saves.
  embedded?: boolean;
  // A new agent's first screen: who they are (photo, name, company, colour)
  // and no more. How clients reach them and their MLS ID aren't asked; they're
  // in Edit profile, where this form shows whole.
  firstRun?: boolean;
}) {
  const embedded = props.embedded ?? false;
  const firstRun = props.firstRun ?? false;
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfile, {});
  const [photo, setPhoto] = useState(props.photo);
  const [color, setColor] = useState(props.brandColor);
  const [fullName, setFullName] = useState(props.fullName);
  const [phone, setPhone] = useState(formatPhone(props.contactPhone));
  const [photoError, setPhotoError] = useState<string | null>(null);
  const suggested = phoneDigits(props.suggestedPhone);
  const suggestion = !phone && isContactPhone(suggested) ? formatPhone(suggested) : null;
  const phoneField = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
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
    <form ref={form} action={action} aria-label="Your details" className={cn("flex flex-col gap-5", !embedded && "mt-6")}>
      {/* (With no photo sent, the one they have is kept.) */}
      {embedded ? <input type="hidden" name="stay" value="1" /> : <input type="hidden" name="photo" value={photo ?? ""} />}
      <input type="hidden" name="brandColor" value={color} />

      {!embedded && (
        <div className="flex items-center gap-4 rounded-2xl p-4 text-white" style={{ background: color }}>
          <AgentAvatar agent={{ full_name: fullName, photo_data_url: photo }} size={64} className="ring-2 ring-white/70" />
          <div className="min-w-0 flex-1">
            <label htmlFor="photo-file" className="block text-sm font-semibold">
              Your photo
            </label>
            {/* The browser's own file box says "Choose File" and "No file
                chosen", even beside a photo; this button says it in our words. */}
            <input
              ref={fileInput}
              id="photo-file"
              type="file"
              accept="image/*"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                // So picking the same file again still counts.
                event.target.value = "";
                if (!file) return;
                try {
                  setPhoto(await resizePhoto(file));
                  setPhotoError(null);
                } catch {
                  setPhotoError("We couldn't read that image. Try a JPEG or PNG.");
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className={cn(button({ kind: "light" }), "mt-1.5")}
            >
              <Camera aria-hidden size={16} />
              {photo ? "Change photo" : "Add a photo"}
            </button>
            {photoError && <p role="alert" className="mt-1 text-sm">{photoError}</p>}
          </div>
        </div>
      )}

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
          Company (optional)
        </label>
        <input
          id="brokerage"
          name="brokerage"
          maxLength={80}
          autoComplete="organization"
          defaultValue={state.values?.brokerage ?? props.brokerage}
          className={inputClass}
        />
      </div>

      {firstRun ? (
        // Not asked the first time: saved empty, as if left blank.
        <>
          <input type="hidden" name="contactPhone" value="" />
          <input type="hidden" name="contactEmail" value="" />
          <input type="hidden" name="mlsAgentId" value="" />
        </>
      ) : (
        <>
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
              className={inputClass}
            />
            {suggestion && (
              <button
                type="button"
                onClick={() => {
                  setPhone(suggestion);
                  // The button goes once it's used; the cursor carries on in the field.
                  phoneField.current?.focus();
                }}
                className={cn(button({ kind: "ghost", flush: true }), "mt-1 text-brand")}
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
              className={inputClass}
            />
            {state.field === "contactEmail" && (
              <p id="contactEmail-error" role="alert" className="mt-1 text-sm text-red-700">
                {state.error}
              </p>
            )}
            <p id="contact-hint" className="mt-1 text-sm text-muted">
              Your phone and email show on your public profile and on the links you send.
            </p>
          </div>

          <div>
            <label htmlFor="mlsAgentId" className="text-sm font-medium">
              MLS ID (optional)
            </label>
            <input
              id="mlsAgentId"
              name="mlsAgentId"
              maxLength={20}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              defaultValue={state.values?.mlsAgentId ?? props.mlsAgentId}
              aria-invalid={state.field === "mlsAgentId" ? true : undefined}
              aria-describedby={state.field === "mlsAgentId" ? "mlsAgentId-error mlsAgentId-hint" : "mlsAgentId-hint"}
              className={inputClass}
            />
            {state.field === "mlsAgentId" && (
              <p id="mlsAgentId-error" role="alert" className="mt-1 text-sm text-red-700">
                {state.error}
              </p>
            )}
            <p id="mlsAgentId-hint" className="mt-1 text-sm text-muted">
              Shows your MLS listings.
            </p>
          </div>
        </>
      )}

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
                color === option.value && "ring-2 ring-ink ring-offset-2",
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
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          // On its own page, in the colour picked, before it's saved. On Edit
          // profile it's the site's own, like the other Save there (the
          // swatches above already show the colour picked).
          style={embedded ? undefined : { background: color }}
          className={button({ kind: "primary", size: "lg" })}
        >
          {pending ? "Saving…" : embedded ? "Save details" : "Save"}
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
