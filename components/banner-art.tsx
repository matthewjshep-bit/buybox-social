import type { ReactNode } from "react";

// The band across the top of someone's page (and their card on the home): a
// little drawn scene of home, never a photo. Four of them (a house on the
// hills, a front porch, a street of houses, a picket fence with a mailbox),
// each in a palette. Anyone's is one of eight, set in warm colours; an
// agent's is one of the four in their own brand colour. Each person always
// gets the same one, picked from their page's id. Drawn here, so it weighs
// nothing and never looks like a listing. Everything that matters stands to
// the right: their face sits over the band's lower left.

type Palette = {
  sky: [string, string];
  sun: string;
  far: string;
  near: string;
  house: string;
  roof: string;
  door: string;
  tree: string;
};

type Motif = "hills" | "porch" | "street" | "fence";

const WARM: Record<string, Palette> = {
  peach: { sky: ["#FDEBDC", "#F8C9A9"], sun: "#FFF6EC", far: "#EBAA8B", near: "#D98568", house: "#FFF9F3", roof: "#B85A43", door: "#8E3F2E", tree: "#C46F55" },
  sage: { sky: ["#EDF4E8", "#D2E6CB"], sun: "#FFFBEA", far: "#A5C9A1", near: "#76A878", house: "#FBF8F1", roof: "#4C7A54", door: "#355A3C", tree: "#5E9563" },
  sky: { sky: ["#E3EFFB", "#BCD8F2"], sun: "#FFF8DA", far: "#94BCDB", near: "#6497C0", house: "#FFFFFF", roof: "#3C6E98", door: "#2B5274", tree: "#4F84AE" },
  lavender: { sky: ["#EEE7F7", "#CFC1EA"], sun: "#FFFFFF", far: "#AB9AD2", near: "#8371B2", house: "#F8F4FF", roof: "#5A4989", door: "#423468", tree: "#6E5CA0" },
  golden: { sky: ["#FFF4D4", "#FFD991"], sun: "#FFFFFF", far: "#EDB65A", near: "#CF9133", house: "#FFFAEE", roof: "#97581D", door: "#6E3F14", tree: "#B8792A" },
  sea: { sky: ["#E2F4F1", "#B8E1DA"], sun: "#FFFDF2", far: "#82C4B9", near: "#529F94", house: "#F6FFFD", roof: "#2E6D65", door: "#1F4F49", tree: "#3F877D" },
  blush: { sky: ["#FDE9EF", "#F6C6D5"], sun: "#FFF8FA", far: "#E6A0B6", near: "#CA7392", house: "#FFF7FA", roof: "#9A3E61", door: "#732D48", tree: "#B35A7B" },
  sand: { sky: ["#F7EEE2", "#EAD7BD"], sun: "#FFFCF6", far: "#D0B38B", near: "#AC8D63", house: "#FFFCF5", roof: "#795A36", door: "#5A4227", tree: "#93744C" },
};

// The eight anyone can have: each a scene in its own colours.
const SCENES: { motif: Motif; palette: Palette }[] = [
  { motif: "porch", palette: WARM.peach },
  { motif: "hills", palette: WARM.sage },
  { motif: "street", palette: WARM.sky },
  { motif: "fence", palette: WARM.lavender },
  { motif: "street", palette: WARM.golden },
  { motif: "porch", palette: WARM.sea },
  { motif: "fence", palette: WARM.blush },
  { motif: "hills", palette: WARM.sand },
];
const MOTIFS: Motif[] = ["porch", "street", "hills", "fence"];

// The same number for the same id, every time.
const hashOf = (seed: string) => [...seed].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7);

// A colour mixed toward white (`by` > 0) or black (`by` < 0).
function mix(hex: string, by: number) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const target = by > 0 ? 255 : 0;
  return `#${channels
    .map((c) => Math.round(c + (target - c) * Math.abs(by)))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

// An agent's colours, from theirs.
const brandPalette = (brand: string): Palette => ({
  sky: [mix(brand, 0.9), mix(brand, 0.74)],
  sun: "#FFFFFF",
  far: mix(brand, 0.5),
  near: mix(brand, 0.2),
  house: "#FFFFFF",
  roof: mix(brand, -0.15),
  door: mix(brand, -0.4),
  tree: mix(brand, 0.05),
});

// The scenes anyone can choose, by name: the eight in warm colours, and (an
// agent) the four in their own colour.
export const WARM_SCENES = SCENES.map((_, i) => `scene${i}`);
export const BRAND_SCENES: string[] = MOTIFS;

// `pick`: the scene they chose ("scene3", or "porch" in an agent's colour);
// without one, the scene picked for them from `seed`.
export function BannerArt({ seed, brand, pick }: { seed: string; brand?: string | null; pick?: string | null }) {
  const n = hashOf(seed);
  const own = brand && /^#[0-9a-f]{6}$/i.test(brand) ? brand : null;
  const chosenScene = pick?.startsWith("scene") ? SCENES[Number(pick.slice(5))] : undefined;
  const chosenMotif = MOTIFS.find((motif) => motif === pick);
  const { motif, palette } =
    chosenScene ??
    (chosenMotif
      ? // (Someone with no colour of their own gets the first warm scene of that kind.)
        own
        ? { motif: chosenMotif, palette: brandPalette(own) }
        : SCENES.find((scene) => scene.motif === chosenMotif)!
      : own
        ? { motif: MOTIFS[n % MOTIFS.length], palette: brandPalette(own) }
        : SCENES[n % SCENES.length]);
  // (Its own id: several scenes can be on one page, in the picker.)
  const id = `sky-${n % 9973}-${pick ?? "own"}`;
  const scene: Record<Motif, (p: Palette) => ReactNode> = { hills: Hills, porch: Porch, street: Street, fence: Fence };
  return (
    <svg aria-hidden viewBox="0 0 600 160" preserveAspectRatio="xMidYMid slice" className="block size-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.sky[0]} />
          <stop offset="1" stopColor={palette.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="600" height="160" fill={`url(#${id})`} />
      {scene[motif](palette)}
    </svg>
  );
}

function Sun({ x, y, p }: { x: number; y: number; p: Palette }) {
  return (
    <>
      <circle cx={x} cy={y} r="32" fill={p.sun} opacity="0.35" />
      <circle cx={x} cy={y} r="19" fill={p.sun} />
    </>
  );
}

function Tree({ x, base, r, p }: { x: number; base: number; r: number; p: Palette }) {
  return (
    <g fill={p.tree}>
      <rect x={x - 1.5} y={base - r - 6} width="3" height={r + 6} rx="1.5" />
      <circle cx={x} cy={base - r - 6} r={r} />
    </g>
  );
}

// A small house: walls, roof, door, windows, and the porch light on.
function House({ x, base, w, h, p, roof = p.roof }: { x: number; base: number; w: number; h: number; p: Palette; roof?: string }) {
  const top = base - h;
  return (
    <g>
      <rect x={x - w / 2} y={top} width={w} height={h} rx="2" fill={p.house} />
      <path d={`M${x - w / 2 - 7} ${top + 2} L${x} ${top - h * 0.62} L${x + w / 2 + 7} ${top + 2} Z`} fill={roof} />
      <rect x={x - w * 0.11} y={base - h * 0.55} width={w * 0.22} height={h * 0.55} rx="1.5" fill={p.door} />
      <rect x={x - w * 0.4} y={top + h * 0.22} width={w * 0.18} height={h * 0.24} rx="1" fill={p.sky[1]} />
      <rect x={x + w * 0.22} y={top + h * 0.22} width={w * 0.18} height={h * 0.24} rx="1" fill={p.sky[1]} />
      <circle cx={x + w * 0.17} cy={base - h * 0.42} r="2.2" fill="#FFE29A" />
    </g>
  );
}

// A house on the hills, between two trees.
function Hills(p: Palette) {
  return (
    <>
      <Sun x={230} y={44} p={p} />
      <path d="M0 112 C 90 84, 180 92, 260 104 S 440 80, 600 98 L600 160 L0 160 Z" fill={p.far} />
      <path d="M0 136 C 120 112, 220 120, 330 130 S 500 114, 600 124 L600 160 L0 160 Z" fill={p.near} />
      <Tree x={340} base={128} r={11} p={p} />
      <Tree x={500} base={126} r={9} p={p} />
      <House x={420} base={128} w={74} h={46} p={p} />
    </>
  );
}

// Up close at the front door: the siding, a window with shutters, the door
// with a wreath and a light beside it, columns, the railing, a plant, the steps.
function Porch(p: Palette) {
  const siding = Array.from({ length: 11 }, (_, i) => 22 + i * 11);
  const balusters = (from: number, to: number) =>
    Array.from({ length: Math.floor((to - from) / 9) + 1 }, (_, i) => from + i * 9);
  return (
    <>
      <rect width="600" height="160" fill={p.sky[1]} />
      {siding.map((y) => (
        <line key={y} x1="0" y1={y} x2="600" y2={y} stroke={p.far} strokeOpacity="0.35" strokeWidth="1.2" />
      ))}
      {/* The roof's edge overhead. */}
      <rect width="600" height="16" fill={p.roof} />
      <rect y="16" width="600" height="4" fill={p.door} opacity="0.35" />
      {/* A window with shutters, the sky in it. */}
      <rect x="214" y="44" width="14" height="56" rx="1.5" fill={p.roof} />
      <rect x="292" y="44" width="14" height="56" rx="1.5" fill={p.roof} />
      <rect x="230" y="44" width="60" height="56" rx="2" fill={p.sky[0]} stroke={p.door} strokeWidth="3" />
      <line x1="260" y1="44" x2="260" y2="100" stroke={p.door} strokeWidth="2.5" />
      <line x1="230" y1="72" x2="290" y2="72" stroke={p.door} strokeWidth="2.5" />
      {/* The door, its little window, the wreath, the knob, and the light. */}
      <rect x="378" y="52" width="48" height="90" rx="3" fill={p.door} />
      <rect x="388" y="60" width="28" height="14" rx="2" fill={p.sky[0]} opacity="0.9" />
      <circle cx="402" cy="94" r="10" fill="none" stroke={p.tree} strokeWidth="5" />
      <circle cx="402" cy="86" r="2.5" fill={p.roof} />
      <circle cx="418" cy="104" r="2.2" fill="#FFE29A" />
      <circle cx="446" cy="76" r="14" fill="#FFE29A" opacity="0.35" />
      <rect x="441" y="68" width="10" height="14" rx="2" fill="#FFE29A" stroke={p.door} strokeWidth="1.5" />
      {/* Columns, and the railing either side of the steps. */}
      <rect x="338" y="20" width="12" height="122" fill="#FFFFFF" opacity="0.9" />
      <rect x="468" y="20" width="12" height="122" fill="#FFFFFF" opacity="0.9" />
      <rect x="350" y="112" width="24" height="4" fill="#FFFFFF" />
      <rect x="430" y="112" width="38" height="4" fill="#FFFFFF" />
      <rect x="480" y="112" width="120" height="4" fill="#FFFFFF" />
      {[...balusters(354, 372), ...balusters(434, 466), ...balusters(484, 598)].map((x) => (
        <rect key={x} x={x} y="116" width="3.5" height="26" fill="#FFFFFF" />
      ))}
      {/* A plant in a pot by the door. */}
      <path d="M502 142 L506 124 L524 124 L528 142 Z" fill={p.roof} />
      <circle cx="508" cy="118" r="8" fill={p.tree} />
      <circle cx="521" cy="114" r="10" fill={p.tree} />
      <circle cx="515" cy="108" r="7" fill={p.tree} />
      {/* The porch floor, and the steps down. */}
      <rect y="142" width="600" height="6" fill={p.near} />
      <rect x="370" y="148" width="64" height="6" fill={p.far} />
      <rect x="364" y="154" width="76" height="6" fill={p.near} />
    </>
  );
}

// A street of houses, each its own shape, with trees between.
function Street(p: Palette) {
  return (
    <>
      <Sun x={530} y={40} p={p} />
      <rect y="128" width="600" height="32" fill={p.near} />
      <rect y="132" width="600" height="5" fill={p.far} opacity="0.7" />
      <House x={232} base={128} w={50} h={34} p={p} />
      <Tree x={272} base={128} r={10} p={p} />
      <House x={318} base={128} w={64} h={44} p={p} roof={p.door} />
      {/* A chimney on that one. */}
      <rect x="330" y="60" width="9" height="18" fill={p.door} />
      <House x={398} base={128} w={46} h={52} p={p} />
      <Tree x={438} base={128} r={8} p={p} />
      <House x={478} base={128} w={56} h={36} p={p} roof={p.door} />
      <House x={556} base={128} w={50} h={44} p={p} />
    </>
  );
}

// A picket fence along the front, a mailbox, and the path up to the house.
function Fence(p: Palette) {
  const pickets = Array.from({ length: 30 }, (_, i) => 180 + i * 14).filter((x) => x < 380 || x > 420);
  return (
    <>
      <Sun x={250} y={42} p={p} />
      <path d="M0 104 C 140 88, 300 94, 420 98 S 540 90, 600 94 L600 160 L0 160 Z" fill={p.far} />
      <House x={400} base={100} w={62} h={38} p={p} />
      <Tree x={330} base={100} r={12} p={p} />
      <Tree x={480} base={100} r={10} p={p} />
      <rect y="120" width="600" height="40" fill={p.near} />
      {/* The path from the gate up to the door. */}
      <path d="M392 100 L408 100 L428 160 L372 160 Z" fill={p.sky[1]} opacity="0.8" />
      {/* The fence: rails, then pickets with points. */}
      <rect x="176" y="116" width="200" height="4" fill={p.house} />
      <rect x="176" y="130" width="200" height="4" fill={p.house} />
      <rect x="424" y="116" width="176" height="4" fill={p.house} />
      <rect x="424" y="130" width="176" height="4" fill={p.house} />
      {pickets.map((x) => (
        <path key={x} d={`M${x} 144 L${x} 110 L${x + 4} 104 L${x + 8} 110 L${x + 8} 144 Z`} fill={p.house} />
      ))}
      {/* A mailbox on its post, its flag up. */}
      <rect x="452" y="106" width="4" height="40" fill={p.door} />
      <rect x="440" y="94" width="28" height="15" rx="7" fill={p.roof} />
      <rect x="466" y="86" width="3" height="14" fill={p.door} />
      <rect x="469" y="86" width="9" height="6" fill="#E25C4B" />
      {/* Flowers along the bottom. */}
      {[196, 238, 280, 330, 500, 548, 584].map((x, i) => (
        <circle key={x} cx={x} cy={148 + (i % 2) * 4} r="3.5" fill={i % 2 ? p.sun : "#FFE29A"} />
      ))}
    </>
  );
}
