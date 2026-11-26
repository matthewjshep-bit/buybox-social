"use client";

// Search's filters as a row of buttons, each opening its choices: Filters
// (the rest, with a count of those on) first, then For sale or Sold, Price,
// Beds & baths and Home type. A button says what's chosen ("$400K–$1M",
// "3+ bd, 2+ ba") and is tinted while it's narrowing the homes. Choices take
// effect as they're made; Done ("Show 12 homes" on a phone), Escape or a tap
// away puts the choices away. On a wide screen they drop down under their
// button; on a phone they rise from the bottom.
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn, formatPrice } from "@/lib/format";
import { HOME_TYPES, LISTED_BY, MIN_SQFT, moreFiltersOn, type SearchFilters } from "@/lib/search-options";
import { button, field } from "@/lib/ui";

export type FilterUpdate = (patch: Partial<Record<keyof SearchFilters, string | number | boolean | null>>) => void;

const MIN_PRICES = [400_000, 600_000, 800_000, 1_000_000, 1_500_000, 2_000_000];
const MAX_PRICES = [600_000, 800_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000];
const BEDS = [1, 2, 3, 4, 5];
const BATHS = [1, 2, 3, 4];

// "$400K", "$1.5M": short enough for a button.
const short = (price: number) =>
  price >= 1_000_000 ? `$${(price / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M` : `$${Math.round(price / 1000)}K`;

const priceLabel = ({ minPrice: min, maxPrice: max }: SearchFilters) =>
  min && max ? `${short(min)}–${short(max)}` : min ? `${short(min)}+` : max ? `Up to ${short(max)}` : "Price";

const roomsLabel = ({ beds, baths }: SearchFilters) =>
  beds || baths ? [beds && `${beds}+ bd`, baths && `${baths}+ ba`].filter(Boolean).join(", ") : "Beds & baths";

type MenuId = "status" | "price" | "rooms" | "type" | "more";

// Below this, the choices rise from the bottom (as Tailwind's `sm`).
const PHONE = "(max-width: 39.99rem)";

export function SearchFilterBar({
  shown,
  update,
  count,
  pending,
}: {
  shown: SearchFilters;
  update: FilterUpdate;
  // How many homes the filters find, and whether a change is still loading.
  count: number;
  pending: boolean;
}) {
  const [open, setOpen] = useState<MenuId | null>(null);
  const more = moreFiltersOn(shown);
  const menu = (id: MenuId) => ({
    id,
    open: open === id,
    onOpen: () => setOpen(open === id ? null : id),
    onClose: () => setOpen(null),
    found: pending ? null : count,
  });

  return (
    <>
      {/* First, so what's on under it (its count) is in view on a phone too. */}
      <FilterMenu
        {...menu("more")}
        label="Filters"
        icon={<SlidersHorizontal aria-hidden size={16} />}
        badge={more || null}
        title="More filters"
        on={more > 0}
        wide
        footer={
          more > 0 ? (
            <button
              type="button"
              onClick={() => update({ by: null, minSqft: null, liked: false })}
              className="flex min-h-11 shrink-0 items-center px-1 font-semibold text-brand underline"
            >
              Reset
            </button>
          ) : null
        }
      >
        <Choices
          name="Listed by"
          heading
          value={shown.by ?? ""}
          options={[["", "Anyone"], ...Object.entries(LISTED_BY)]}
          onChange={(value) => update({ by: value || null })}
        />
        <label className="mt-4 block text-sm font-semibold">
          Square feet
          <select
            aria-label="Square feet"
            value={shown.minSqft ?? ""}
            onChange={(event) => update({ minSqft: event.target.value || null })}
            className={cn(field(), "mt-1 font-normal")}
          >
            <option value="">Any size</option>
            {MIN_SQFT.map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString("en-US")}+ sq ft
              </option>
            ))}
          </select>
        </label>
        <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-body">
          <input
            type="checkbox"
            checked={shown.liked}
            onChange={(event) => update({ liked: event.target.checked })}
            className="size-5 accent-brand"
          />
          Only homes people liked
        </label>
      </FilterMenu>

      <FilterMenu {...menu("status")} label={shown.sold ? "Sold" : "For sale"} title="For sale or sold" on={shown.sold}>
        <Choices
          name="For sale or sold"
          value={shown.sold ? "sold" : ""}
          options={[
            ["", "For sale"],
            ["sold", "Sold"],
          ]}
          onChange={(value) => update({ sold: value === "sold" })}
        />
        <p className="mt-2 text-meta text-muted">Closed deals count as sold.</p>
      </FilterMenu>

      <FilterMenu {...menu("price")} label={priceLabel(shown)} title="Price range" on={Boolean(shown.minPrice || shown.maxPrice)}>
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1 text-sm font-semibold">
            Min
            <select
              aria-label="Minimum price"
              value={shown.minPrice ?? ""}
              onChange={(event) => update({ minPrice: event.target.value || null })}
              className={cn(field(), "mt-1 font-normal")}
            >
              <option value="">No min</option>
              {MIN_PRICES.map((p) => (
                <option key={p} value={p}>
                  {formatPrice(p)}
                </option>
              ))}
            </select>
          </label>
          <span aria-hidden className="pb-3 text-muted">
            –
          </span>
          <label className="min-w-0 flex-1 text-sm font-semibold">
            Max
            <select
              aria-label="Maximum price"
              value={shown.maxPrice ?? ""}
              onChange={(event) => update({ maxPrice: event.target.value || null })}
              className={cn(field(), "mt-1 font-normal")}
            >
              <option value="">No max</option>
              {MAX_PRICES.map((p) => (
                <option key={p} value={p}>
                  {formatPrice(p)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </FilterMenu>

      <FilterMenu {...menu("rooms")} label={roomsLabel(shown)} title="Beds & baths" on={Boolean(shown.beds || shown.baths)}>
        <Segments name="Bedrooms" value={shown.beds} options={BEDS} onChange={(beds) => update({ beds })} />
        <Segments name="Bathrooms" value={shown.baths} options={BATHS} onChange={(baths) => update({ baths })} className="mt-4" />
      </FilterMenu>

      <FilterMenu
        {...menu("type")}
        label={shown.type ? HOME_TYPES[shown.type].label : "Home type"}
        title="Home type"
        on={Boolean(shown.type)}
      >
        <Choices
          name="Home type"
          value={shown.type ?? ""}
          options={[["", "All home types"], ...Object.entries(HOME_TYPES).map(([value, { label }]) => [value, label] as [string, string])]}
          onChange={(value) => update({ type: value || null })}
        />
      </FilterMenu>

    </>
  );
}

// One button and the choices it opens.
function FilterMenu({
  id,
  open,
  onOpen,
  onClose,
  label,
  title,
  on,
  icon,
  badge,
  wide = false,
  footer,
  found,
  children,
}: {
  id: MenuId;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  label: string;
  title: string;
  // Narrowing the homes: tinted.
  on: boolean;
  icon?: ReactNode;
  badge?: number | null;
  wide?: boolean;
  footer?: ReactNode;
  // How many homes the choices find (null while that's loading).
  found: number | null;
  children: ReactNode;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const panelId = `filter-${id}`;
  // Under its button, kept on the screen (wide screens; a phone's rise from the bottom).
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const [phone, setPhone] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const isPhone = matchMedia(PHONE).matches;
      setPhone(isPhone);
      const box = trigger.current?.getBoundingClientRect();
      if (!box || isPhone) return setAt(null);
      const width = panel.current?.offsetWidth ?? 320;
      setAt({ top: box.bottom + 8, left: Math.max(16, Math.min(box.left, window.innerWidth - width - 16)) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  // Open: the keyboard goes to the choice made (or the first).
  useEffect(() => {
    if (!open) return;
    const first = panel.current?.querySelector<HTMLElement>(
      "input:checked, [aria-pressed=true], select, input, button:not([data-done])",
    );
    first?.focus({ preventScroll: true });
  }, [open]);

  // Escape, or a tap anywhere else, puts it away (Escape back to its button).
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const onClose = () => close.current();
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) onClose();
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", keys);
    };
  }, [open]);

  const done = () => {
    onClose();
    trigger.current?.focus();
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        data-filter={id}
        onClick={onOpen}
        className={cn(
          "flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold outline-hidden! focus-visible:ring-2 focus-visible:ring-brand",
          on || open ? "border-brand bg-brand/10 text-brand" : "border-stone-300 bg-white text-ink hover:border-stone-400",
        )}
      >
        {icon}
        {label}
        {badge ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-brand text-xs text-white">
            {badge}
            <span className="sr-only"> on</span>
          </span>
        ) : null}
        <ChevronDown
          aria-hidden
          size={16}
          className={cn("transition-transform motion-reduce:transition-none", open && "rotate-180")}
        />
      </button>
      {open &&
        createPortal(
          <>
            {phone && <div aria-hidden className="fixed inset-0 z-40 bg-black/40" />}
            <div
              ref={panel}
              id={panelId}
              role="dialog"
              aria-labelledby={headingId}
              style={at ? { top: at.top, left: at.left } : undefined}
              className={cn(
                "fixed z-50 flex flex-col overflow-hidden bg-white shadow-xl ring-1 ring-stone-200",
                phone
                  ? "inset-x-0 bottom-0 max-h-[85svh] rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
                  : cn("max-h-[calc(100dvh-9rem)] rounded-2xl", wide ? "w-96" : "w-80", !at && "invisible"),
              )}
            >
              <h2 id={headingId} className="shrink-0 bg-stone-100 px-4 py-3 text-sm font-semibold text-stone-700">
                {title}
              </h2>
              <div className="min-h-0 overflow-y-auto overscroll-contain p-4">{children}</div>
              {/* A phone's sheet covers the homes, so its button says what the
                  choices found ("Show 12 homes"); a wide screen's panel leaves
                  them in view, and its Done sits quietly at its end. */}
              <div className="flex shrink-0 items-center gap-3 px-4 pb-4">
                {footer}
                <button
                  type="button"
                  data-done
                  onClick={done}
                  className={
                    phone ? button({ kind: "primary", size: "lg", block: true }) : cn(button({ kind: "neutral" }), "ml-auto")
                  }
                >
                  {!phone ? "Done" : found === null ? "Updating…" : `Show ${found} ${found === 1 ? "home" : "homes"}`}
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

// A choice of one, as a column of rows: "For sale", "Sold".
function Choices({
  name,
  value,
  options,
  onChange,
  heading = false,
}: {
  name: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
  // Its name shown above it (among other filters), not only said.
  heading?: boolean;
}) {
  return (
    <fieldset>
      <legend className={heading ? "mb-1 text-sm font-semibold" : "sr-only"}>{name}</legend>
      {options.map(([option, label]) => (
        <label
          key={option || "any"}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 text-body has-[:checked]:font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand"
        >
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            className="size-5 accent-brand outline-none"
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

// "Any 1+ 2+ 3+": joined buttons, the one picked filled in.
function Segments({
  name,
  value,
  options,
  onChange,
  className,
}: {
  name: string;
  value: number | null;
  options: number[];
  onChange: (value: number | null) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={name} className={className}>
      <p className="mb-1.5 text-sm font-semibold">{name}</p>
      <div className="flex overflow-hidden rounded-xl border border-stone-300">
        {[null, ...options].map((n) => {
          const picked = value === n;
          return (
            <button
              key={n ?? "any"}
              type="button"
              aria-pressed={picked}
              aria-label={n ? `${n}+ ${name.toLowerCase()}` : `Any ${name.toLowerCase()}`}
              onClick={() => onChange(n)}
              className={cn(
                "flex h-11 min-w-0 flex-1 items-center justify-center border-l border-stone-300 text-sm font-semibold first:border-l-0 outline-hidden! focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
                picked ? "bg-brand text-white" : "bg-white text-ink hover:bg-stone-50",
              )}
            >
              {n ? `${n}+` : "Any"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
