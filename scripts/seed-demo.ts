// Fills a local database with believable activity, so the feed, a home's page,
// profiles and the agent dashboard have something to show: a dozen people
// liking spots in the sample homes and talking about them, a buyer with a full
// profile, and an agent with two links; then a crowd on top (four dozen more
// buyers, some signed up, and four more agents with clients of their own), so
// every home looks lived in. Runs against this machine, or another database
// only when DEMO_SEED_HOST names that database's host, on purpose.
// Safe to run again: it clears its own rows (demo emails, "demo:" devices)
// and makes them fresh, leaving everything else alone. With --clear, it only
// clears them.
import { createHash } from "node:crypto";
import postgres from "postgres";
import type { Listing } from "../lib/listings/types";
import {
  aspectOfFact,
  aspectOfTag,
  FACTS,
  isFactTag,
  isTagIn,
  mediaKeyOf,
  pointTag,
  thingOf,
  type FactTag,
} from "../lib/photos";
import { ASPECTS, type Aspect } from "../lib/reactions";

function hostOf(url: string | undefined) {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}

const host = hostOf(process.env.DATABASE_URL);
const local = host === "127.0.0.1" || host === "localhost";
// A database elsewhere (the live one) only when it's named outright.
if (!host || (!local && process.env.DEMO_SEED_HOST !== host)) {
  console.error(
    "Not seeding: db:demo writes to a database on this machine, and DATABASE_URL is missing or isn't " +
      "127.0.0.1 or localhost. Point .env.local at your local database (pnpm db:local) and try again. " +
      "(To seed another database on purpose, set DEMO_SEED_HOST to its host.)",
  );
  process.exit(1);
}
const CLEAR_ONLY = process.argv.includes("--clear");

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1, onnotice: () => {} });
type Tx = postgres.TransactionSql;

// How demo rows are known, so a second run replaces them and nothing else.
const DEMO_DEVICE = "demo:";
const DEMO_DOMAIN = "@demo.buyboxsocial.test";

// The same ids and links on every run, so a profile or share link you've
// bookmarked still opens after seeding again.
const digest = (name: string) => createHash("sha256").update(`buybox-demo:${name}`).digest();
const demoId = (name: string) => {
  const bytes = digest(name).subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const demoToken = (name: string) => digest(name).toString("base64url").slice(0, 32);

// Times are hours before now, so the activity always looks recent.
const NOW = Date.now();
const d = (days: number) => days * 24;
const h = (hours: number) => hours;
const m = (minutes: number) => minutes / 60;
const ago = (hours: number) => new Date(NOW - hours * 3_600_000);
// A few minutes after `at`, but never in the future.
const after = (at: number, minutes: number) => Math.max(at - minutes / 60, 1 / 60);

// The same "random" choices every run.
let seed = 20261106;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
};

// Something in a photo: photo number (1 is the first) and a named thing in it,
// or a spot tapped at x, y (fractions across and down). Or one of the facts.
type Pin = readonly [photo: number, thing: string] | readonly [photo: number, x: number, y: number];
type On = Pin | FactTag;

type Reply = { who: string; text: string; at: number; likedBy?: string[] };
type Say = { text: string; on?: On; likedBy?: string[]; replies?: Reply[]; shared?: boolean };

// One person on one home, at one time.
type Visit = {
  home: number;
  at: number;
  react?: "like" | "dislike";
  liked?: Aspect[];
  disliked?: Aspect[];
  hearts?: On[];
  nopes?: On[];
  says?: Say[];
};

const key = (home: number) => `SAMPLE-${home}`;

// Everyone on the public side, and what they're looking for.
const PEOPLE: { slug: string; name: string }[] = [
  // Clean modern lines, glass, light and an open kitchen; balks at the top prices.
  { slug: "matthew", name: "Matthew" },
  // Old houses with character: porches, wood floors, gardens. Cold modern is out.
  { slug: "sofia", name: "Sofia" },
  // A family of five: bedrooms, a yard and room to spread out.
  { slug: "marcus", name: "Marcus" },
  // Walk to coffee and the bus; the city over square footage.
  { slug: "priya", name: "Priya" },
  // A first home on a budget: price first, happy to fix things up.
  { slug: "elena", name: "Elena" },
  // Cooks every night, so the kitchen makes or breaks it.
  { slug: "james", name: "James" },
  // Trees, quiet and something green out every window.
  { slug: "hannah", name: "Hannah" },
  // Architecture first: cedar, glass, bold shapes. Bored by traditional.
  { slug: "theo", name: "Theo" },
  // Downsizing: easy upkeep, no big stairs, near the water.
  { slug: "grace", name: "Grace" },
  // An investor's eye: good bones at a good price.
  { slug: "diego", name: "Diego" },
  // Chases light: big windows, bright rooms. Dark rooms are a pass.
  { slug: "aisha", name: "Aisha" },
  // The demo buyer account: warm, bright homes with character and a real
  // kitchen, near the water, around $1M at most.
  { slug: "maya", name: "Maya" },
];

const VISITS: Record<string, Visit[]> = {
  matthew: [
    {
      home: 1001, at: d(9), react: "like", liked: ["vibe"], disliked: ["light"],
      hearts: [[3, "Kitchen"], [3, "Gas range"], [2, "Built-in shelves"]],
      nopes: [[2, "Big windows"]],
    },
    {
      home: 1004, at: d(5.5), react: "dislike", disliked: ["aesthetic"],
      hearts: [[2, "Vaulted ceiling"]],
      nopes: [[3, "Gallery wall"], [1, 0.3, 0.55]],
    },
    {
      home: 1002, at: d(4.2), react: "like", liked: ["layout", "vibe"],
      hearts: [[2, "Floor-to-ceiling windows"], [2, "Open kitchen"], [1, "Modern design"], [4, 0.66, 0.55]],
      nopes: ["Price"],
      says: [
        {
          text: "Those windows. I'd live in this living room.",
          on: [2, "Floor-to-ceiling windows"],
          likedBy: ["theo", "aisha"],
          replies: [{ who: "elena", text: "Same, until I saw the price.", at: d(3.9), likedBy: ["diego", "maya"] }],
        },
      ],
    },
    {
      home: 1013, at: d(2.1), react: "like", disliked: ["price"],
      hearts: [[1, "Wood accents"], [1, 0.62, 0.48]],
      nopes: ["Price"],
      says: [{ text: "Love the wood against the dark siding. The price is a lot, though.", likedBy: ["elena"] }],
    },
    {
      home: 1007, at: d(1.3), react: "like", liked: ["location"],
      hearts: [[2, "Big windows"], [1, "Wall sconces"]],
      says: [
        {
          text: "Rooftop deck plus that light. Fremont is the dream.",
          likedBy: ["priya"],
          replies: [{ who: "priya", text: "The rooftop at sunset must be something.", at: m(24) }],
        },
      ],
    },
    { home: 1011, at: h(20), hearts: [[1, "Modern facade"], [1, 0.6, 0.5]] },
    {
      home: 1005, at: m(9), react: "like", liked: ["vibe"],
      hearts: [[2, "Floating staircase"], [1, "Floor-to-ceiling windows"], [3, 0.72, 0.36]],
      nopes: [[4, "Wall art"]],
      says: [{ text: "That staircase is a whole mood.", on: [2, "Floating staircase"] }],
    },
  ],

  sofia: [
    {
      home: 1001, at: d(11), react: "like", liked: ["vibe", "location"],
      hearts: [[1, "Covered porch"], [2, "Built-in shelves"], [2, "Hardwood floors"], [3, "Hexagon backsplash"], [1, 0.18, 0.62]],
      says: [
        {
          text: "A real Craftsman porch, and the original fir floors. This is the one I'd fight for.",
          on: [1, "Covered porch"],
          likedBy: ["maya", "priya", "james"],
          replies: [{ who: "maya", text: "Agreed. The built-ins sold me.", at: d(10.55), likedBy: ["sofia"] }],
        },
      ],
    },
    {
      home: 1006, at: d(10), react: "like", liked: ["vibe"],
      hearts: [[3, "Vintage dresser"], [1, "Arched window"], [3, "Potted ficus"]],
    },
    {
      home: 1003, at: d(8), react: "dislike", disliked: ["aesthetic"],
      hearts: [[1, "Wraparound porch"]],
      nopes: [[2, "Media wall"]],
    },
    {
      home: 1008, at: d(7), react: "like", liked: ["vibe"],
      hearts: [[1, "Blue shutters"], [1, "Picket fence"], [1, "Garden"], [2, "Windows"], "Price"],
      says: [{ text: "Blue shutters and a picket fence. It's a storybook.", on: [1, "Blue shutters"], likedBy: ["grace", "maya"] }],
    },
    {
      home: 1009, at: d(3.4), react: "like", liked: ["vibe", "price"],
      hearts: [[1, "Red front door"], [1, "Maple trees"], [1, 0.47, 0.35]],
      says: [{ text: "That red door. Trim like this from 1925 is so hard to find now.", on: [1, "Red front door"], likedBy: ["elena"] }],
    },
    {
      home: 1013, at: d(2.6), react: "dislike", disliked: ["aesthetic", "vibe"],
      hearts: [[1, "Courtyard"]],
      nopes: [[1, "Perforated screens"]],
      says: [
        {
          text: "Beautiful, but it feels a bit like an office to me.",
          likedBy: ["aisha"],
          replies: [{ who: "theo", text: "The screens are the best part, I promise.", at: d(2.4) }],
        },
      ],
    },
  ],

  marcus: [
    {
      home: 1003, at: d(9.5), react: "like", liked: ["price", "layout"],
      hearts: [[1, "Lawn"], [3, "Kitchen island"], [2, "Media wall"], "Bedrooms", "Price"],
      says: [{ text: "Big sunny lawn and four bedrooms under 750. Hard to beat.", on: [1, "Lawn"], likedBy: ["elena", "diego"] }],
    },
    {
      home: 1006, at: d(6.2), react: "like", liked: ["layout", "location"],
      hearts: [[1, "Lawn"], [2, "Fireplace"], [2, "Dining area"], "Bedrooms", "Square footage"],
      says: [
        {
          text: "Five bedrooms on a cul-de-sac. The kids could ride bikes out front.",
          likedBy: ["aisha", "grace"],
          replies: [{ who: "grace", text: "Ours grew up on one. Best thing we did.", at: d(5.9) }],
        },
      ],
    },
    { home: 1008, at: d(5), react: "dislike", disliked: ["layout"], nopes: ["Bathrooms"] },
    {
      home: 1012, at: d(4.8), react: "like", liked: ["layout"],
      hearts: [[1, "Front lawn"], [1, "Three-car garage"], "Bedrooms", "Bathrooms"],
      says: [{ text: "Room for everyone, and a garage for all the bikes.", on: [1, "Three-car garage"] }],
    },
    {
      home: 1007, at: d(3.9), react: "dislike", disliked: ["layout"],
      nopes: ["Bedrooms", "Square footage"],
      says: [{ text: "Cute, but two bedrooms won't work for us." }],
    },
    {
      home: 1009, at: d(2.9), react: "dislike", disliked: ["bathrooms"],
      hearts: [[1, "Maple trees"]],
      nopes: ["Bathrooms"],
    },
  ],

  priya: [
    {
      home: 1001, at: d(8.4), react: "like", liked: ["location"],
      hearts: [[1, "Front door"], [2, "Hanging plants"], "Address"],
      says: [{ text: "The park and coffee a short walk away is exactly what I want.", on: "Address" }],
    },
    {
      home: 1004, at: d(5.1), react: "dislike", disliked: ["location"],
      hearts: [[2, "Bay window"]],
      nopes: ["Address"],
      says: [
        {
          text: "Gorgeous, but I'd be in the car for everything.",
          replies: [{ who: "hannah", text: "That's the point for some of us.", at: d(4.9), likedBy: ["grace", "matthew"] }],
        },
      ],
    },
    {
      home: 1008, at: d(4.4), react: "like", liked: ["location", "price"],
      hearts: [[2, "Abstract art"], [1, "Chimney"]],
      says: [{ text: "Blocks from the ferry. Weekends in Seattle without a car." }],
    },
    {
      home: 1007, at: d(2), react: "like", liked: ["location", "layout"],
      hearts: [[2, "Dining table"], [2, "Kitchen"], [1, "Front entry"], "Address"],
      says: [{ text: "Walk to the canal, coffee and the trail. Sold.", likedBy: ["matthew", "grace"] }],
    },
    { home: 1010, at: d(1.9), react: "dislike", disliked: ["location"], nopes: ["Address"] },
  ],

  elena: [
    {
      home: 1003, at: d(7.6), react: "like", liked: ["price", "layout"],
      hearts: [[3, "Subway backsplash"], [3, "White cabinets"], "Price", "Square footage"],
    },
    { home: 1008, at: d(6.5), react: "like", liked: ["price"], hearts: ["Price", [1, 0.6, 0.86]] },
    {
      home: 1009, at: d(5.8), react: "like", liked: ["price", "vibe"],
      hearts: [[1, "Picket fence"], [1, "Green roof"], [1, 0.72, 0.62], "Price"],
      says: [
        {
          text: "This is actually in my budget. Going to see it this weekend.",
          on: "Price",
          likedBy: ["diego", "sofia"],
          replies: [{ who: "diego", text: "Good bones, too. Have someone look at the roof when you go.", at: d(5.5), likedBy: ["elena"] }],
        },
      ],
    },
    { home: 1002, at: d(4), react: "dislike", disliked: ["price"], hearts: [[4, "Soaking tub"]], nopes: ["Price"] },
    { home: 1005, at: d(3.3), react: "dislike", disliked: ["price"], hearts: [[4, "Reading nook"]], nopes: ["Price"] },
    {
      home: 1010, at: d(3), react: "like", liked: ["price"], disliked: ["layout"],
      hearts: [[1, "Wildflowers"], "Price"],
      nopes: ["Square footage"],
    },
    { home: 1013, at: d(1.8), react: "dislike", disliked: ["price"], nopes: ["Price"] },
  ],

  james: [
    {
      home: 1001, at: d(10.2), react: "like", liked: ["layout"],
      hearts: [[3, "Gas range"], [3, "Marble counters"], [3, "Range hood"], [3, 0.24, 0.66]],
      nopes: [[3, "Glass cabinets"]],
      says: [
        { text: "A real gas range. I'd cook here every night.", on: [3, "Gas range"], likedBy: ["sofia", "maya"] },
        { text: "Glass fronts mean my mess is on display.", on: [3, "Glass cabinets"], likedBy: ["matthew"] },
      ],
    },
    {
      home: 1003, at: d(6.8), react: "like", liked: ["layout"],
      hearts: [[3, "Kitchen island"], [3, "Stainless appliances"], [3, "Pendant lights"], [3, 0.3, 0.75]],
      says: [
        {
          text: "That island seats four. Sunday dinners, sorted.",
          on: [3, "Kitchen island"],
          likedBy: ["marcus", "elena", "maya"],
          replies: [{ who: "maya", text: "Four stools and still room to cook. Yes.", at: d(6.3), likedBy: ["james"] }],
        },
      ],
    },
    {
      home: 1007, at: d(2.4), react: "dislike", disliked: ["kitchen"],
      nopes: [[2, "Kitchen"]],
      says: [
        {
          text: "Where does anyone cook in this? The kitchen is one wall.",
          on: [2, "Kitchen"],
          replies: [{ who: "priya", text: "I'd eat out most nights anyway.", at: d(2.2), likedBy: ["matthew"] }],
        },
      ],
    },
  ],

  hannah: [
    {
      home: 1004, at: d(6.6), react: "like", liked: ["vibe"],
      hearts: [[1, "Evergreens"], [1, "Cedar siding"], [3, "Natural light"], [2, 0.82, 0.42]],
      says: [
        {
          text: "Tall trees all around and still close to the harbor. I could breathe here.",
          on: [1, "Evergreens"],
          likedBy: ["grace", "maya", "aisha"],
        },
      ],
    },
    {
      home: 1012, at: d(4.1), react: "dislike", disliked: ["exterior"],
      nopes: [[1, "Three-car garage"]],
      says: [{ text: "The garage is the first thing you see. Not for me.", on: [1, "Three-car garage"], likedBy: ["theo"] }],
    },
    { home: 1007, at: d(3.6), react: "dislike", disliked: ["location", "yard"], nopes: ["Address"] },
    {
      home: 1005, at: d(2.7), react: "like", liked: ["vibe"],
      hearts: [[3, "Tree views"], [3, "Deck"], [3, "Rocking chair"]],
      says: [{ text: "Morning coffee on that deck, looking at the trees.", on: [3, "Deck"], likedBy: ["matthew", "maya"] }],
    },
    {
      home: 1010, at: m(55), react: "like", liked: ["vibe", "price"],
      hearts: [[1, "Meadow"], [1, "Wildflowers"], [1, 0.8, 0.3]],
      says: [{ text: "A whole meadow. Small inside, but look at that light.", on: [1, "Meadow"] }],
    },
  ],

  theo: [
    { home: 1006, at: d(8.8), react: "dislike", disliked: ["aesthetic", "exterior"], nopes: [[1, "Brick front"]] },
    {
      home: 1002, at: d(7.2), react: "like", liked: ["vibe"],
      hearts: [[2, "Wood accent wall"], [2, "Fireplace"], [4, "Clerestory window"]],
    },
    {
      home: 1011, at: d(6.3), react: "like", liked: ["vibe", "layout"],
      hearts: [[1, "Modern facade"], [1, "Front walk"]],
      says: [{ text: "Crisp. I'd want to see the courtyard before anything else." }],
    },
    {
      home: 1005, at: d(5.9), react: "like", liked: ["layout"],
      hearts: [[2, "Floating staircase"], [1, "Cedar panels"], [2, "Sideboard"]],
      says: [{ text: "Cedar and glass done right. The stair is the centerpiece.", likedBy: ["matthew", "hannah"] }],
    },
    { home: 1012, at: d(4.6), react: "dislike", disliked: ["aesthetic"], nopes: [[1, "Stone and shingle"]] },
    {
      home: 1013, at: d(3.1), react: "like", liked: ["vibe"],
      hearts: [[1, "Perforated screens"], [1, "Wood accents"], [1, "Courtyard"], [1, 0.4, 0.62]],
      says: [
        {
          text: "Those screens throw the best shadows. Serious architecture.",
          on: [1, "Perforated screens"],
          likedBy: ["matthew"],
        },
      ],
    },
  ],

  grace: [
    {
      home: 1006, at: d(7.9), react: "dislike", disliked: ["layout"],
      nopes: ["Square footage"],
    },
    {
      home: 1005, at: d(4.5), react: "dislike", disliked: ["layout"],
      nopes: [[2, "Floating staircase"]],
      says: [
        {
          text: "Lovely, but no railing on those stairs is a no for my knees.",
          on: [2, "Floating staircase"],
          replies: [{ who: "theo", text: "Fair. It's a looker, though.", at: d(4.3) }],
        },
      ],
    },
    {
      home: 1008, at: d(3.7), react: "like", liked: ["location", "vibe"],
      hearts: [[1, "Garden"], [2, "White sofa"], [2, "Table lamps"], "Address"],
      says: [{ text: "A few blocks from the ferry and the water. Just enough house.", likedBy: ["sofia", "priya", "maya"] }],
    },
    { home: 1010, at: d(2.5), react: "like", liked: ["price"], hearts: [[1, "Red siding"]] },
    {
      home: 1007, at: d(2.2), react: "like", liked: ["location"],
      hearts: [[1, "Landscaping"]],
      says: [{ text: "No lawn to mow. That's my kind of yard.", on: [1, "Landscaping"] }],
    },
    {
      home: 1004, at: d(1), react: "like", liked: ["vibe"],
      hearts: [[2, "Bay window"], [2, "Dining table"]],
      says: [{ text: "I'd put my reading chair in that bay window.", on: [2, "Bay window"], likedBy: ["aisha"] }],
    },
  ],

  diego: [
    { home: 1002, at: d(8.1), react: "dislike", disliked: ["price"], nopes: ["Price"] },
    {
      home: 1003, at: d(6.1), react: "like", liked: ["price", "location"],
      hearts: [[3, "Stainless appliances"], "Price", "Square footage"],
      says: [{ text: "2,650 square feet at this price is rare for Tacoma.", on: "Square footage", likedBy: ["marcus"] }],
    },
    { home: 1009, at: d(5.6), react: "like", liked: ["price"], hearts: [[1, "Green roof"], [1, 0.4, 0.8], "Price"] },
    {
      home: 1010, at: d(4.2), react: "like", liked: ["price"],
      hearts: ["Price"],
      says: [{ text: "Great price for the land. The cabin is a blank canvas." }],
    },
    { home: 1012, at: d(3.5), react: "dislike", disliked: ["price"], nopes: ["Price"] },
  ],

  aisha: [
    {
      home: 1001, at: h(7), react: "like",
      hearts: [[2, "Big windows"], [4, "Bathroom window"]],
      says: [{ text: "Windows on two sides of the living room, and one in the bath. So much light.", on: [2, "Big windows"] }],
    },
    { home: 1006, at: d(6.9), react: "like", liked: ["layout"], hearts: [[2, "Natural light"], [2, "Fireplace"]] },
    {
      home: 1002, at: d(5.3), react: "like", liked: ["vibe"],
      hearts: [[2, "Floor-to-ceiling windows"], [4, "Clerestory window"], [3, "Glass doors"]],
      says: [{ text: "Walls of glass and a clerestory in the bath. All the light.", likedBy: ["matthew", "theo"] }],
    },
    {
      home: 1004, at: d(4.7), react: "like", liked: ["vibe"],
      hearts: [[3, "Natural light"], [2, "Bay window"], [2, 0.6, 0.3]],
      says: [{ text: "Morning light in the dining room is everything.", on: [2, 0.6, 0.3], likedBy: ["hannah"] }],
    },
    {
      home: 1013, at: d(1.5), react: "dislike", disliked: ["light", "aesthetic"],
      nopes: [[1, "Perforated screens"]],
      says: [
        {
          text: "Stunning outside, but I worry it's dark inside with all that cladding.",
          replies: [{ who: "theo", text: "The screens filter it. It's softer than you'd think.", at: d(1.3) }],
        },
      ],
    },
  ],

  // The demo account: busy across ten homes, so her profile and bell are full.
  maya: [
    {
      home: 1001, at: d(10.5), react: "like", liked: ["vibe", "location"],
      hearts: [[1, "Covered porch"], [2, "Built-in shelves"], [3, "Marble counters"], [3, "Hexagon backsplash"], [2, 0.38, 0.4], "Address"],
      nopes: [[4, "Pedestal sink"]],
      says: [
        {
          text: "Marble and a gas range in a 1924 house. They kept the soul.",
          on: [3, "Marble counters"],
          likedBy: ["sofia", "james"],
          replies: [{ who: "james", text: "And the hood vents outside. Rare in these.", at: d(10.1), likedBy: ["maya"] }],
        },
      ],
    },
    {
      home: 1003, at: d(6.4), react: "like", liked: ["price"],
      hearts: [[3, "Kitchen island"], [3, "Pendant lights"], [1, "Wraparound porch"]],
      nopes: [[2, "Media wall"]],
    },
    {
      home: 1009, at: d(5.2), react: "dislike", disliked: ["location"],
      hearts: [[1, "Red front door"]],
      nopes: ["Address"],
    },
    {
      home: 1002, at: d(4.6), react: "like", disliked: ["price"],
      hearts: [[2, "Floor-to-ceiling windows"], [4, "Soaking tub"]],
      nopes: ["Price"],
      says: [
        {
          text: "Dream bath, not a dream price.",
          on: "Price",
          likedBy: ["elena", "diego"],
          replies: [{ who: "elena", text: "Ha, exactly.", at: d(3.95) }],
        },
      ],
    },
    {
      home: 1008, at: d(4.1), react: "like", liked: ["location", "price"],
      hearts: [[1, "Blue shutters"], [2, "Abstract art"], [1, "Garden"], "Price"],
      says: [
        {
          text: "A garden, and the ferry and the water a few blocks away. Seriously thinking about this one.",
          likedBy: ["grace", "sofia"],
          replies: [{ who: "grace", text: "We might end up neighbors.", at: d(3.6), likedBy: ["maya"] }],
        },
      ],
    },
    {
      home: 1012, at: d(3.8), react: "dislike", disliked: ["price", "aesthetic"],
      nopes: [[1, "Three-car garage"], "Price", "Square footage"],
    },
    {
      home: 1004, at: d(3), react: "like", liked: ["vibe"],
      hearts: [[1, "Evergreens"], [2, "Vaulted ceiling"], [3, "Natural light"], [1, 0.22, 0.7], "Price"],
      says: [{ text: "The vaulted ceiling with all that wood. So warm.", on: [2, "Vaulted ceiling"], likedBy: ["hannah", "grace"] }],
    },
    {
      home: 1007, at: d(2.8), react: "dislike", disliked: ["layout"],
      hearts: [[2, "Big windows"]],
      nopes: ["Bedrooms"],
      says: [{ text: "Love the light, but I need a third bedroom for an office." }],
    },
    {
      home: 1005, at: d(2.3), react: "like", liked: ["layout"],
      hearts: [[4, "Yellow armchair"], [4, "Reading nook"], [3, "Tree views"], [4, 0.75, 0.6]],
      nopes: [[2, "Floating staircase"], "Price"],
      says: [
        {
          text: "This reading nook is exactly what I've been picturing.",
          on: [4, "Yellow armchair"],
          likedBy: ["hannah", "matthew"],
          replies: [{ who: "matthew", text: "Same. I'd never leave that chair.", at: h(3) }],
        },
      ],
    },
    {
      home: 1013, at: d(1.7), react: "dislike", disliked: ["price"],
      hearts: [[1, "Courtyard"]],
      nopes: ["Price"],
      says: [{ text: "That courtyard is lovely. The rest is a lot of house for me.", on: [1, "Courtyard"] }],
    },
    // Back for another look this morning.
    { home: 1004, at: m(41), hearts: [[3, 0.33, 0.47]] },
  ],
};

// The demo buyer, signed in by email with no password on a local server.
const MAYA = {
  id: demoId("account:maya"),
  email: `maya${DEMO_DOMAIN}`,
  fullName: "Maya Chen",
  phone: "(206) 555-0187",
  created: d(12),
};

const AGENT = {
  id: demoId("account:agent"),
  email: `agent${DEMO_DOMAIN}`,
  fullName: "Jordan Rivera",
  brokerage: "Harbor & Pine Realty",
  // "Puget Blue", one of the colors agents choose from.
  brandColor: "#1E3A5F",
  phone: "(425) 555-0136",
  created: d(13.5),
};

// What the agent says on a link, about one home.
type AgentNote = { home: number; text: string; at: number };

type ShareSeed = {
  slug: string;
  clientName: string;
  note: string;
  created: number;
  homes: number[];
  people: { slug: string; name: string; visits: Visit[] }[];
  agent: AgentNote[];
};

const SHARES: ShareSeed[] = [
  {
    slug: "nina-ben",
    clientName: "Nina & Ben",
    note: "Three from the list we talked about. Tap anything in the photos to tell me what works for you.",
    created: d(6.5),
    homes: [1001, 1004, 1008],
    people: [
      {
        slug: "nina",
        name: "Nina",
        visits: [
          {
            home: 1001, at: d(6.2), react: "like", liked: ["vibe"],
            hearts: [[1, "Covered porch"], [3, "Shaker cabinets"], [2, 0.3, 0.6]],
            says: [{ text: "I can already see us out here with coffee.", on: [1, "Covered porch"], shared: true }],
          },
          {
            home: 1004, at: d(5.9), react: "like", liked: ["vibe", "layout"],
            hearts: [[2, "Bay window"], [3, "Accent chairs"]],
            nopes: [[1, 0.15, 0.8]],
            says: [{ text: "Love the dining room. How long is the drive to Ben's work?" }],
          },
          {
            home: 1008, at: d(4.8), react: "like",
            hearts: [[1, "Picket fence"]],
            says: [{ text: "So cute, but is two bedrooms enough for us?" }],
          },
          { home: 1004, at: h(5), says: [{ text: "Saturday works. Can we see this one first?" }] },
        ],
      },
      {
        slug: "ben",
        name: "Ben",
        visits: [
          {
            home: 1001, at: d(5.8), react: "like", liked: ["location"], disliked: ["price"],
            hearts: [[3, "Gas range"], [1, "Mature trees"]],
            nopes: [[4, "Pedestal sink"], "Price"],
            says: [{ text: "Is there any room on the price? It's been listed a few weeks.", on: "Price" }],
          },
          {
            home: 1004, at: d(5.7), react: "like", liked: ["layout"],
            hearts: [[1, "Evergreens"], [1, "Cedar siding"]],
            says: [{ text: "This is the one for me. Quiet, trees, and a real yard." }],
          },
          {
            home: 1008, at: d(4.6), react: "dislike", disliked: ["layout", "bathrooms"],
            nopes: ["Bedrooms", "Bathrooms"],
            says: [{ text: "One bathroom is going to be tough." }],
          },
        ],
      },
    ],
    agent: [
      { home: 1001, at: d(6), text: "Good eye. The porch was rebuilt in 2019, and the sellers kept the original fir floors." },
      { home: 1001, at: d(5.6), text: "I'll ask the listing agent about price and get back to you today." },
      { home: 1004, at: d(5.5), text: "About 35 minutes to downtown Tacoma in the morning. Want to see it Saturday?" },
      { home: 1008, at: d(4.4), text: "Fair point. I'll keep an eye out for a three-bedroom nearby." },
      { home: 1004, at: h(4.5), text: "Done. Saturday at 10, and we'll go on to Edmonds after." },
    ],
  },
  {
    slug: "owen",
    clientName: "Owen",
    note: "Just listed in Kirkland. It has the office and the deck you asked for.",
    created: d(1.6),
    homes: [1005],
    people: [
      {
        slug: "owen",
        name: "Owen",
        visits: [
          {
            home: 1005, at: d(1.4), react: "like", liked: ["layout"],
            hearts: [[2, "Floating staircase"], [3, "Deck"], [1, 0.75, 0.45]],
            says: [{ text: "The office and the deck are perfect. Can we see it this week?" }],
          },
        ],
      },
    ],
    agent: [{ home: 1005, at: d(1.3), text: "Yes. I've asked for Thursday at 5." }],
  },
];

// A crowd on top of the people above, so every home looks lived in: more
// buyers and agents, made up from the same few habits, the same on every run.
const CROWD: readonly (readonly [slug: string, name: string, fullName: string])[] = [
  ["olivia", "Olivia", "Olivia Park"], ["liam", "Liam", "Liam Walsh"], ["zoe", "Zoe", "Zoe Bennett"],
  ["noah", "Noah", "Noah Kim"], ["ava", "Ava", "Ava Thompson"], ["ethan", "Ethan", "Ethan Morales"],
  ["mia", "Mia", "Mia Rossi"], ["lucas", "Lucas", "Lucas Nguyen"], ["chloe", "Chloe", "Chloe Adams"],
  ["omar", "Omar", "Omar Haddad"], ["isla", "Isla", "Isla Murphy"], ["ryan", "Ryan", "Ryan Cooper"],
  ["nora", "Nora", "Nora Lindqvist"], ["caleb", "Caleb", "Caleb Brooks"], ["leila", "Leila", "Leila Farahani"],
  ["owen-c", "Owen", "Owen Carter"], ["ruby", "Ruby", "Ruby Jensen"], ["kai", "Kai", "Kai Nakamura"],
  ["harper", "Harper", "Harper Wells"], ["andre", "Andre", "Andre Dubois"], ["sienna", "Sienna", "Sienna Clarke"],
  ["felix", "Felix", "Felix Wagner"], ["amara", "Amara", "Amara Obi"], ["jonah", "Jonah", "Jonah Reyes"],
  ["tessa", "Tessa", "Tessa Hughes"], ["ravi", "Ravi", "Ravi Menon"], ["lena", "Lena", "Lena Novak"],
  ["miles", "Miles", "Miles Turner"], ["yara", "Yara", "Yara Haddad"], ["ben-t", "Ben", "Ben Takahashi"],
  ["eva", "Eva", "Eva Johansson"], ["sam", "Sam", "Sam Okoye"], ["ivy", "Ivy", "Ivy Chen"],
  ["gabe", "Gabe", "Gabe Silva"], ["june", "June", "June Patterson"], ["arjun", "Arjun", "Arjun Rao"],
  ["paige", "Paige", "Paige Doyle"], ["leo", "Leo", "Leo Martin"], ["nadia", "Nadia", "Nadia Petrova"],
  ["cole", "Cole", "Cole Harrison"], ["luna", "Luna", "Luna Vargas"], ["sean", "Sean", "Sean Gallagher"],
  ["maren", "Maren", "Maren Olsen"], ["tariq", "Tariq", "Tariq Aziz"], ["willow", "Willow", "Willow Grant"],
  ["dev", "Dev", "Dev Kapoor"], ["clara", "Clara", "Clara Weiss"], ["max", "Max", "Max Fischer"],
];
// The first dozen of them have signed up with an email.
const CROWD_ACCOUNTS = 12;

const HOMES = Array.from({ length: 13 }, (_, i) => 1001 + i);
// What a crowd buyer might single out as liked (the price is only ever a
// sticking point here).
const LIKEABLE = ASPECTS.map((a) => a.id).filter((a): a is Aspect => a !== "price");

const SPOT_LINES = [
  "Love the {t}.",
  "The {t} is beautiful.",
  "Is the {t} original?",
  "The {t} sold me.",
  "Could see us using the {t} every day.",
  "How old is the {t}?",
  "That {t} though.",
  "The {t} is exactly what we've been looking for.",
];
const GENERAL_LINES = [
  "Would love to see this one in person.",
  "What are the property taxes like?",
  "How's the street noise?",
  "The light in here is lovely.",
  "Great layout for working from home.",
  "Feels bigger than the square footage.",
  "Is there parking for two cars?",
  "This one's on my shortlist.",
  "Love this neighborhood.",
  "Any HOA?",
  "How old is the roof?",
  "Perfect for a family.",
  "So much character.",
  "The kitchen alone is worth a visit.",
  "Anyone know the school district?",
  "Saw it at the open house. Even better in person.",
];
const PASS_LINES = [
  "Not for us, but someone will love it.",
  "Too much work for the price.",
  "Pretty, but the layout doesn't work for us.",
  "A bit far from the city for me.",
];
// Said under someone's likes.
const LIKE_REPLY_LINES = [
  "Same, that was my favorite part too.",
  "Agreed, it's even better in person.",
  "Totally. I keep coming back to this one.",
  "Good eye.",
  "That's what caught my eye too.",
];
const REPLY_LINES = [
  "Agreed.",
  "Same here.",
  "I wondered that too.",
  "It looked even better in person.",
  "Exactly what I thought.",
  "Good question.",
  "Worth asking the listing agent.",
  "Ha, same.",
];

// The facts a crowd buyer might like, and what they'd say about each.
const LIKED_FACTS = [
  "Price",
  "Bedrooms",
  "Bathrooms",
  "Square footage",
  "Price per sq ft",
  "Year built",
  "Days on market",
  "Description",
  "Listing agent",
] as const satisfies readonly FactTag[];
const FACT_LINES: Record<(typeof LIKED_FACTS)[number], string> = {
  Price: "The price feels right for the area.",
  Bedrooms: "Love that there's a spare bedroom for an office.",
  Bathrooms: "Two full baths is a must for us.",
  "Square footage": "So much room for the money.",
  "Price per sq ft": "Great price per square foot for this neighborhood.",
  "Year built": "Hard to believe it's that old. It's been kept up so well.",
  "Days on market": "It's crazy this has only been on the market a few weeks.",
  Description: "This description is exactly what we're looking for.",
  "Listing agent": "Their agent was so helpful at the open house.",
};

const pickOf = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
const someOf = <T,>(list: readonly T[], n: number) => {
  const pool = [...list];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return out;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

// One person's made-up visits to some homes, between `oldest` hours ago and
// half an hour ago: a like or a pass (or neither), a few things tapped in the
// photos, now and then a comment, some liked and answered by `others`.
function madeUpVisits(homes: number[], listings: Map<string, Listing>, others: string[], oldest = d(21)): Visit[] {
  const times = homes.map(() => m(30) + random() * Math.max(oldest - m(30), m(10))).sort((a, b) => b - a);
  return homes.map((home, i) => {
    const listing = listings.get(key(home));
    if (!listing) throw new Error(`${key(home)} isn't in the database; run pnpm db:setup first`);
    const at = times[i];
    const roll = random();
    const react = roll < 0.68 ? ("like" as const) : roll < 0.82 ? ("dislike" as const) : undefined;
    const photos = listing.Media.filter((media) => (media.Spots ?? []).length > 0);
    const used = new Set<string>();
    const spotOn = (): Pin | null => {
      const photo = pickOf(photos);
      if (random() < 0.75) {
        const thing = pickOf(photo.Spots ?? []).tag;
        const id = `${photo.Order}|${thing}`;
        if (used.has(id)) return null;
        used.add(id);
        return [photo.Order, thing] as const;
      }
      return [photo.Order, round2(0.15 + random() * 0.7), round2(0.2 + random() * 0.6)] as const;
    };
    const hearts: On[] = [];
    for (let n = 1 + Math.floor(random() * 3); n > 0; n--) {
      const on = spotOn();
      if (on) hearts.push(on);
    }
    // Now and then one of the facts too: the price, the beds, the baths, the size.
    const fact = random() < 0.3 ? pickOf(LIKED_FACTS) : null;
    if (fact) hearts.push(fact);
    const nopes: On[] = [];
    if (random() < 0.25) {
      const on = spotOn();
      if (on) nopes.push(on);
    }
    if (react === "dislike" && random() < 0.5 && fact !== "Price") nopes.push("Price");
    const liked = react === "like" ? someOf(LIKEABLE, 1 + Math.floor(random() * 2)) : [];
    const disliked: Aspect[] =
      react === "dislike" ? someOf(LIKEABLE, 1) : react === "like" && random() < 0.2 ? ["price"] : [];
    const says: Say[] = [];
    if (random() < 0.42) {
      const named = hearts.find((on): on is readonly [number, string] => typeof on !== "string" && typeof on[1] === "string");
      const onSpot = Boolean(named) && random() < 0.55;
      // (About the fact they liked, sometimes, rather than a spot.)
      const onFact = !onSpot && fact !== null && random() < 0.5;
      const text = onSpot
        ? pickOf(SPOT_LINES).replace("{t}", named![1].toLowerCase())
        : onFact
          ? FACT_LINES[fact!]
          : react === "dislike"
            ? pickOf(PASS_LINES)
            : pickOf(GENERAL_LINES);
      const replies: Reply[] =
        others.length && random() < 0.3
          ? [{ who: pickOf(others), text: pickOf(REPLY_LINES), at: Math.max(m(5), at * (0.2 + 0.5 * random())) }]
          : [];
      says.push({
        text,
        ...(onSpot && named ? { on: named } : onFact && fact ? { on: fact } : {}),
        likedBy: someOf(others, Math.floor(random() * 5)),
        replies,
      });
    }
    return { home, at, react, liked, disliked, hearts, nopes, says };
  });
}

// The crowd joins everyone above, each on a few homes.
function addCrowd(listings: Map<string, Listing>) {
  const everyone = [...PEOPLE.map((p) => p.slug), ...CROWD.map(([slug]) => slug)];
  for (const [slug, name] of CROWD) {
    PEOPLE.push({ slug, name });
    const homes = someOf(HOMES, 2 + Math.floor(random() * 5));
    VISITS[slug] = madeUpVisits(homes, listings, everyone.filter((other) => other !== slug));
  }
}

// Four more agents, each with a few clients of their own.
type DemoAgent = {
  id: string;
  email: string;
  fullName: string;
  brokerage: string;
  brandColor: string;
  phone: string;
  created: number;
  contactPhone?: string;
  contactEmail?: string;
};
const MORE_AGENTS: (Omit<DemoAgent, "id" | "email"> & { slug: string })[] = [
  { slug: "priyanka", fullName: "Priyanka Shah", brokerage: "Sound & Summit Homes", brandColor: "#1F5F5B", phone: "(206) 555-0142", created: d(20) },
  { slug: "daniel", fullName: "Daniel Okafor", brokerage: "Northline Realty", brandColor: "#4B3B78", phone: "(253) 555-0119", created: d(18) },
  { slug: "elise", fullName: "Elise Navarro", brokerage: "Cascade Key Real Estate", brandColor: "#3F4A2F", phone: "(425) 555-0177", created: d(16) },
  { slug: "tom", fullName: "Tom Brennan", brokerage: "Lakeshore Partners", brandColor: "#8A4B14", phone: "(360) 555-0108", created: d(15) },
];
const CLIENTS: readonly (readonly [client: string, people: readonly string[]])[] = [
  ["Lauren & Chris", ["Lauren", "Chris"]],
  ["Sam", ["Sam"]],
  ["Ravi & Meera", ["Ravi", "Meera"]],
  ["Jess", ["Jess"]],
  ["Mateo & Ana", ["Mateo", "Ana"]],
  ["Rachel", ["Rachel"]],
  ["Kevin", ["Kevin"]],
  ["Olivia & Noah", ["Olivia", "Noah"]],
  ["Imani", ["Imani"]],
  ["Tyler & Kim", ["Tyler", "Kim"]],
  ["Hugo", ["Hugo"]],
];
const SHARE_NOTES = [
  "A few I think you'll like. Tap anything in the photos to tell me what works.",
  "Fresh on the market this week. Let me know what stands out.",
  "These fit your list: three bedrooms and a yard.",
  "Just listed, and close to the school you mentioned.",
];
const AGENT_LINES = [
  "Happy to set up a showing this weekend.",
  "The sellers just dropped the price.",
  "Good catch. I'll ask the listing agent about it.",
  "There's an open house Sunday from 1 to 3.",
  "Taxes are about $9,000 a year on this one.",
  "The roof was replaced in 2018.",
];

function moreAgents(listings: Map<string, Listing>) {
  let client = 0;
  return MORE_AGENTS.map((a) => {
    const agent: DemoAgent = {
      ...a,
      id: demoId(`account:agent-${a.slug}`),
      email: `${a.slug}.agent${DEMO_DOMAIN}`,
      contactPhone: a.phone.replace(/\D/g, ""),
      contactEmail: `${a.slug}${DEMO_DOMAIN}`,
    };
    const shares: ShareSeed[] = [];
    for (let n = 2 + Math.floor(random() * 2); n > 0; n--) {
      const [clientName, names] = CLIENTS[client++ % CLIENTS.length];
      const created = h(6) + random() * (a.created - h(12));
      const homes = someOf(HOMES, 1 + Math.floor(random() * 3));
      const slug = `${a.slug}-${clientName.toLowerCase().replace(/[^a-z]+/g, "-")}`;
      const people = names.map((name) => ({
        slug: `${slug}-${name.toLowerCase()}`,
        name,
        visits: madeUpVisits(someOf(homes, 1 + Math.floor(random() * homes.length)), listings, [], created - h(1)),
      }));
      const agentNotes: AgentNote[] = someOf(homes, Math.min(homes.length, 1 + Math.floor(random() * 2))).map((home) => ({
        home,
        text: pickOf(AGENT_LINES),
        at: Math.max(m(10), created * (0.1 + 0.5 * random())),
      }));
      shares.push({ slug, clientName, note: pickOf(SHARE_NOTES), created, homes, people, agent: agentNotes });
    }
    return { agent, shares };
  });
}

// People who only look: each opens a few homes, the busier ones more often.
const LOOKERS = 140;

// What a pin or fact names, checked against the home exactly as the app does
// when someone taps it, with the broad specific a like counts toward.
function resolve(listing: Listing, on: On) {
  if (typeof on === "string") {
    if (!isFactTag(on)) throw new Error(`${listing.ListingKey}: "${on}" isn't one of the facts`);
    return { media_key: FACTS, tag: on as string, aspect: aspectOfFact(on) };
  }
  const [n, a, b] = on;
  const photo = listing.Media.find((media) => media.Order === n);
  if (!photo) throw new Error(`${listing.ListingKey} has no photo ${n}`);
  const tag = typeof a === "string" ? a : pointTag(a, b ?? 0);
  if (!isTagIn(photo, tag)) throw new Error(`${listing.ListingKey} photo ${n} has no "${tag}"`);
  return { media_key: mediaKeyOf(photo), tag, aspect: aspectOfTag(photo, thingOf(photo, tag) ?? tag) };
}

type LikeRow = { listing_key: string; media_key: string; tag: string; aspect: Aspect | null; created_at: Date };
type ReactionRow = { listing_key: string; reaction: "like" | "dislike"; liked: Aspect[]; disliked: Aspect[]; updated_at: Date };
type CommentRow = {
  id: string;
  listing_key: string;
  body: string;
  media_key: string | null;
  spot: string | null;
  created_at: Date;
};

// Turns one person's visits into rows, checking every spot and keeping the
// app's rules: one reaction per home, and never a like and a dislike on the
// same thing.
function rowsFor(who: string, visits: Visit[], listings: Map<string, Listing>) {
  const reactions = new Map<string, ReactionRow>();
  const likes = new Map<string, LikeRow>();
  const dislikes = new Map<string, Omit<LikeRow, "aspect">>();
  const comments: { row: CommentRow; say: Say; at: number }[] = [];
  const views = new Map<string, Date>();

  for (const visit of visits) {
    const listing = listings.get(key(visit.home));
    if (!listing) throw new Error(`${key(visit.home)} isn't in the database; run pnpm db:setup first`);
    const listingKey = listing.ListingKey;
    if (!views.has(listingKey)) views.set(listingKey, ago(visit.at + m(2)));

    let minute = 0;
    const next = () => ago(after(visit.at, minute++));
    for (const [list, into] of [
      [visit.hearts ?? [], "like"],
      [visit.nopes ?? [], "dislike"],
    ] as const) {
      for (const on of list) {
        const spot = resolve(listing, on);
        const id = `${listingKey}|${spot.media_key}|${spot.tag}`;
        if ((into === "like" ? dislikes : likes).has(id)) {
          throw new Error(`${who} both likes and dislikes ${spot.tag} on ${listingKey}`);
        }
        if (into === "like" && !likes.has(id)) likes.set(id, { listing_key: listingKey, ...spot, created_at: next() });
        if (into === "dislike" && !dislikes.has(id)) {
          dislikes.set(id, { listing_key: listingKey, media_key: spot.media_key, tag: spot.tag, created_at: next() });
        }
      }
    }

    if (visit.react) {
      if (reactions.has(listingKey)) throw new Error(`${who} reacts to ${listingKey} twice`);
      const liked = visit.liked ?? [];
      const disliked = visit.disliked ?? [];
      if (liked.some((a) => disliked.includes(a))) throw new Error(`${who} likes and dislikes the same thing on ${listingKey}`);
      reactions.set(listingKey, { listing_key: listingKey, reaction: visit.react, liked, disliked, updated_at: next() });
    }

    for (const [index, say] of (visit.says ?? []).entries()) {
      const spot = say.on ? resolve(listing, say.on) : null;
      const at = after(visit.at, minute++ + 1);
      comments.push({
        row: {
          id: demoId(`comment:${who}:${listingKey}:${visit.at}:${index}`),
          listing_key: listingKey,
          body: say.text,
          media_key: spot?.media_key ?? null,
          spot: spot?.tag ?? null,
          created_at: ago(at),
        },
        say,
        at,
      });
    }
  }
  return { reactions: [...reactions.values()], likes: [...likes.values()], dislikes: [...dislikes.values()], comments, views };
}

// When each person first turned up: just before the first thing they did.
const joined = (slug: string) => {
  const times = (VISITS[slug] ?? []).map((visit) => visit.at);
  for (const visits of Object.values(VISITS)) {
    for (const say of visits.flatMap((visit) => visit.says ?? [])) {
      for (const reply of say.replies ?? []) if (reply.who === slug) times.push(reply.at);
    }
  }
  return Math.max(...times, 0) + m(20);
};

// A like on a comment comes a little after it, once the liker is around.
const likeTime = (commentAt: number, liker: string) =>
  ago(Math.max(Math.min(commentAt, joined(liker)) - (0.3 + random() * 30), m(2)));

async function clearDemo(tx: Tx) {
  // Accounts take their shares (and everything said on them) and the buyer's
  // public activity with them.
  await tx`delete from accounts where email like ${`%${DEMO_DOMAIN}`}`;
  await tx`delete from visitors where device_token like ${`${DEMO_DEVICE}%`}`;
  await tx`delete from listing_views where device_token like ${`${DEMO_DEVICE}%`}`;
  await tx`delete from signups where email like ${`%${DEMO_DOMAIN}`}`;
  await tx`delete from account_intents where email like ${`%${DEMO_DOMAIN}`}`;
}

async function seedPublic(tx: Tx, listings: Map<string, Listing>) {
  const visitorIds = new Map(PEOPLE.map((p) => [p.slug, demoId(`visitor:${p.slug}`)]));
  const visitorOf = (slug: string) => {
    const id = visitorIds.get(slug);
    if (!id) throw new Error(`No one called "${slug}"`);
    return id;
  };

  await tx`
    insert into accounts (id, auth_user_id, email, full_name, role, phone, created_at)
    values (${MAYA.id}, ${`dev:${MAYA.email}`}, ${MAYA.email}, ${MAYA.fullName}, 'buyer', ${MAYA.phone}, ${ago(MAYA.created)})`;
  await tx`
    insert into signups (email, full_name, phone, created_at, updated_at)
    values (${MAYA.email}, ${MAYA.fullName}, ${MAYA.phone}, ${ago(MAYA.created + m(3))}, ${ago(MAYA.created + m(3))})`;

  const counts = { reactions: 0, likes: 0, dislikes: 0, comments: 0, replies: 0, commentLikes: 0 };
  const views = new Map<string, Date>();
  const plans = PEOPLE.map((person) => ({ person, ...rowsFor(person.slug, VISITS[person.slug] ?? [], listings) }));

  // Some of the crowd have signed up too.
  const signedUp = new Map(
    CROWD.slice(0, CROWD_ACCOUNTS).map(([slug, , fullName]) => [slug, { id: demoId(`account:${slug}`), email: `${slug}${DEMO_DOMAIN}`, fullName }]),
  );
  for (const [slug, account] of signedUp) {
    await tx`
      insert into accounts (id, auth_user_id, email, full_name, role, created_at)
      values (${account.id}, ${`dev:${account.email}`}, ${account.email}, ${account.fullName}, 'buyer', ${ago(joined(slug) + m(5))})`;
  }

  for (const { person } of plans) {
    const isMaya = person.slug === "maya";
    const account = isMaya ? { id: MAYA.id } : signedUp.get(person.slug);
    await tx`
      insert into visitors (id, device_token, first_name, account_id, created_at, activity_seen_at)
      values (
        ${visitorOf(person.slug)},
        ${account ? `account:${account.id}` : `${DEMO_DEVICE}${person.slug}`},
        ${person.name},
        ${account?.id ?? null},
        ${ago(isMaya ? MAYA.created : joined(person.slug))},
        ${isMaya ? ago(d(1.2)) : ago(h(2))})`;
  }

  for (const { person, reactions, likes, dislikes, views: seen } of plans) {
    const visitorId = visitorOf(person.slug);
    for (const r of reactions) {
      await tx`
        insert into public_reactions (listing_key, visitor_id, reaction, liked, disliked, updated_at)
        values (${r.listing_key}, ${visitorId}, ${r.reaction}, ${r.liked}::text[], ${r.disliked}::text[], ${r.updated_at})`;
    }
    if (likes.length) {
      await tx`insert into public_photo_likes ${tx(likes.map((l) => ({ ...l, visitor_id: visitorId })))}`;
    }
    if (dislikes.length) {
      await tx`insert into public_photo_dislikes ${tx(dislikes.map((l) => ({ ...l, visitor_id: visitorId })))}`;
    }
    for (const [listingKey, at] of seen) views.set(`${listingKey}|${DEMO_DEVICE}${person.slug}`, at);
    counts.reactions += reactions.length;
    counts.likes += likes.length;
    counts.dislikes += dislikes.length;
  }

  // Comments first, then replies to them, then likes on both.
  const commentLikes: { comment_id: string; visitor_id: string; created_at: Date }[] = [];
  const likeComment = (commentId: string, commentAt: number, author: string, likedBy: string[] = []) => {
    for (const who of likedBy) {
      if (who === author) continue;
      commentLikes.push({ comment_id: commentId, visitor_id: visitorOf(who), created_at: likeTime(commentAt, who) });
    }
  };
  for (const { person, comments } of plans) {
    for (const { row, say, at } of comments) {
      await tx`insert into public_comments ${tx({ ...row, visitor_id: visitorOf(person.slug) })}`;
      counts.comments++;
      likeComment(row.id, at, person.slug, say.likedBy);
      for (const [index, reply] of (say.replies ?? []).entries()) {
        if (reply.at >= at) throw new Error(`A reply to "${say.text}" comes before it`);
        const replyId = demoId(`reply:${row.id}:${index}`);
        await tx`
          insert into public_comments (id, listing_key, visitor_id, body, parent_id, created_at)
          values (${replyId}, ${row.listing_key}, ${visitorOf(reply.who)}, ${reply.text}, ${row.id}, ${ago(reply.at)})`;
        counts.replies++;
        likeComment(replyId, reply.at, reply.who, reply.likedBy);
        // Whoever replied had the home open.
        const view = `${row.listing_key}|${DEMO_DEVICE}${reply.who}`;
        if (!views.has(view)) views.set(view, ago(reply.at + m(3)));
      }
    }
  }
  if (commentLikes.length) await tx`insert into public_comment_likes ${tx(commentLikes)}`;
  counts.commentLikes = commentLikes.length;

  // Now and then someone answers another person's likes, under their line.
  const liked = plans.flatMap(({ person, reactions }) =>
    reactions.filter((r) => r.reaction === "like").map((r) => ({ who: person.slug, ...r })),
  );
  for (const target of someOf(liked, Math.min(30, liked.length))) {
    const replier = pickOf(PEOPLE.filter((p) => p.slug !== target.who)).slug;
    const at = Math.max(m(5), (NOW - target.updated_at.getTime()) / 3_600_000 - 0.5 - random() * 20);
    await tx`
      insert into public_comments (id, listing_key, visitor_id, body, reply_to_visitor, created_at)
      values (${demoId(`like-reply:${target.who}:${target.listing_key}`)}, ${target.listing_key},
        ${visitorOf(replier)}, ${pickOf(LIKE_REPLY_LINES)}, ${visitorOf(target.who)}, ${ago(at)})`;
    counts.replies++;
  }

  return { counts, views, visitorOf };
}

async function seedAgent(
  tx: Tx,
  listings: Map<string, Listing>,
  views: Map<string, Date>,
  agent: DemoAgent = AGENT,
  shares: ShareSeed[] = SHARES,
) {
  await tx`
    insert into accounts (id, auth_user_id, email, full_name, role, brokerage, brand_color, phone, contact_phone, contact_email, created_at)
    values (${agent.id}, ${`dev:${agent.email}`}, ${agent.email}, ${agent.fullName}, 'agent',
      ${agent.brokerage}, ${agent.brandColor}, ${agent.phone}, ${agent.contactPhone ?? ""}, ${agent.contactEmail ?? ""},
      ${ago(agent.created)})`;

  const links: { clientName: string; homes: number; token: string; people: { name: string; token: string }[] }[] = [];
  const tally = { reactions: 0, likes: 0, dislikes: 0, comments: 0, replies: 0 };
  for (const share of shares) {
    const shareId = demoId(`share:${share.slug}`);
    const token = demoToken(`share:${share.slug}`);
    await tx`
      insert into shares (id, token, agent_id, client_name, note, created_at)
      values (${shareId}, ${token}, ${agent.id}, ${share.clientName}, ${share.note}, ${ago(share.created)})`;
    for (const [position, home] of share.homes.entries()) {
      await tx`insert into share_listings (share_id, listing_key, position) values (${shareId}, ${key(home)}, ${position})`;
    }

    const people: { name: string; token: string }[] = [];
    for (const person of share.people) {
      // Everyone on a package has their own link, as when the agent adds them.
      const participantId = demoId(`participant:${share.slug}:${person.slug}`);
      const personToken = demoToken(`person:${share.slug}:${person.slug}`);
      await tx`
        insert into participants (id, share_id, device_token, first_name, token, invited_at, created_at)
        values (${participantId}, ${shareId}, ${`invite:${personToken}`}, ${person.name}, ${personToken},
          ${ago(share.created)}, ${ago(share.created)})`;
      people.push({ name: person.name, token: personToken });

      const rows = rowsFor(person.slug, person.visits, listings);
      for (const visit of person.visits) {
        if (!share.homes.includes(visit.home)) throw new Error(`${person.name}'s link doesn't have ${key(visit.home)}`);
      }
      for (const r of rows.reactions) {
        await tx`
          insert into reactions (share_id, listing_key, participant_id, reaction, liked, disliked, updated_at)
          values (${shareId}, ${r.listing_key}, ${participantId}, ${r.reaction}, ${r.liked}::text[], ${r.disliked}::text[], ${r.updated_at})`;
      }
      const own = { share_id: shareId, participant_id: participantId };
      if (rows.likes.length) await tx`insert into photo_likes ${tx(rows.likes.map((l) => ({ ...l, ...own })))}`;
      if (rows.dislikes.length) await tx`insert into photo_dislikes ${tx(rows.dislikes.map((l) => ({ ...l, ...own })))}`;
      for (const { row, say } of rows.comments) {
        // A comment goes on the public page only when its author likes the home.
        const likesHome = rows.reactions.some((r) => r.listing_key === row.listing_key && r.reaction === "like");
        if (say.shared && !likesHome) throw new Error(`${person.name} can't share a comment on a home they don't like`);
        await tx`insert into comments ${tx({ ...row, ...own, shared_publicly: say.shared === true })}`;
      }
      for (const [listingKey, at] of rows.views) views.set(`${listingKey}|${DEMO_DEVICE}${person.slug}`, at);
      tally.reactions += rows.reactions.length;
      tally.likes += rows.likes.length;
      tally.dislikes += rows.dislikes.length;
      tally.comments += rows.comments.length;
    }

    for (const note of share.agent) {
      await tx`
        insert into comments (share_id, listing_key, agent_id, body, created_at)
        values (${shareId}, ${key(note.home)}, ${agent.id}, ${note.text}, ${ago(note.at)})`;
      tally.replies++;
    }
    links.push({ clientName: share.clientName, homes: share.homes.length, token, people });
  }
  return { links, tally };
}

// Lookers open homes over the past two weeks, the busier ones more often.
function lookerViews(views: Map<string, Date>, listings: Map<string, Listing>) {
  const weight = new Map<string, number>();
  for (const k of listings.keys()) weight.set(k, 1);
  for (const visits of Object.values(VISITS)) {
    for (const visit of visits) weight.set(key(visit.home), (weight.get(key(visit.home)) ?? 1) + 1);
  }
  const total = [...weight.values()].reduce((a, b) => a + b, 0);
  const pick = () => {
    let r = random() * total;
    for (const [k, w] of weight) if ((r -= w) <= 0) return k;
    return [...weight.keys()][0];
  };
  for (let n = 1; n <= LOOKERS; n++) {
    const opens = 2 + Math.floor(random() * 6);
    for (let i = 0; i < opens; i++) {
      const id = `${pick()}|${DEMO_DEVICE}looker-${n}`;
      if (!views.has(id)) views.set(id, ago(m(10) + random() * d(14)));
    }
  }
}

async function main() {
  if (CLEAR_ONLY) {
    await sql.begin((tx) => clearDemo(tx));
    console.log("Cleared the demo rows (demo emails and \"demo:\" devices); nothing else was touched.");
    await sql.end();
    return;
  }
  const rows = await sql<{ data: Listing }[]>`select data from listings`;
  if (rows.length === 0) {
    console.error("There are no listings yet. Run pnpm db:setup first, then pnpm db:demo.");
    process.exit(1);
  }
  const listings = new Map(rows.map((row) => [row.data.ListingKey, row.data]));

  addCrowd(listings);
  const others = moreAgents(listings);
  const result = await sql.begin(async (tx) => {
    await clearDemo(tx);
    const { counts, views } = await seedPublic(tx, listings);
    const { links, tally } = await seedAgent(tx, listings, views);
    for (const { agent, shares } of others) {
      const more = await seedAgent(tx, listings, views, agent, shares);
      for (const k of Object.keys(tally) as (keyof typeof tally)[]) tally[k] += more.tally[k];
    }
    lookerViews(views, listings);
    const viewRows = [...views].map(([id, first_seen]) => {
      const [listing_key, device_token] = id.split("|");
      return { listing_key, device_token, first_seen };
    });
    await tx`insert into listing_views ${tx(viewRows)}`;
    return { counts, links, tally, views: viewRows.length };
  });

  const base = (local ? /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/ : /^https:\/\/[^/]+\/?$/).test(process.env.APP_URL ?? "")
    ? process.env.APP_URL!.replace(/\/$/, "")
    : "http://localhost:3000";
  const { counts, links, tally, views } = result;
  console.log(
    `Seeded ${PEOPLE.length} people: ${counts.reactions} reactions, ${counts.likes} likes and ${counts.dislikes} ` +
      `dislikes on spots and facts, ${counts.comments} comments and ${counts.replies} replies, ` +
      `${counts.commentLikes} comment likes, ${views} views.`,
  );
  console.log(
    `On ${links.length} of ${AGENT.fullName}'s links and ${others.reduce((n, o) => n + o.shares.length, 0)} more from ${others.length} other agents: ${tally.reactions} reactions, ${tally.likes} likes and ` +
      `${tally.dislikes} dislikes, ${tally.comments} comments and ${tally.replies} replies from the agent.`,
  );
  if (local) {
    console.log(`\nSign in at ${base}/login (no password) as:`);
    console.log(`  ${MAYA.email}   ${MAYA.fullName}, a buyer with a full profile: ${base}/people/me`);
    console.log(`  (her profile, signed out: ${base}/people/${demoId("visitor:maya")})`);
    console.log(`  ${AGENT.email}  ${AGENT.fullName}, ${AGENT.brokerage}: ${base}/dashboard`);
    for (const { agent, shares } of others) {
      console.log(`  ${agent.email}  ${agent.fullName}, ${agent.brokerage} (${shares.length} links)`);
    }
    console.log(`  …and ${CROWD_ACCOUNTS} signed-up buyers, such as ${CROWD[0][0]}${DEMO_DOMAIN}`);
  } else {
    // (No password-free sign-in there: the demo people are only to look at.)
    console.log(`\n${MAYA.fullName}'s profile: ${base}/people/${demoId("visitor:maya")}`);
  }
  console.log("\nShare links:");
  for (const link of links) {
    console.log(`  ${link.clientName}, ${link.homes === 1 ? "one home" : `${link.homes} homes`}: ${base}/s/${link.token}`);
    for (const person of link.people) console.log(`    ${person.name}'s own link: ${base}/s/${person.token}`);
  }
  await sql.end();
}

main().catch(async (error) => {
  console.error(error);
  await sql.end({ timeout: 1 });
  process.exit(1);
});
