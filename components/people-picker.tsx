"use client";

import { Plus, X } from "lucide-react";
import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { searchPeople } from "@/app/dashboard/actions";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/format";
import { NOT_AN_EMAIL, type PersonOption, type PersonPick } from "@/lib/people-picker";
import { button, field } from "@/lib/ui";

// Who a link is for, in one place wherever homes are sent: the new-link
// builder, the sheets after Send, and "Add a person" on a link. Type a first
// name and it's someone new; or pick one of the agent's clients, someone they
// follow, or (two letters in) anyone on Porchcard, by the first name and photo
// anyone could see on their page. A combobox with its list in the page under
// it rather than floating, so it works inside a sheet and with a phone's
// keyboard up.

// Someone picked: a typed first name ("new"), or a suggestion as it came.
export type Chosen = {
  key: string;
  name: string;
  photo: string | null;
  pick: PersonPick;
  group: PersonOption["group"] | "new";
  context?: string;
};

const GROUPS: { key: PersonOption["group"]; label: string }[] = [
  { key: "client", label: "Your clients" },
  { key: "follow", label: "People you follow" },
  { key: "member", label: "On Porchcard" },
];

// Someone typed in, as a pick.
export const typed = (text: string): Chosen => {
  const name = text.trim().replace(/\s+/g, " ");
  return { key: `n:${name.toLowerCase()}`, name, photo: null, pick: { name }, group: "new" };
};

const fromOption = (option: PersonOption): Chosen => ({
  key: option.key,
  name: option.name,
  photo: option.photo,
  pick: option.pick,
  group: option.group,
  context: option.context,
});

// "Jenny", "Jenny and Mike", "Jenny, Mike and Sam".
const together = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export function PeoplePicker({
  label,
  hint,
  chosen,
  onChange,
  max,
  shareId,
  mode = "multi",
  onCommit,
  autoFocus = false,
  name = "firstName",
  inputRef,
  onTextChange,
  notify = false,
  placeholder,
  beside,
}: {
  // The field's name, as it's read out and shown.
  label: string;
  hint?: string;
  // Multi: everyone picked so far. Single: the one person in the field, as
  // typed or as picked (empty for nobody), which is what the form sends.
  chosen: Chosen[];
  onChange: (next: Chosen[]) => void;
  max: number;
  // The link they'd be added to: anyone already on it isn't suggested.
  shareId?: string;
  mode?: "multi" | "single";
  // Someone was just picked (or typed and added).
  onCommit?: (person: Chosen) => void;
  autoFocus?: boolean;
  // Single, in a form: the field that carries a typed first name. Someone
  // picked from Porchcard goes as `visitorId` too.
  name?: string;
  inputRef?: Ref<HTMLInputElement>;
  // Multi: what's typed but not yet added, so the page can count it.
  onTextChange?: (text: string) => void;
  // Picking someone on Porchcard here lets them know (the builder, a link's page).
  notify?: boolean;
  placeholder?: string;
  // Beside the field, on its line: a form's own button.
  beside?: ReactNode;
}) {
  const single = mode === "single";
  const id = useId();
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const statusId = `${id}-status`;
  const [ownText, setOwnText] = useState("");
  // Single: the field is the person.
  const text = single ? (chosen[0]?.name ?? "") : ownText;
  const [open, setOpen] = useState(false);
  // The list sits in the page, under the field, so it pushes what's below it
  // down. Leaving the field with a press on something below (Add a note,
  // Save) closes the list only once that press has landed: closed at once,
  // what was under the pointer moves up and the press misses it.
  const pressing = useRef(false);
  const closeAfterPress = useRef(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      pressing.current = false;
      if (closeAfterPress.current) {
        closeAfterPress.current = false;
        setOpen(false);
      }
    };
    const down = () => {
      pressing.current = true;
      clearTimeout(timer);
      // A press that never becomes a click (let go somewhere else).
      timer = setTimeout(settle, 1000);
    };
    const landed = () => {
      clearTimeout(timer);
      timer = setTimeout(settle, 0);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("click", landed, true);
    document.addEventListener("pointercancel", landed, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("click", landed, true);
      document.removeEventListener("pointercancel", landed, true);
    };
  }, []);
  // The option the arrow keys are on, by key ("new" for someone new), so it
  // stays put when more suggestions arrive.
  const [active, setActive] = useState<string | null>(null);
  const [results, setResults] = useState<{ query: string; options: PersonOption[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Said to screen readers: how many were found, and who came off.
  const [said, setSaid] = useState("");
  const input = useRef<HTMLInputElement | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Only the newest search's answer counts, however they arrive.
  const asked = useRef(0);
  const cache = useRef(new Map<string, PersonOption[]>());

  useEffect(() => () => clearTimeout(debounce.current), []);
  // The page can put the cursor back in the field (after an add, say).
  useImperativeHandle(inputRef, () => input.current as HTMLInputElement, []);

  const query = text.trim().replace(/\s+/g, " ");
  // People already picked aren't suggested again.
  const chosenKeys = new Set(chosen.map((c) => c.key));
  const exclude = chosen.flatMap((c) => ("visitorId" in c.pick ? [c.pick.visitorId] : []));
  const cacheKey = (q: string) => `${q.toLowerCase()}|${exclude.join(",")}`;

  const search = (q: string, wait: number) => {
    clearTimeout(debounce.current);
    const n = ++asked.current;
    const key = cacheKey(q);
    const known = cache.current.get(key);
    if (known) {
      setResults({ query: q, options: known });
      return;
    }
    debounce.current = setTimeout(() => {
      searchPeople({ query: q, shareId, exclude })
        .catch((): PersonOption[] => [])
        .then((options) => {
          cache.current.set(key, options);
          if (n === asked.current) setResults({ query: q, options });
        });
    }, wait);
  };

  // What's shown: each group, then (once something's typed) someone new, last,
  // so Enter on a match takes the person rather than the letters typed.
  // While a longer search is on its way, the last one's answers that still
  // fit stay up, so the list doesn't blink at every letter.
  const lower = query.toLowerCase();
  const found = !results
    ? []
    : results.query.toLowerCase() === lower
      ? results.options
      : lower.startsWith(results.query.toLowerCase())
        ? results.options.filter((option) => option.name.toLowerCase().startsWith(lower))
        : [];
  const suggestions = found.filter(
    (option) => !chosenKeys.has(option.key) || (single && option.key === chosen[0]?.key && chosen[0].group !== "new"),
  );
  const offerNew = query.length > 0 && !(single && chosen[0] && chosen[0].group !== "new");
  const flat: ({ kind: "new" } | { kind: "person"; option: PersonOption })[] = [
    ...GROUPS.flatMap((group) =>
      suggestions.filter((o) => o.group === group.key).map((option) => ({ kind: "person" as const, option })),
    ),
    ...(offerNew ? [{ kind: "new" as const }] : []),
  ];
  const optionId = (i: number) => `${id}-option-${i}`;
  const keyOf = (item: (typeof flat)[number]) => (item.kind === "new" ? "new" : item.option.key);
  const shown = open && flat.length > 0;
  const activeIndex = shown && active !== null ? flat.findIndex((item) => keyOf(item) === active) : -1;

  // The option the arrow keys reach stays in sight in a long list.
  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, id]);

  // How many were found, once they're in, for screen readers.
  const count = suggestions.length;
  const loaded = Boolean(results && results.query.toLowerCase() === lower);
  const status =
    said ||
    (!open || !loaded
      ? ""
      : count > 0
        ? `${count} ${count === 1 ? "person" : "people"} found`
        : query
          ? `No one found. Press Enter to add ${query}.`
          : "");

  const setText = (value: string) => {
    setProblem(null);
    setSaid("");
    setActive(null);
    setOpen(true);
    if (single) {
      onChange(value.trim() ? [{ ...typed(value), name: value }] : []);
    } else {
      setOwnText(value);
      onTextChange?.(value);
    }
    search(value.trim().replace(/\s+/g, " "), 200);
  };

  const full = !single && chosen.length >= max;

  const add = (person: Chosen) => {
    setProblem(null);
    setActive(null);
    if (single) {
      onChange([person]);
      setOpen(false);
      onCommit?.(person);
      return;
    }
    if (full) return setProblem(`That's ${max}, as many as one link can have.`);
    if (person.group === "new" && chosen.some((c) => c.group === "new" && c.key === person.key)) {
      return setProblem(`${person.name} is already on this link.`);
    }
    if (!chosenKeys.has(person.key)) onChange([...chosen, person]);
    setOwnText("");
    onTextChange?.("");
    setSaid(`Added ${person.name}`);
    onCommit?.(person);
    // Ready for the next one: the recent list again.
    search("", 0);
  };

  // What's typed, as someone new: a first name, never an email.
  const addTyped = () => {
    if (!query) return false;
    if (query.includes("@")) {
      setProblem(NOT_AN_EMAIL);
      return false;
    }
    if (query.length > 40) {
      setProblem("First names can be up to 40 characters.");
      return false;
    }
    add(typed(query));
    return true;
  };

  const choose = (i: number) => {
    const item = flat[i];
    if (!item) return;
    if (item.kind === "new") {
      if (single) {
        if (query.includes("@")) return setProblem(NOT_AN_EMAIL);
        onChange([typed(query)]);
        setOpen(false);
        setActive(null);
        return;
      }
      addTyped();
      return;
    }
    add(fromOption(item.option));
  };

  const remove = (person: Chosen) => {
    onChange(chosen.filter((c) => c.key !== person.key));
    setSaid(`Removed ${person.name}`);
    input.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const n = flat.length;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          if (!loaded) search(query, 0);
        }
        if (n === 0) return;
        const down = event.key === "ArrowDown";
        const from = open ? activeIndex : -1;
        const next = from === -1 ? (down ? 0 : n - 1) : (from + (down ? 1 : -1) + n) % n;
        setActive(keyOf(flat[next]));
        return;
      }
      case "Enter": {
        if (shown && activeIndex >= 0) {
          event.preventDefault();
          choose(activeIndex);
          return;
        }
        if (single) {
          // The form's own Add: but an email never gets that far.
          setOpen(false);
          if (query.includes("@")) {
            event.preventDefault();
            setProblem(NOT_AN_EMAIL);
          }
          return;
        }
        event.preventDefault();
        addTyped();
        return;
      }
      case ",": {
        event.preventDefault();
        if (!single) addTyped();
        return;
      }
      case "Escape": {
        // Kept here, so a sheet the field is in stays open.
        if (shown) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          setActive(null);
        } else if (text) {
          event.preventDefault();
          event.stopPropagation();
          setText("");
          setOpen(false);
        }
        return;
      }
      case "Tab":
        setOpen(false);
        setActive(null);
        return;
      case "Backspace": {
        if (!single && !text && chosen.length > 0) {
          event.preventDefault();
          remove(chosen[chosen.length - 1]);
        }
        return;
      }
    }
  };

  // A past client on Porchcard with exactly the name typed: picking them keeps
  // everything they've said with them, where typing makes someone new.
  const sameName = query
    ? suggestions.find((o) => o.group === "client" && "visitorId" in o.pick && o.name.toLowerCase() === query.toLowerCase())
    : undefined;
  // Picked from Porchcard, so we'll tell them.
  const told = notify ? chosen.filter((c) => "visitorId" in c.pick).map((c) => c.name) : [];
  const picked = single ? chosen[0] : undefined;

  // The option the arrow keys are on is ringed, not just shaded, so it shows.
  const row =
    "flex min-h-13 cursor-pointer items-center gap-3 rounded-xl px-2.5 py-1.5 hover:bg-stone-50 aria-selected:bg-stone-100 aria-selected:ring-2 aria-selected:ring-inset aria-selected:ring-brand";

  return (
    <div>
      <label htmlFor={`${id}-input`} className="text-sm font-medium">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}

      {!single && chosen.length > 0 && (
        <ul aria-label="Who it's for" className="mt-2 flex flex-wrap gap-2">
          {chosen.map((person) => (
            <li
              key={person.key}
              className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-white py-0.5 pl-1 ring-1 ring-stone-300"
            >
              <Avatar name={person.name} photo={person.photo} size={6} />
              <span className="min-w-0 truncate text-sm font-semibold">{person.name}</span>
              <button
                type="button"
                aria-label={`Remove ${person.name}`}
                onClick={() => remove(person)}
                className={cn(button({ kind: "ghost", icon: true }), "-my-1 shrink-0 text-stone-600")}
              >
                <X aria-hidden size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* The field, and whatever goes on its line (a form's own button). */}
      <div className="mt-2 flex items-start gap-2">
        <div className="relative min-w-0 flex-1">
          {picked && picked.group !== "new" && (
            <Avatar
              name={picked.name}
              photo={picked.photo}
              size={7}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
            />
          )}
          <input
            ref={input}
            id={`${id}-input`}
            role="combobox"
            aria-expanded={shown}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-describedby={[hint && hintId, problem && `${id}-problem`].filter(Boolean).join(" ") || undefined}
            aria-invalid={problem ? true : undefined}
            value={text}
            maxLength={60}
            autoFocus={autoFocus}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint={single ? "go" : "done"}
            placeholder={placeholder ?? (full ? "That's everyone this link can have" : "A client, or a first name")}
            onChange={(event) => setText(event.target.value)}
            onFocus={() => {
              closeAfterPress.current = false;
              setOpen(true);
              if (!loaded) search(query, 0);
            }}
            onBlur={() => {
              setActive(null);
              if (pressing.current) closeAfterPress.current = true;
              else setOpen(false);
            }}
            onKeyDown={onKeyDown}
            // At least 16px, so a phone doesn't zoom in on it.
            className={cn(field(), picked && picked.group !== "new" && "pl-12")}
          />
        </div>
        {beside}
      </div>

      {/* Always in the page, so its list can appear and go without moving focus. */}
      <ul
        id={listId}
        role="listbox"
        aria-label="Suggestions"
        hidden={!shown}
        // A tap on a suggestion mustn't take the cursor out of the field.
        onMouseDown={(event) => event.preventDefault()}
        className="mt-1.5 flex max-h-[26rem] flex-col gap-0.5 overflow-y-auto rounded-2xl bg-white p-1.5 ring-1 ring-stone-200"
      >
        {GROUPS.map((group) => {
          const items = flat
            .map((item, i) => ({ item, i }))
            .filter(
              (x): x is { item: { kind: "person"; option: PersonOption }; i: number } =>
                x.item.kind === "person" && x.item.option.group === group.key,
            );
          if (items.length === 0) return null;
          return (
            <li key={group.key} role="presentation" className="mt-1 first:mt-0">
              <p id={`${id}-${group.key}`} className="px-2.5 pb-0.5 pt-1.5 text-meta font-semibold uppercase tracking-wide text-muted">
                {group.label}
              </p>
              <ul role="group" aria-labelledby={`${id}-${group.key}`} className="flex flex-col gap-0.5">
                {items.map(({ item: { option }, i }) => (
                  <li
                    key={option.key}
                    id={optionId(i)}
                    role="option"
                    aria-selected={activeIndex === i}
                    // Said whole, the name then how the agent knows them.
                    aria-label={`${option.name}, ${option.context}`}
                    onClick={() => choose(i)}
                    className={row}
                  >
                    <Avatar name={option.name} photo={option.photo} size={8} tone={option.agent ? "agent" : "person"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold leading-snug">{option.name}</span>
                      <span className="block truncate text-meta leading-snug text-muted">{option.context}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
        {flat.length > 0 && flat[flat.length - 1].kind === "new" && (
          <li
            id={optionId(flat.length - 1)}
            role="option"
            aria-selected={activeIndex === flat.length - 1}
            onClick={() => choose(flat.length - 1)}
            className={row}
          >
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700">
              <Plus size={16} />
            </span>
            <span className="min-w-0 truncate text-body">
              Add <span className="font-semibold">&ldquo;{query}&rdquo;</span> as someone new
            </span>
          </li>
        )}
      </ul>

      {sameName && (
        <p className="mt-1.5 text-meta text-stone-700">
          {sameName.name} (your client) is in the list. Pick them to keep their history together.
        </p>
      )}
      {problem && (
        <p id={`${id}-problem`} role="alert" className="mt-1.5 text-sm text-red-700">
          {problem}
        </p>
      )}
      {told.length > 0 && (
        <p className="mt-1.5 text-meta text-stone-700">We&apos;ll let {together(told)} know on Porchcard.</p>
      )}
      {/* Single, in a form: who's being added, as the form sends it. */}
      {single && (
        <>
          <input type="hidden" name={name} value={chosen[0]?.name.trim() ?? ""} />
          <input
            type="hidden"
            name="visitorId"
            value={chosen[0] && "visitorId" in chosen[0].pick ? chosen[0].pick.visitorId : ""}
          />
        </>
      )}
      <p id={statusId} role="status" className="sr-only">
        {status}
      </p>
    </div>
  );
}
