"use client";

import { MailCheck } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { sendCode, verifyCode, type CodeState } from "@/app/login/actions";
import { cn } from "@/lib/format";
import { button, field } from "@/lib/ui";

// Signing up or in, in two short steps on the page you're on: who you are (an
// email, and a first name when you're new here), then the code we email you.
// New or returning, it's the same. No password, and nothing opens in another
// tab: the email's code is typed right here (its link works too, from any
// browser, and comes back to `next`).
export function CodeSignIn({
  withName = false,
  withPhone = false,
  suggestedName,
  asAgent = false,
  next,
  submitLabel = "Continue",
  note,
  autoFocus = false,
  label,
  nameHint,
  onDone,
}: {
  // Ask for a first name too (signing up from a page, rather than signing in).
  withName?: boolean;
  // And, optionally, a phone (the home page's form: for a call back).
  withPhone?: boolean;
  // A first name the page already knows (an agent's link for one person).
  suggestedName?: string;
  // From "For agents": an agent's account.
  asAgent?: boolean;
  // Where the email's link brings them back to.
  next?: string;
  submitLabel?: string;
  // A line under the button, before the code is sent.
  note?: React.ReactNode;
  autoFocus?: boolean;
  // What its form is called, for screen readers ("Sign up").
  label?: string;
  // The id of a line that says more about the first name ("Not Toby? Type
  // your name."), for screen readers.
  nameHint?: string;
  onDone: (done: { agent: boolean; firstName?: string }) => void;
}) {
  const id = useId();
  const [state, setState] = useState<CodeState>({});
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [firstName, setFirstName] = useState(suggestedName ?? "");
  // A name the page learns later (the agent names the link while it's open)
  // fills in too, unless they've typed one of their own.
  const [suggested, setSuggested] = useState(suggestedName);
  if (suggestedName !== suggested) {
    setSuggested(suggestedName);
    if (firstName === (suggested ?? "")) setFirstName(suggestedName ?? "");
  }
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const [wait, setWait] = useState(0);
  const codeBox = useRef<HTMLInputElement>(null);
  const emailBox = useRef<HTMLInputElement>(null);

  // A new code can be asked for once a short wait is over (the email's sender
  // allows one a minute).
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const send = () =>
    startTransition(async () => {
      // (Back to this page, from the email's link.)
      const back = next ?? `${location.pathname}${location.search}`;
      const result = await sendCode({ email, ...(withName && { firstName }), ...(withPhone && { phone }), next: back, asAgent }).catch(
        (): CodeState => ({ error: "We couldn't send your code just now. Please try again." }),
      );
      setState(result);
      if (result.sent) {
        setSentTo(result.sent);
        setCode("");
        setWait(30);
        requestAnimationFrame(() => codeBox.current?.focus());
      }
    });

  const verify = () =>
    startTransition(async () => {
      const result = await verifyCode({ email: sentTo ?? email, code }).catch(
        (): CodeState => ({ error: "That didn't go through. Please try again.", field: "code" }),
      );
      if (result.done) onDone({ ...result.done, ...(withName && firstName.trim() && { firstName: firstName.trim() }) });
      else setState((now) => ({ ...now, error: result.error, field: result.field }));
    });

  const error = state.error && (
    <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-700">
      {state.error}
    </p>
  );
  const describedBy = (name: CodeState["field"]) => (state.field === name ? `${id}-error` : undefined);

  if (sentTo) {
    return (
      <form
        aria-label={label}
        onSubmit={(event) => {
          event.preventDefault();
          verify();
        }}
        data-code-step
      >
        <p className="flex items-start gap-2 text-sm text-stone-700">
          <MailCheck aria-hidden size={18} className="mt-0.5 shrink-0 text-brand" />
          <span>
            We emailed a code to <span className="font-semibold text-ink">{sentTo}</span>.
            {state.devCode && (
              <>
                {" "}
                Local demo, no email sent: it&apos;s <span className="font-semibold text-ink">{state.devCode}</span>.
              </>
            )}
          </span>
        </p>
        <label htmlFor={`${id}-code`} className="mt-3 block text-sm font-medium">
          Code from the email
        </label>
        <input
          ref={codeBox}
          id={`${id}-code`}
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/[^\d]/g, "").slice(0, 10))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6,10}"
          required
          aria-invalid={state.field === "code" || undefined}
          aria-describedby={describedBy("code")}
          placeholder="123456"
          className={cn(field(), "mt-1 text-center text-xl tracking-[0.4em] tabular-nums placeholder:tracking-[0.4em]")}
        />
        {error}
        <button
          type="submit"
          disabled={pending || code.length < 6}
          className={cn(button({ kind: "primary", size: "lg", block: true }), "mt-3")}
        >
          {pending ? "Checking…" : "Continue"}
        </button>
        <div className="mt-2 flex items-center justify-between gap-2 text-sm">
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setState({});
              requestAnimationFrame(() => emailBox.current?.focus());
            }}
            className={cn(button({ kind: "ghost", flush: true }), "text-stone-700")}
          >
            Use a different email
          </button>
          <button
            type="button"
            onClick={send}
            disabled={pending || wait > 0}
            className={cn(button({ kind: "ghost", flush: true }), "text-brand disabled:text-stone-400")}
          >
            {wait > 0 ? `Send a new code (${wait})` : "Send a new code"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      {/* Shorter screens, tighter; a phone on its side, name and phone side by side. */}
      <div className="flex flex-col gap-2.5 compact:gap-2 short:grid short:grid-cols-2">
        {withName && (
          <div>
            <label htmlFor={`${id}-name`} className="text-sm font-medium">
              First name
            </label>
            <input
              id={`${id}-name`}
              name="firstName"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              required
              maxLength={40}
              autoComplete="given-name"
              autoFocus={autoFocus}
              aria-invalid={state.field === "firstName" || undefined}
              aria-describedby={[describedBy("firstName"), nameHint].filter(Boolean).join(" ") || undefined}
              className={cn(field(), "mt-1")}
            />
          </div>
        )}
        {withPhone && (
          <div>
            <label htmlFor={`${id}-phone`} className="text-sm font-medium">
              Phone <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id={`${id}-phone`}
              name="phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              maxLength={30}
              autoComplete="tel"
              aria-invalid={state.field === "phone" || undefined}
              aria-describedby={describedBy("phone")}
              className={cn(field(), "mt-1")}
            />
          </div>
        )}
        <div className="short:col-span-2">
          <label htmlFor={`${id}-email`} className="text-sm font-medium">
            Email
          </label>
          <input
            ref={emailBox}
            id={`${id}-email`}
            name="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={254}
            autoComplete="email"
            autoFocus={autoFocus && !withName}
            aria-invalid={state.field === "email" || undefined}
            aria-describedby={describedBy("email")}
            className={cn(field(), "mt-1")}
          />
        </div>
      </div>
      {error}
      <button
        type="submit"
        disabled={pending}
        className={cn(button({ kind: "primary", size: "lg", block: true }), "mt-4 compact:mt-3")}
      >
        {pending ? "Sending your code…" : submitLabel}
      </button>
      {note && <p className="mt-3 text-center text-sm text-muted compact:mt-2">{note}</p>}
    </form>
  );
}
