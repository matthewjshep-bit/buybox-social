"use client";

import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition, type KeyboardEvent, type RefObject } from "react";
import { cn } from "@/lib/format";
import { button, menuRow, popover } from "@/lib/ui";

// Your own words, wherever they are (a comment under a home, on a link, a
// message, a post): "…" beside them opens Edit and Delete; Delete asks once
// more, since it can't be undone. Edit turns the words into a box to change
// them in, in place. The menu rises over everything (the top layer), so the
// comments' own scrolling never cuts it off; it keeps Escape to itself, as
// the box does, so the comments around it stay open (`data-keeps-escape`,
// which the reel listens for).

// Where the menu goes: under its button, reaching toward the middle of the
// screen (from its left edge when it's on the left, its right edge when on
// the right), over it when there's no room under it, and always on the screen.
function place(menu: HTMLElement, at: HTMLElement) {
  const r = at.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  const fromLeft = r.left + r.width / 2 < window.innerWidth / 2;
  const left = Math.max(8, Math.min(fromLeft ? r.left - 8 : r.right - width, window.innerWidth - width - 8));
  const below = r.bottom + 4;
  const top = below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 4) : below;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

export function OwnMenu({
  what,
  warn,
  onEdit,
  onDelete,
  big = false,
  dark = false,
  triggerRef,
  className,
}: {
  // What it is, for its name and the question: "comment", "post", "message".
  what: string;
  // Said under "Delete this comment?": what else goes with it.
  warn?: string;
  // (None: it can only be deleted.)
  onEdit?: () => void;
  // Deletes it: an error to say, or null once it's gone.
  onDelete: () => Promise<string | null>;
  // A round 44px button (a post's header), not a word-sized one in a line of words.
  big?: boolean;
  // On the dark ground (the comments under a home's photo).
  dark?: boolean;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  className?: string;
}) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const ownTrigger = useRef<HTMLButtonElement>(null);
  const trigger = triggerRef ?? ownTrigger;
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const hide = () => {
    if (menu.current?.matches(":popover-open")) menu.current.hidePopover();
  };

  useEffect(() => {
    const el = menu.current;
    if (!el) return;
    const toggled = (event: Event) => {
      const now = (event as ToggleEvent).newState === "open";
      setOpen(now);
      if (!now) {
        setAsking(false);
        setError(null);
      }
    };
    el.addEventListener("toggle", toggled);
    return () => el.removeEventListener("toggle", toggled);
  }, []);

  // Placed as it opens, and again as it changes (the question is taller).
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    place(menu.current, trigger.current);
  }, [open, asking, error, trigger]);

  // Open: the keyboard on its first choice (or, asking, on Cancel); and it
  // closes as what's under it scrolls away from it.
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>(asking ? "[data-cancel]" : "button")?.focus();
  }, [open, asking]);
  useEffect(() => {
    if (!open) return;
    const away = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) hide();
    };
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", hide);
    };
  }, [open]);

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (pending) return;
      hide();
      trigger.current?.focus({ preventScroll: true });
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const rows = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    rows[(at + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length]?.focus();
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        popoverTarget={id}
        aria-label={`Options for your ${what}`}
        aria-expanded={open}
        className={cn(
          big
            ? button({ kind: "ghost", icon: true })
            : "flex h-6 w-7 items-center justify-center rounded-full transition-colors hit-44",
          big ? "text-muted hover:text-ink" : dark ? "hover:text-white" : "hover:text-ink",
          className,
        )}
      >
        <Ellipsis aria-hidden size={big ? 20 : 16} />
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        data-keeps-escape
        onKeyDown={keys}
        className={cn(popover, "fixed inset-auto m-0 w-60 max-w-[calc(100vw-1rem)] border-0 font-normal [text-shadow:none]")}
      >
        {asking ? (
          <div role="group" aria-labelledby={`${id}-ask`} className="flex flex-col gap-1 p-1.5">
            <p id={`${id}-ask`} className="text-body font-semibold text-ink">
              Delete this {what}?
            </p>
            <p className="text-meta leading-snug text-muted">
              {warn ? `${warn} ` : ""}You can&apos;t undo this.
            </p>
            {error && (
              <p role="alert" className="text-meta font-semibold text-red-700">
                {error}
              </p>
            )}
            <div className="mt-1.5 flex gap-2">
              <button
                type="button"
                data-cancel
                disabled={pending}
                onClick={() => setAsking(false)}
                className={cn(button({ kind: "secondary" }), "flex-1")}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const failed = await onDelete().catch(() => "That didn't delete. Try again.");
                    if (failed) setError(failed);
                    else hide();
                  })
                }
                className={cn(button({ kind: "danger" }), "flex-1")}
              >
                {pending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  hide();
                  onEdit();
                }}
                className={menuRow()}
              >
                <Pencil aria-hidden size={18} /> Edit
              </button>
            )}
            <button type="button" onClick={() => setAsking(true)} className={cn(menuRow(), "text-red-700 [&>svg]:text-red-700")}>
              <Trash2 aria-hidden size={18} /> Delete
            </button>
          </>
        )}
      </div>
    </>
  );
}

// The words being changed, in place: the box, Save and Cancel. Escape puts
// it back as it was. `enterSaves`: a comment or a message (Shift+Enter for a
// new line); a post's words take Enter as a new line.
export function EditBox({
  initial,
  what,
  onSave,
  onCancel,
  enterSaves = true,
  allowEmpty = false,
  dark = false,
}: {
  initial: string;
  what: string;
  // Saves it: an error to say, or null once it's saved.
  onSave: (body: string) => Promise<string | null>;
  onCancel: () => void;
  enterSaves?: boolean;
  // A post with homes can be left with no words.
  allowEmpty?: boolean;
  dark?: boolean;
}) {
  const [body, setBody] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const empty = !body.trim() && !allowEmpty;
  const save = () => {
    if (pending || empty) return;
    if (body.trim() === initial.trim()) return onCancel();
    setError(null);
    start(async () => {
      const failed = await onSave(body.trim()).catch(() => "That didn't save. Try again.");
      if (failed) setError(failed);
    });
  };
  return (
    <form
      data-keeps-escape
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className="mt-1"
    >
      <label htmlFor={id} className="sr-only">
        Edit your {what}
      </label>
      <textarea
        ref={box}
        id={id}
        value={body}
        maxLength={1000}
        rows={1}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (!pending) onCancel();
          } else if (enterSaves && event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            save();
          }
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          "block max-h-60 min-h-11 w-full resize-none rounded-2xl px-3.5 py-2.5 text-base leading-6 outline-hidden! [field-sizing:content] focus:ring-2 focus:ring-brand/80",
          dark ? "bg-white/10 text-white" : "bg-stone-100 text-ink",
        )}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className={cn("mt-1 px-1 text-meta font-semibold", dark ? "text-rose-300" : "text-red-700")}>
          {error}
        </p>
      )}
      <div className="mt-1.5 flex justify-end gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className={cn(button({ kind: dark ? "glass" : "ghost" }), dark && "text-white")}
        >
          Cancel
        </button>
        <button type="submit" disabled={pending || empty} className={button({ kind: "primary" })}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
