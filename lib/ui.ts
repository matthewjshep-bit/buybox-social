import { cn } from "@/lib/format";

// The light pages' building blocks, as class names: one button, one text box,
// one card, so every page reads as the same product as the feed. Plain
// strings, never overridden by a className (there's nothing to merge them):
// a variant is an option here instead.
//
// What counts as a button: anything drawn as one (filled, edged, or a shape
// under the pointer) is round-ended and 44 or 48px tall. A word that acts
// inside a line of words (Reply, Like under a comment) keeps the line's
// height and takes a 44px touch area (`hit-44`). A row in a list or a menu,
// and a chip that carries a photo, are rows and chips, rounded like a card.

export type ButtonKind = "primary" | "neutral" | "secondary" | "ghost" | "danger" | "light" | "glass";
export type ButtonSize = "md" | "lg";

// Focus on a dark surface (a photo, the brand colour): white, with a dark
// halo, so it shows on anything. The reel's whole ground does this already
// (globals.css); a control on its own over a photo takes this.
export const focusOnDark = "[--ring:white] focus-visible:shadow-[0_0_0_4px_rgb(0_0_0/0.55)]";

const SIZE: Record<ButtonSize, string> = {
  // 44px: beside other things, in a card, in a row of choices.
  md: "min-h-11 gap-1.5 py-2 text-sm",
  // 48px: the one thing a page or a sheet asks you to do.
  lg: "min-h-12 gap-2 py-2 text-base",
};

const PAD: Record<ButtonSize, string> = { md: "px-4", lg: "px-6" };

const ICON: Record<ButtonSize, string> = { md: "size-11", lg: "size-12" };

// Words or a control on a photo: dark, see-through, blurred behind, and
// dark enough that white words on it read over the brightest photo.
export const glass = "bg-black/60 text-white backdrop-blur-md";

const KIND: Record<ButtonKind, string> = {
  // The way on: the brand's colour (the agent's, on their pages).
  primary: "bg-brand text-white hover:bg-brand/90",
  // As strong, without the brand: Undo, a filter that's on.
  neutral: "bg-ink text-white hover:bg-ink/85",
  // The quieter choice beside a primary one.
  secondary: "border border-stone-300 bg-white text-ink hover:border-stone-400 hover:bg-stone-50",
  // Words that act, with a fill only under the pointer (a shade of what's
  // behind, so it shows on white and on the sand colour). Its words take the
  // colour around them.
  ghost: "hover:bg-black/5 active:bg-black/10",
  // Can't be undone: delete, remove.
  danger: "bg-red-700 text-white hover:bg-red-800",
  // White, on a dark ground or a photo.
  light: cn("bg-white text-ink hover:bg-stone-100", focusOnDark),
  // On a photo: the glass, darker under the pointer.
  glass: cn(glass, "hover:bg-black/75", focusOnDark),
};

// A button's shape and type, every one round-ended and a fingertip tall
// (44px, or 48px for the main thing to do), its icon never squeezed by its
// words. For a button whose colours mean something of their own (a like is
// rose, a pass amber); otherwise `button`. `flush`: words that line up with
// the column they're in, the pill reaching only a little past them, so its
// fill and its focus ring stay clear of the edge of the screen or the sheet.
export const pill = (
  size: ButtonSize = "md",
  { icon = false, block = false, flush = false }: { icon?: boolean; block?: boolean; flush?: boolean } = {},
) =>
  cn(
    "inline-flex items-center justify-center rounded-full text-center font-semibold transition-colors select-none disabled:cursor-not-allowed disabled:opacity-60 [&>svg]:shrink-0",
    icon ? ICON[size] : cn(SIZE[size], flush ? "-ml-2 px-2" : PAD[size]),
    block && "w-full",
  );

// Every button and button-like link: `kind` says how strongly it asks,
// `size` how tall it is. `icon`: a round button with only an icon (and a
// name for screen readers). `block`: as wide as its column. `flush`: as
// for `pill`.
export const button = ({
  kind,
  size = "md",
  icon = false,
  block = false,
  flush = false,
}: {
  kind: ButtonKind;
  size?: ButtonSize;
  icon?: boolean;
  block?: boolean;
  flush?: boolean;
}) => cn(pill(size, { icon, block, flush }), KIND[kind]);

// A text box: 48px tall, its edge and a solid ring in the brand colour while
// you type in it, red when what's in it was wrong. `lines`: a box for a few
// lines, as tall as its rows. `pill`: round-ended and 44px, sized to what's
// in it, in a row of round-ended filters (the map's search and its choices;
// `small` type there). `big`: a title being renamed, in the heading's own
// type. `quiet`: a link to copy, grey and edgeless, there to be selected
// rather than typed in.
export const field = ({
  lines = false,
  pill = false,
  big = false,
  quiet = false,
  small = false,
}: { lines?: boolean; pill?: boolean; big?: boolean; quiet?: boolean; small?: boolean } = {}) =>
  cn(
    // (Its own ring takes the place of the outline every other control gets on focus.)
    "border text-ink outline-hidden! placeholder:text-stone-500 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60 aria-invalid:border-red-600",
    quiet ? "border-transparent bg-stone-100" : "border-stone-300 bg-white",
    big ? "font-display text-2xl" : quiet || small ? "text-sm" : "text-base",
    lines
      ? "min-h-24 w-full resize-y rounded-xl px-4 py-3"
      : pill
        ? "h-11 rounded-full px-4"
        : big
          ? "h-14 w-full rounded-xl px-4"
          : "h-12 w-full rounded-xl px-4",
  );

// A white card on the page's sand colour, edged rather than shadowed. Its
// padding is the page's to choose.
export const card = "rounded-2xl bg-white ring-1 ring-stone-200";


// Someone's face: an agent's in ink, a buyer's (yours included) in the
// brand's colour, someone unnamed in stone. On the dark ground, stone is
// darker, so it's still a face rather than a hole.
export type AvatarTone = "person" | "agent" | "anonymous";
export const avatarColor = (tone: AvatarTone, { dark = false }: { dark?: boolean } = {}) =>
  tone === "agent"
    ? "bg-ink text-white"
    : tone === "person"
      ? "bg-brand text-white"
      : dark
        ? "bg-stone-500 text-white"
        : "bg-stone-200 text-stone-600";
