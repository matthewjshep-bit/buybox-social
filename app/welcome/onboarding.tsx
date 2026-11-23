"use client";

import { ArrowLeft, Briefcase, Camera, Check, Home, Landmark, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { BRAND_COLORS, cn } from "@/lib/format";
import { isProKind, type Kind } from "@/lib/kinds";
import { resizePhoto } from "@/lib/resize-photo";
import { button, field } from "@/lib/ui";
import { PlaceField } from "@/components/place-field";
import { chooseKind, saveColor, saveCompany, saveMlsId, saveName, savePhoto, savePlace, type StepResult } from "./actions";

type Step = "kind" | "name" | "place" | "company" | "mls" | "photo" | "color";

// The questions for someone of this kind, in order, from where they are:
// only what's still to say about them.
function stepsFor(kind: Kind | null, has: { name: boolean; place: boolean }, askKind: boolean): Step[] {
  const steps: Step[] = askKind ? ["kind"] : [];
  if (!kind) return steps;
  // (A pro's whole name is asked for even when a first name came with
  // signing up: it's the one their listings go by.)
  if (!has.name || (askKind && isProKind(kind))) steps.push("name");
  // Where they are, for everyone new: on their profile, and their feed leans near it.
  if (askKind && !has.place) steps.push("place");
  if (isProKind(kind) && askKind) {
    steps.push("company");
    if (kind === "agent") steps.push("mls");
    steps.push("photo", "color");
  }
  return steps;
}

const KIND_CHOICES: { kind: Kind; title: string; says: string; icon: ReactNode }[] = [
  { kind: "agent", title: "I'm an agent", says: "Send homes to clients. Show your listings.", icon: <Briefcase aria-hidden size={22} /> },
  { kind: "investor", title: "I'm an investor", says: "Share your deals with buyers.", icon: <TrendingUp aria-hidden size={22} /> },
  { kind: "lender", title: "I'm a lender", says: "Send homes to the people you help.", icon: <Landmark aria-hidden size={22} /> },
  { kind: "buyer", title: "I'm shopping for a home", says: "Find homes and save the ones you like.", icon: <Home aria-hidden size={22} /> },
];

const COMPANY_ASK: Record<string, string> = {
  agent: "What brokerage are you with?",
  investor: "What's your company called?",
  lender: "What company are you with?",
};

export function Onboarding(props: {
  kind: Kind | null;
  name: string;
  company: string;
  mlsId: string;
  photo: string | null;
  color: string;
  // Where they are ("Seattle, WA"), and the cities to offer as they type.
  place: string;
  places: string[];
  next: string | null;
  pro: boolean;
}) {
  const router = useRouter();
  const id = useId();
  // What's asked is settled as the page opens: each answer saved refreshes
  // the page (the bar at the top changes with it), and the questions mustn't
  // change under them as it does.
  const [askKind] = useState(props.kind === null);
  const [hadName] = useState(Boolean(props.name.trim()));
  const [hadPlace] = useState(Boolean(props.place));
  const [kind, setKind] = useState<Kind | null>(props.kind);
  const steps = stepsFor(kind, { name: hadName, place: hadPlace }, askKind);
  const [at, setAt] = useState(0);
  const step = steps[at];
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [name, setName] = useState(props.name);
  const [company, setCompany] = useState(props.company);
  const [mlsId, setMlsId] = useState(props.mlsId);
  const [photo, setPhoto] = useState(props.photo);
  const [color, setColor] = useState(props.color);
  const [place, setPlace] = useState(props.place);
  const fileInput = useRef<HTMLInputElement>(null);
  const pro = isProKind(kind);

  // Where they were going, once there's nothing more to ask: or Home, pros
  // too (their Clients is a tap away in the bar).
  const finish = () => {
    router.replace(props.next ?? "/");
    router.refresh();
  };
  // On to the next question, or, after the last, on their way.
  const forward = () => {
    setError(null);
    if (at + 1 < steps.length) return setAt(at + 1);
    finish();
  };
  const save = (work: () => Promise<StepResult>) =>
    start(async () => {
      const result = await work().catch((): StepResult => ({ ok: false, error: "That didn't save. Please try again." }));
      if (!result.ok) return setError(result.error);
      forward();
    });

  const pick = (chosen: Kind) =>
    start(async () => {
      const result = await chooseKind(chosen).catch((): StepResult => ({ ok: false, error: "That didn't save. Please try again." }));
      if (!result.ok) return setError(result.error);
      setError(null);
      setKind(chosen);
      // (Shopping, with their name given already: nothing more to ask.)
      if (stepsFor(chosen, { name: hadName, place: hadPlace }, askKind).length <= 1) return finish();
      setAt(1);
    });

  const total = steps.length;
  const choices = props.pro
    ? [...KIND_CHOICES.filter((c) => c.kind !== "buyer"), ...KIND_CHOICES.filter((c) => c.kind === "buyer")]
    : KIND_CHOICES;

  const heading: Record<Step, string> = {
    kind: "What brings you to Porchcard?",
    name: pro ? "What's your full name?" : "What's your first name?",
    place: "Where are you located?",
    company: COMPANY_ASK[kind ?? "agent"] ?? "What company are you with?",
    mls: "What's your MLS ID?",
    photo: "Add a photo of you",
    color: "Pick your color",
  };
  const hint: Record<Step, string> = {
    kind: "Pick the one that fits. You can change it later.",
    name: pro ? "It's on your profile and on every home you send." : "It shows beside your likes and comments.",
    place: "It's on your profile, and your feed shows you homes near it.",
    company: "It shows under your name. You can leave it empty.",
    mls: "Your MLS listings show on your profile. You can add it later.",
    photo: "People see it on your profile and the homes you send.",
    color: "Your profile wears it.",
  };

  if (!step) return null;
  const optional = step === "place" || step === "company" || step === "mls" || step === "photo" || (step === "name" && !pro);
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex min-h-11 items-center justify-between">
        {at > 0 ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAt(at - 1);
            }}
            className={cn(button({ kind: "ghost" }), "-ml-3 text-stone-700")}
          >
            <ArrowLeft aria-hidden size={18} /> Back
          </button>
        ) : (
          <span />
        )}
        {total > 1 && (
          <p className="text-sm font-semibold text-muted tabular-nums">
            Step {at + 1} of {total}
          </p>
        )}
      </div>
      {total > 1 && (
        <ol aria-hidden className="mt-2 flex gap-1.5">
          {steps.map((s, i) => (
            <li key={s} className={cn("h-1.5 flex-1 rounded-full", i <= at ? "bg-brand" : "bg-stone-200")} />
          ))}
        </ol>
      )}

      <h1 className="mt-8 font-display text-3xl text-balance">{heading[step]}</h1>
      <p className="mt-2 text-body text-stone-700">{hint[step]}</p>

      {step === "kind" ? (
        <div role="group" aria-label="What brings you to Porchcard?" className="mt-6 flex flex-col gap-3">
          {choices.map((choice) => (
            <button
              key={choice.kind}
              type="button"
              disabled={pending}
              aria-pressed={kind === choice.kind}
              onClick={() => pick(choice.kind)}
              className={cn(
                "flex min-h-16 items-center gap-4 rounded-2xl bg-surface p-4 text-left ring-1 ring-stone-200 transition hover:ring-stone-400",
                kind === choice.kind && "ring-2 ring-brand",
              )}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-stone-100 text-ink">{choice.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold">{choice.title}</span>
                <span className="block text-sm text-muted">{choice.says}</span>
              </span>
            </button>
          ))}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      ) : (
        <form
          aria-label={heading[step]}
          className="mt-6 flex flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (step === "name") save(() => saveName(name));
            else if (step === "place") save(() => savePlace(place));
            else if (step === "company") save(() => saveCompany(company));
            else if (step === "mls") save(() => saveMlsId(mlsId));
            else if (step === "photo") save(async () => (photo ? savePhoto(photo) : { ok: true }));
            else if (step === "color") save(() => saveColor(color));
          }}
        >
          {(step === "name" || step === "company" || step === "mls") && (
            <>
              <label htmlFor={`${id}-${step}`} className="text-sm font-medium">
                {step === "name" ? (pro ? "Full name" : "First name") : step === "company" ? "Company" : "MLS ID"}
              </label>
              <input
                key={step}
                id={`${id}-${step}`}
                autoFocus
                required={step === "name"}
                maxLength={step === "mls" ? 20 : 80}
                autoComplete={step === "name" ? (pro ? "name" : "given-name") : step === "company" ? "organization" : "off"}
                value={step === "name" ? name : step === "company" ? company : mlsId}
                onChange={(event) =>
                  (step === "name" ? setName : step === "company" ? setCompany : setMlsId)(event.target.value)
                }
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? errorId : undefined}
                className={cn(field(), "mt-1")}
              />
            </>
          )}

          {step === "place" && (
            <PlaceField
              value={place}
              onChange={setPlace}
              places={props.places}
              invalid={Boolean(error)}
              describedBy={error ? errorId : undefined}
              autoFocus
            />
          )}

          {step === "photo" && (
            <div className="flex items-center gap-4">
              <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-stone-200 text-2xl font-semibold text-stone-600">
                {photo ? (
                  // A small JPEG made right here, in the browser.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="Your photo" className="size-full object-cover" />
                ) : (
                  (name.trim()[0] ?? "?").toUpperCase()
                )}
              </span>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                aria-label="Your photo"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  try {
                    setPhoto(await resizePhoto(file));
                    setError(null);
                  } catch {
                    setError("We couldn't read that image. Try a JPEG or PNG.");
                  }
                }}
              />
              <button type="button" onClick={() => fileInput.current?.click()} className={button({ kind: "secondary", size: "lg" })}>
                <Camera aria-hidden size={18} /> {photo ? "Change photo" : "Choose a photo"}
              </button>
            </div>
          )}

          {step === "color" && (
            <div role="group" aria-label="Colors" className="flex flex-wrap gap-3">
              {BRAND_COLORS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-label={option.name}
                  aria-pressed={color === option.value}
                  onClick={() => setColor(option.value)}
                  style={{ background: option.value }}
                  className={cn(
                    "flex size-12 items-center justify-center rounded-full text-white",
                    color === option.value && "ring-2 ring-ink ring-offset-2",
                  )}
                >
                  {color === option.value && <Check aria-hidden size={20} />}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p id={errorId} role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mt-auto flex flex-col gap-2 pt-8">
            <button type="submit" disabled={pending} className={button({ kind: "primary", size: "lg", block: true })}>
              {pending ? "Saving…" : at + 1 === total ? "Finish" : "Continue"}
            </button>
            {optional && (
              <button
                type="button"
                disabled={pending}
                onClick={forward}
                className={cn(button({ kind: "ghost", block: true }), "text-stone-700")}
              >
                Skip
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
