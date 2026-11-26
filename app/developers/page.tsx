import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { appUrl, cn } from "@/lib/format";
import { WITHDRAWN_INSTEAD } from "@/lib/own-listing-writes";
import { card, link, pageColumn, pageLabel, pageTitle } from "@/lib/ui";
import { C, Code, curl, Endpoint, Fields, Group, Json, Section } from "./parts";

export const metadata = {
  title: "Porchcard API · Porchcard",
  description:
    "Let your CRM, Zapier or Make send homes to your clients, add your own listings, and hear when a client opens a link or likes a home.",
};

// The API's page: what an agent's own tools can do through /api/v1, written
// for the agent and for whoever sets up their CRM. Everything on it is what
// the routes under app/api/v1 really take and give back (the examples are
// made with the same names, and the JSON is written out by JSON.stringify,
// so it's always JSON). Public: someone setting up a CRM may not have an
// account here at all.

// The examples' made-up people, homes and ids, written once so each one
// matches wherever it comes back.
const LINK_ID = "9c4a1e7b-2d5f-4b83-8e16-7a0c3d9f5b42";
const NEW_LINK_ID = "3e9a5c1f-8b2d-4f60-a7e4-6c0b9d3f1a58";
const NINA = "2b7e9d14-8c3f-4f0a-a6d5-1e9b3c7f4a20";
const BEN = "5d0f8a2c-6e19-4c7b-b3a4-8f2e1d9c0b57";
const NEW_NINA = "8a6c4e2f-0d1b-4c93-b5e7-9f3a1d7c5b08";
const NINA_TOKEN = "kQ7mZr2xT9vLp4NcW8sHy1bJd3FgA6eU";
const BEN_TOKEN = "Xb3nR8wQ2mTz6YpL0cVhK5sJd9GfA1eD";
const NEW_TOKEN = "Hm4tW9qZ1cXr7VbN2kLp8sJy3dGf6AeU";
const PROFILE = "6f1d2c0a-3b8e-4a51-9c27-0d4e5f6a7b81";
const HOME = "RP-2291834";
const OTHER_HOME = "RP-2290457";
const OWN = "OWN-0b8e4f2a-7c1d-4e95-a3b6-5f9d2e8c1a74";
const PHOTO = "e3a7c5d1-9b2f-4086-8d4e-1c6a0f7b3e92";
const WEBHOOK = "c8d2e6f0-1a4b-4c79-9e35-7b0d2f8a6c13";
const COMMENT = "a1f5b9d3-4c7e-4a28-b6f0-2e8d4c1a9b65";
const REPLY = "7e2c6a0f-5b9d-4e13-9f47-1a3c8e6b2d04";
const EVENT = "f4b8d2a6-0c3e-4f71-8a95-3d7b1e5c9f20";

// What's on the page, in order: the links at its top.
const CONTENTS: [string, string][] = [
  ["what", "What you can do"],
  ["key", "Get a key"],
  ["auth", "Sign each request"],
  ["base", "Where to send requests"],
  ["limits", "Limits"],
  ["errors", "Errors"],
  ["idempotency", "Sending a request twice"],
  ["endpoints", "Endpoints"],
  ["webhooks", "Webhooks"],
  ["privacy", "Your clients’ privacy"],
  ["tools", "GoHighLevel, Zapier and Make"],
];

export default function DevelopersPage() {
  const site = appUrl();
  const base = `${site}/api/v1`;

  // The answers' pieces, as the API writes them (lib/api/serialize.ts).
  const home = {
    key: HOME,
    mls_number: "2291834",
    status: "active",
    address: "4127 Larkmoor Ave",
    city: "Tacoma",
    state: "WA",
    zip: "98407",
    price: 615000,
    beds: 3,
    baths: 2,
    sqft: 1840,
    year_built: 1962,
    type: "Single Family Residence",
    description: "A 1962 rambler on a quiet street, with a wraparound porch and a big back yard.",
    photos: ["https://photos.example.com/2291834/1.jpg", "https://photos.example.com/2291834/2.jpg"],
    url: `${site}/homes/${HOME}`,
    listed_by: { agent: "Sam Okafor", office: "Northlight Realty" },
  };
  const sentLink = {
    id: LINK_ID,
    title: "Nina & Ben",
    created_at: "2026-11-16T17:05:00.000Z",
    opened_at: "2026-11-16T18:12:44.000Z",
    homes: 3,
    liked: 2,
    comments: 2,
    waiting: true,
    people: ["Nina", "Ben"],
    url: null,
    dashboard_url: `${site}/dashboard/shares/${LINK_ID}`,
  };
  const client = {
    id: "name:nina",
    name: "Nina",
    profile_url: null,
    status: { kind: "ask", text: "Wants to see 4127 Larkmoor Ave" },
    homes_sent: 3,
    liked: 2,
    passed: 1,
    comments: 2,
    waiting: true,
    opened: true,
    last_active_at: "2026-11-18T19:42:10.000Z",
    sent_at: "2026-11-16T17:05:00.000Z",
    link_url: `${site}/s/${NINA_TOKEN}`,
    link_ids: [LINK_ID],
  };
  const own = {
    key: OWN,
    mls_number: null,
    status: "active",
    address: "2210 S Yakima Ave",
    city: "Tacoma",
    state: "WA",
    zip: "98405",
    price: 389000,
    beds: 3,
    baths: 1,
    sqft: 1320,
    year_built: 1924,
    type: null,
    description: "Needs a new roof and kitchen. Solid foundation, big lot.",
    photos: [`${site}/listing-photo/${PHOTO}`],
    url: `${site}/homes/${OWN}`,
    listed_by: { agent: "Jordan Rivera", office: "Harbor & Pine Realty" },
    own: true,
    shown: true,
    closed: false,
    arv: 520000,
    rehab: 85000,
    show_price_per_sqft: true,
    videos: [],
    updated_at: "2026-11-19T16:20:31.000Z",
    edit_url: `${site}/dashboard/listings/${OWN}`,
  };
  const webhook = {
    id: WEBHOOK,
    url: "https://hooks.example.com/porchcard",
    events: ["link.opened", "home.liked", "home.passed", "comment.created", "showing.requested"],
    created_at: "2026-11-19T16:40:02.000Z",
    active: true,
    disabled_at: null,
    failures: 0,
    last_delivery: { event: "ping", status: 200, ok: true, error: null, at: "2026-11-19T16:41:15.000Z" },
  };

  return (
    <main className={pageColumn()}>
      <p className={pageLabel}>For developers</p>
      <h1 className={cn(pageTitle, "mt-2")}>Porchcard API</h1>
      <p className="mt-4 text-pretty text-lg leading-relaxed text-stone-700">
        Let your CRM, Zapier or Make work in Porchcard as you: send a client a few homes and get their link back, add
        listings of your own, and hear the moment a client opens a link or likes a home.
      </p>
      <p className="mt-3 text-body leading-relaxed text-stone-700">
        This page is for you and for whoever sets up your tools. Hand them the link.
      </p>

      <nav aria-labelledby="contents-title" className={cn(card, "mt-8 p-4 sm:p-5")}>
        <h2 id="contents-title" className="font-semibold">
          On this page
        </h2>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 sm:gap-x-6">
          {CONTENTS.map(([id, title]) => (
            <li key={id}>
              <a href={`#${id}`} className={cn(link, "flex min-h-11 items-center py-1 leading-snug")}>
                {title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="what" title="What you can do">
        <p>Everything your key does, it does as you, and only with your own clients, links and listings.</p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>See your clients, who’s waiting on you, and what each one liked and passed on.</li>
          <li>Find homes by address, city, ZIP or MLS number.</li>
          <li>Send a client homes and get their link back, for your CRM to text them.</li>
          <li>Add homes to a link you sent, and reply to a client on a home.</li>
          <li>Add, change, close and delete your own listings (deals with ARV and rehab too), with photos.</li>
          <li>Be told the moment a client opens a link, likes or passes on a home, comments, or asks to see one.</li>
        </ul>
      </Section>

      <Section id="key" title="Get a key">
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>Sign in to Porchcard with your agent account.</li>
          <li>
            Go to{" "}
            <Link href="/people/me/edit#api" className={link}>
              Edit profile
            </Link>
            , then <strong className="font-semibold">Connect your tools</strong>.
          </li>
          <li>Name the key after the tool it’s for (“GoHighLevel”), and tap Make a key.</li>
          <li>Copy it now and paste it into your tool. You won’t see it again.</li>
        </ol>
        <p>
          A key starts <C>pc_live_</C>. Treat it like a password: anyone with it can send homes as you. Keep it in your
          tool’s settings, never in a web page or an app other people download. You can have up to 10 keys, one for each
          tool, and revoke any of them on the same page. A revoked key stops working at once.
        </p>
        <p>Only agent accounts can make keys. If your account stops being an agent’s, its keys stop working.</p>
      </Section>

      <Section id="auth" title="Sign each request">
        <p>
          Send your key in the <C>Authorization</C> header of every request, after the word <C>Bearer</C>. Nothing
          else signs you in here: being signed in to the site in a browser doesn’t count.
        </p>
        <Code label="Check your key">{`export PORCHCARD_KEY=pc_live_…   # your key\n\n${curl(base, "GET", "/me")}`}</Code>
        <p>
          A missing, mistyped or revoked key gets a <C>401</C> answer. The examples on this page all read the key from{" "}
          <C>$PORCHCARD_KEY</C>, as above.
        </p>
      </Section>

      <Section id="base" title="Where to send requests">
        <Code>{base}</Code>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            Requests with a body send it as JSON, with <C>Content-Type: application/json</C>. Answers are always JSON.
          </li>
          <li>
            Times are in UTC, like <C>2026-11-19T16:20:31.000Z</C>. Addresses (<C>url</C>, <C>photos</C>) are always
            full, starting <C>https://</C>.
          </li>
          <li>
            A home or listing is named by its <C>key</C>. An id in a path is URL-encoded when it has a space or a
            symbol other than a dash or a colon in it: <C>/clients/name:mary%20ann</C>.
          </li>
        </ul>
      </Section>

      <Section id="limits" title="Limits">
        <p>
          Each key can make <strong className="font-semibold">120 requests a minute</strong>. Every answer says how
          many are left this minute:
        </p>
        <Code>{`X-RateLimit-Limit: 120\nX-RateLimit-Remaining: 117`}</Code>
        <p>
          Over the limit, the answer is <C>429</C> with a <C>Retry-After</C> header: the seconds to wait before trying
          again.
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            A request’s body can be up to 64 KB, or about 3 MB for{" "}
            <a href="#post-listing-photos" className={link}>
              a photo sent as data
            </a>
            .
          </li>
          <li>A link can have as many homes as you like (up to 100 in one request) and up to 6 people, and a note of up to 500 characters.</li>
          <li>A reply can be up to 1,000 characters. A listing’s description, up to 2,000.</li>
          <li>You can keep up to 50 listings of your own, each with up to 15 photos.</li>
          <li>Up to 10 keys and 5 webhooks.</li>
          <li>
            Adding a lot of people you haven’t met on Porchcard to links in one day is held back until the next day.
            Typing a first name always works.
          </li>
        </ul>
      </Section>

      <Section id="errors" title="Errors">
        <p>
          Anything that goes wrong comes back with a status of 400 or more and the same shape: a <C>code</C> to act
          on, a <C>message</C> in plain words you can show someone, and, when it’s about one thing you sent, the{" "}
          <C>field</C>.
        </p>
        <Json
          label="Example"
          value={{ error: { code: "invalid_request", message: "Enter a 5-digit ZIP code.", field: "zip" } }}
        />
        <dl className="flex flex-col divide-y divide-stone-200 rounded-xl bg-white ring-1 ring-stone-200">
          {(
            [
              ["400", "invalid_request", "Something sent isn’t right. field says which, when it’s one thing."],
              ["401", "unauthorized", "No key, a key we don’t know, a revoked key, or an account that isn’t an agent’s."],
              ["404", "not_found", "It isn’t there, or it isn’t yours. Both get the same answer."],
              [
                "409",
                "conflict",
                "A home is no longer for sale (field homes), or an Idempotency-Key was used for a different request.",
              ],
              ["413", "payload_too_large", "The body is bigger than that endpoint takes."],
              ["415", "unsupported_media_type", "A body was sent without Content-Type: application/json."],
              ["422", "limit_reached", "One of the limits above: too many listings, photos, webhooks or new people."],
              ["429", "rate_limited", "Over 120 requests this minute. Wait for Retry-After seconds."],
              ["500", "server_error", "Our mistake. The message has an id to quote if it keeps happening."],
            ] as const
          ).map(([status, code, words]) => (
            <div key={code} className="px-3 py-2.5">
              <dt className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[13px] font-semibold tabular-nums">{status}</span>
                <code className="font-mono text-[13px] font-semibold text-ink">{code}</code>
              </dt>
              <dd className="mt-0.5 text-body text-stone-700">{words}</dd>
            </div>
          ))}
        </dl>
        <p>
          Every answer has an <C>X-Request-Id</C> header too. Quote it if you write to us about a request.
        </p>
      </Section>

      <Section id="idempotency" title="Sending a request twice">
        <p>
          Tools retry. If a connection drops after you send homes, your tool can’t tell whether the link was made. So
          each request that makes something (every <C>POST</C> below but the webhook test) takes an{" "}
          <C>Idempotency-Key</C> header: any text you choose, up to 100 characters, no spaces, new for each new thing.
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            The same key with the same request, within 24 hours, gives back the first answer, without doing it again.
            That answer carries <C>Idempotent-Replayed: true</C>.
          </li>
          <li>
            The same key with a different request is a <C>409 conflict</C>. So is a retry while the first is still
            being worked on: wait a moment and try again.
          </li>
          <li>If the first try ended in a 500, a retry with the same key goes through as new.</li>
        </ul>
        <p>
          A good key is something your tool already has, like the CRM contact’s id and the day:{" "}
          <C>contact-4821-2026-11-19</C>. Keys belong to your API key, so another tool can’t collide with yours.
        </p>
      </Section>

      <Section id="endpoints" title="Endpoints">
        <p>
          Paths are under <C>{base}</C>. Each one only ever sees your own clients, links and listings.
        </p>

        <Group id="account" title="Your account">
          <Endpoint id="get-me" method="GET" path="/me">
            <p>
              Whose key this is, and which of their keys. A good first request, to check your tool is set up with the
              right one. <C>profile_url</C> is null until you have a public profile (made the first time you send
              homes).
            </p>
            <Code label="Request">{curl(base, "GET", "/me")}</Code>
            <Json
              value={{
                agent: {
                  name: "Jordan Rivera",
                  brokerage: "Harbor & Pine Realty",
                  profile_url: `${site}/people/${PROFILE}`,
                  mls_agent_id: "112233",
                },
                key: { name: "GoHighLevel", prefix: "pc_live_8Kq2" },
              }}
            />
          </Endpoint>
        </Group>

        <Group id="clients" title="Clients">
          <Endpoint id="get-clients" method="GET" path="/clients">
            <p>
              Everyone you’ve sent homes to, as your Clients page lists them: whoever is waiting on you first. Add{" "}
              <C>?waiting=true</C> for only those waiting: someone who asked to see a home, or said something you
              haven’t answered.
            </p>
            <p>
              A client’s <C>id</C> stays the same: <C>acct:…</C> for someone signed up on Porchcard,{" "}
              <C>name:nina</C> for a first name you typed, <C>p:…</C> for someone who joined a link without a name.{" "}
              <C>status.kind</C> is one of <C>ask</C>, <C>comment</C>, <C>active</C> (looking now), <C>liked</C>,{" "}
              <C>opened</C> or <C>unopened</C>, and <C>status.text</C> says it in words. <C>link_url</C> is their own
              link, newest, to send again (<C>link_ids</C> lists all their links).
            </p>
            <Code label="Request">{curl(base, "GET", "/clients?waiting=true")}</Code>
            <Json value={{ clients: [client] }} />
          </Endpoint>

          <Endpoint id="get-client" method="GET" path="/clients/{id}">
            <p>
              One client: the links they’re on (newest first) and their feedback rolled up. <C>likes</C> and{" "}
              <C>dislikes</C> are what they loved and didn’t, with how many homes each came up in; <C>mixed</C> is
              what they liked in one home and not in another. <C>homes</C> lists each home they were sent, the ones they
              did something with first, each with <C>reaction</C>: <C>liked</C>, <C>passed</C> or null.
            </p>
            <Code label="Request">{curl(base, "GET", "/clients/name:nina")}</Code>
            <Json
              value={{
                client,
                links: [sentLink],
                feedback: {
                  liked: 2,
                  passed: 1,
                  sent: 3,
                  likes: [
                    { thing: "Porch", homes: 2 },
                    { thing: "Kitchen", homes: 1 },
                  ],
                  dislikes: [{ thing: "Busy street", homes: 1 }],
                  mixed: ["Layout"],
                  homes: [
                    {
                      key: HOME,
                      address: "4127 Larkmoor Ave",
                      city: "Tacoma",
                      reaction: "liked",
                      likes: ["Porch", "Kitchen"],
                      dislikes: [],
                      comments: 2,
                      url: `${site}/homes/${HOME}`,
                    },
                  ],
                },
              }}
            />
          </Endpoint>
        </Group>

        <Group id="homes" title="Homes">
          <Endpoint id="get-homes" method="GET" path="/homes">
            <p>
              Homes for sale, to send. With only <C>q</C> (an address, a city, a ZIP or an MLS number) it finds what
              Send homes on the site finds: your own listings among them, and homes not on Porchcard yet, which come
              in when you send one. Add a filter or a sort and it searches the MLS homes here instead, in that order.
            </p>
            <Fields
              title="Query"
              fields={[
                { name: "q", children: "An address, city, ZIP or MLS number. Up to 100 characters." },
                {
                  name: "min_price, max_price",
                  children: (
                    <>
                      Whole dollars. <C>510000</C> and <C>$510,000</C> both work.
                    </>
                  ),
                },
                { name: "beds, baths", children: "At least this many, 1 to 10." },
                {
                  name: "type",
                  children: (
                    <>
                      <C>house</C> or <C>townhouse</C>.
                    </>
                  ),
                },
                {
                  name: "sort",
                  children: (
                    <>
                      <C>reactions</C> (the most, first; the usual), <C>liked</C>, <C>talked</C>, <C>viewed</C>,{" "}
                      <C>newest</C>, <C>price-asc</C> or <C>price-desc</C>.
                    </>
                  ),
                },
                { name: "limit", children: "How many, 1 to 50. 20 if left out." },
              ]}
            />
            <Code label="Request">{curl(base, "GET", "/homes?q=4127%20Larkmoor")}</Code>
            <Json value={{ homes: [home] }} />
            <p>
              A home found by <C>q</C> that isn’t on Porchcard yet can be sent with <C>POST /links</C>, but{" "}
              <C>GET /homes/{"{key}"}</C> won’t find it until it has been.
            </p>
          </Endpoint>

          <Endpoint id="get-home" method="GET" path="/homes/{key}">
            <p>
              One home by its key: any MLS home here that’s for sale or sold, and any of your own listings. The answer
              is <C>{"{ \"home\": { … } }"}</C>, in the same shape as above. <C>status</C> is <C>active</C>,{" "}
              <C>pending</C>, <C>closed</C>, or the MLS’s own word in lower case.
            </p>
            <Code label="Request">{curl(base, "GET", `/homes/${HOME}`)}</Code>
          </Endpoint>
        </Group>

        <Group id="links" title="Links">
          <Endpoint id="get-links" method="GET" path="/links">
            <p>
              Every link you’ve sent, newest first, a page at a time, with <C>total</C> for how many there are in all.
              A link’s <C>url</C> is the one to send when one person (or nobody yet) is on it. With several, each has
              their own: see <C>GET /links/{"{id}"}</C>.
            </p>
            <Fields
              title="Query"
              fields={[
                { name: "limit", children: "How many, 1 to 100. 50 if left out." },
                { name: "offset", children: "How many to skip, for the next page. 0 if left out." },
              ]}
            />
            <Code label="Request">{curl(base, "GET", "/links?limit=20")}</Code>
            <Json value={{ links: [sentLink], total: 1 }} />
          </Endpoint>

          <Endpoint id="get-link" method="GET" path="/links/{id}">
            <p>
              One link: its homes (any you took off it marked <C>removed</C>) and everyone on it, each with their own{" "}
              <C>url</C>, whether they’ve opened it, the keys of the homes they liked and passed on, and how many
              comments they’ve made. A person’s <C>id</C> is what <C>to</C> takes on a reply; <C>client_id</C> is
              their id in <C>GET /clients</C>. Someone who joined through the link itself has no link of their own:
              their <C>url</C> is null.
            </p>
            <Code label="Request">{curl(base, "GET", `/links/${LINK_ID}`)}</Code>
            <Json
              value={{
                link: sentLink,
                homes: [{ ...home, removed: false }],
                people: [
                  {
                    id: NINA,
                    client_id: "name:nina",
                    name: "Nina",
                    url: `${site}/s/${NINA_TOKEN}`,
                    opened: true,
                    liked: [HOME],
                    passed: [OTHER_HOME],
                    comments: 2,
                  },
                  {
                    id: BEN,
                    client_id: "name:ben",
                    name: "Ben",
                    url: `${site}/s/${BEN_TOKEN}`,
                    opened: false,
                    liked: [],
                    passed: [],
                    comments: 0,
                  },
                ],
              }}
            />
          </Endpoint>

          <Endpoint id="post-links" method="POST" path="/links">
            <p>
              Sends homes: a new link, the same as Send homes on the site. Each person on it gets their own link, which
              comes back here for your tool to text or email them. Porchcard doesn’t text anyone. It emails only people
              who are already on Porchcard, as it does when you send from the site.
            </p>
            <Fields
              fields={[
                {
                  name: "homes",
                  required: true,
                  children: (
                    <>
                      One or more home keys (up to 100), from <C>GET /homes</C> or <C>GET /listings</C>. Each must be for sale.
                    </>
                  ),
                },
                {
                  name: "people",
                  children: (
                    <>
                      Up to 6 people, each <C>{"{ \"first_name\": \"Nina\" }"}</C> or, for someone on Porchcard,{" "}
                      <C>{"{ \"profile_id\": \"…\" }"}</C> (the id at the end of their <C>profile_url</C>). Never an
                      email or a phone number. Leave it out for a link anyone can open.
                    </>
                  ),
                },
                { name: "note", children: "A few words from you at the top of the link. Up to 500 characters." },
              ]}
            />
            <Code label="Request">
              {curl(base, "POST", "/links", {
                body: { homes: [HOME, OTHER_HOME], people: [{ first_name: "Nina" }], note: "Two with the porch you wanted." },
                idempotent: "contact-4821-2026-11-19",
              })}
            </Code>
            <Json
              label="Answer (201)"
              value={{
                link: {
                  ...sentLink,
                  id: NEW_LINK_ID,
                  title: "Nina",
                  created_at: "2026-11-19T17:02:11.000Z",
                  opened_at: null,
                  homes: 2,
                  liked: 0,
                  comments: 0,
                  waiting: false,
                  people: ["Nina"],
                  url: `${site}/s/${NEW_TOKEN}`,
                  dashboard_url: `${site}/dashboard/shares/${NEW_LINK_ID}`,
                },
                url: `${site}/s/${NEW_TOKEN}`,
                people: [{ id: NEW_NINA, name: "Nina", url: `${site}/s/${NEW_TOKEN}` }],
              }}
            />
            <p>
              <C>url</C> is the first person’s link, or the link anyone can open when nobody is named. A home no
              longer for sale is a <C>409</C>; too many new people in a day, a <C>422</C>.
            </p>
          </Endpoint>

          <Endpoint id="post-link-homes" method="POST" path="/links/{id}/homes">
            <p>
              Adds homes to a link you sent, after the ones on it, the same as Add homes on the site. A home you took off
              comes back. People on it who are on Porchcard get an email from us about it, at most once a day; nobody
              else is told. <C>added</C> counts the homes that weren’t on it already.
            </p>
            <Fields fields={[{ name: "homes", required: true, children: "One or more home keys (up to 100), each for sale." }]} />
            <Code label="Request">
              {curl(base, "POST", `/links/${LINK_ID}/homes`, {
                body: { homes: [OTHER_HOME] },
                idempotent: "add-2290457-to-nina",
              })}
            </Code>
            <Json value={{ link: { ...sentLink, homes: 4 }, added: 1 }} />
          </Endpoint>

          <Endpoint id="post-link-replies" method="POST" path="/links/{id}/replies">
            <p>
              Your reply in a home’s conversation on the link, the same as Reply on the site. Your client sees it next
              time they open the link. Porchcard doesn’t text or email anyone about it.
            </p>
            <Fields
              fields={[
                { name: "home", required: true, children: "The key of a home on this link." },
                { name: "body", required: true, children: "What you say, up to 1,000 characters." },
                {
                  name: "to",
                  children: (
                    <>
                      The <C>id</C> of the person you’re answering, from <C>GET /links/{"{id}"}</C>. On a link with
                      several people, it puts your reply under theirs.
                    </>
                  ),
                },
              ]}
            />
            <Code label="Request">
              {curl(base, "POST", `/links/${LINK_ID}/replies`, {
                body: { home: HOME, body: "Saturday at 10 works. I will set it up.", to: NINA },
                idempotent: "reply-nina-larkmoor-1",
              })}
            </Code>
            <Json
              label="Answer (201)"
              value={{
                reply: { id: REPLY, body: "Saturday at 10 works. I will set it up.", created_at: "2026-11-19T17:10:05.000Z" },
              }}
            />
            <p>
              A home that has never been on the link is a <C>404</C> about <C>home</C>; a <C>to</C> who isn’t on it, a{" "}
              <C>400</C>.
            </p>
          </Endpoint>
        </Group>

        <Group id="listings" title="Your listings">
          <p>
            Homes you add yourself: a pocket listing, a deal with its after repair value and rehab. They show on your
            profile once they have a photo (unless you hide them), and you can send them like any other home. Their
            keys start <C>OWN-</C>.
          </p>

          <Endpoint id="get-listings" method="GET" path="/listings">
            <p>
              All your listings, as your Listings page has them: the ones you added (<C>source: &quot;own&quot;</C>),
              then homes you put on your profile (<C>&quot;pinned&quot;</C>), then MLS homes under your MLS ID and name
              (<C>&quot;mls&quot;</C>). Pinned and MLS homes are in the same shape as <C>GET /homes</C>. Your own have
              more: <C>shown</C> (on your profile), <C>closed</C>, <C>arv</C>, <C>rehab</C>,{" "}
              <C>show_price_per_sqft</C>, <C>updated_at</C> and <C>edit_url</C>.
            </p>
            <Code label="Request">{curl(base, "GET", "/listings")}</Code>
            <Json value={{ listings: [{ ...own, source: "own" }] }} />
          </Endpoint>

          <Endpoint id="post-listings" method="POST" path="/listings">
            <p>
              Adds a listing of your own, checked as the Add a listing form checks it. Numbers can be numbers or text
              (<C>&quot;$389,000&quot;</C> works). A field this doesn’t know (a misspelling, like <C>bedrooms</C>) is a{" "}
              <C>400</C> naming it, rather than quietly left out.
            </p>
            <Fields
              fields={[
                { name: "address", required: true, children: "The street address." },
                { name: "city", required: true, children: "The city." },
                {
                  name: "state",
                  required: true,
                  children: (
                    <>
                      Two letters, like <C>WA</C>.
                    </>
                  ),
                },
                { name: "zip", required: true, children: "5 digits." },
                { name: "price", required: true, children: "The asking price." },
                { name: "beds, baths", required: true, children: "0 to 50." },
                { name: "sqft", required: true, children: "Square feet." },
                { name: "description", children: "Up to 2,000 characters." },
                { name: "year_built", children: "Like 1924." },
                { name: "arv", children: "After repair value." },
                { name: "rehab", children: "Estimated rehab cost." },
                {
                  name: "shown",
                  children: (
                    <>
                      <C>true</C> to show it on your profile (once it has a photo), <C>false</C> to keep it off.{" "}
                      <C>true</C> if left out.
                    </>
                  ),
                },
                {
                  name: "show_price_per_sqft",
                  children: (
                    <>
                      Whether it shows the price per square foot. <C>true</C> if left out.
                    </>
                  ),
                },
                {
                  name: "status",
                  children: (
                    <>
                      <C>active</C> (the usual) or <C>closed</C>, for a deal that’s done.
                    </>
                  ),
                },
              ]}
            />
            <Code label="Request">
              {curl(base, "POST", "/listings", {
                body: {
                  address: "2210 S Yakima Ave",
                  city: "Tacoma",
                  state: "WA",
                  zip: "98405",
                  price: "$389,000",
                  beds: 3,
                  baths: 1,
                  sqft: 1320,
                  year_built: 1924,
                  arv: 520000,
                  rehab: 85000,
                  description: "Needs a new roof and kitchen. Solid foundation, big lot.",
                },
                idempotent: "deal-yakima-2210",
              })}
            </Code>
            <Json label="Answer (201)" value={{ listing: { ...own, photos: [] } }} />
            <p>
              Over 50 listings is a <C>422</C>. Add its photos next, with <C>POST /listings/{"{key}"}/photos</C>.
            </p>
          </Endpoint>

          <Endpoint id="get-listing" method="GET" path="/listings/{key}">
            <p>
              One of your own listings: <C>{"{ \"listing\": { … } }"}</C>, as above. Any other home is a{" "}
              <C>404</C> here; read it with <C>GET /homes/{"{key}"}</C>.
            </p>
            <Code label="Request">{curl(base, "GET", `/listings/${OWN}`)}</Code>
          </Endpoint>

          <Endpoint id="patch-listing" method="PATCH" path="/listings/{key}">
            <p>
              Changes one of your own listings: send only what changes, with the same fields as adding one. The
              required ones can’t be emptied; <C>description</C>, <C>year_built</C>, <C>arv</C> and <C>rehab</C> are
              cleared with <C>null</C>. Mark a deal done with <C>{"\"status\": \"closed\""}</C>, or take it off your
              profile with <C>{"\"shown\": false"}</C>. The answer is the listing as it is now.
            </p>
            <Code label="Request">
              {curl(base, "PATCH", `/listings/${OWN}`, { body: { price: 375000, rehab: null } })}
            </Code>
            <Json value={{ listing: { ...own, price: 375000, rehab: null } }} />
          </Endpoint>

          <Endpoint id="delete-listing" method="DELETE" path="/listings/{key}">
            <p>
              Deletes one of your own listings, for good. One that’s on a link you sent stays there for whoever has
              the link, and is hidden from your profile instead. The answer says which.
            </p>
            <Code label="Request">{curl(base, "DELETE", `/listings/${OWN}`)}</Code>
            <Json value={{ deleted: true }} />
            <Json
              label="Or, when it’s on a link"
              value={{ withdrawn: true, message: WITHDRAWN_INSTEAD }}
            />
          </Endpoint>

          <Endpoint id="post-listing-photos" method="POST" path="/listings/{key}/photos">
            <p>
              Adds a photo to the end of one of your listings. Send its address, and our server fetches it, or send the
              photo itself as a data URL. Either way it’s kept as a JPEG up to 1600 px on its long side, turned the
              right way up, with where it was taken and the camera’s details taken off.
            </p>
            <Fields
              title="Body: one of"
              fields={[
                {
                  name: "url",
                  children: (
                    <>
                      The photo’s address, starting <C>https://</C>. It must answer within 10 seconds with the photo
                      itself (not a redirect), up to 10 MB: a JPEG, PNG, WebP, GIF or AVIF (not an iPhone’s HEIC). The best way.
                    </>
                  ),
                },
                {
                  name: "data",
                  children: (
                    <>
                      The photo as <C>data:image/jpeg;base64,…</C> (or png, or webp). Keep it under about 3 MB; for
                      anything bigger, use <C>url</C>.
                    </>
                  ),
                },
              ]}
            />
            <Code label="Request">
              {curl(base, "POST", `/listings/${OWN}/photos`, {
                body: { url: "https://photos.example.com/yakima/front.jpg" },
                idempotent: "yakima-photo-front",
              })}
            </Code>
            <Code label="Answer (201)">
              {JSON.stringify(
                {
                  photo: { id: PHOTO, url: `${site}/listing-photo/${PHOTO}`, width: 1600, height: 1067 },
                  listing: "LISTING",
                },
                null,
                2,
              ).replace('"LISTING"', "{ … the listing, with the new photo last in photos … }")}
            </Code>
            <p>
              A listing has room for 15 photos; a 16th is a <C>422</C>. A photo that can’t be fetched or read is a{" "}
              <C>400</C> about <C>url</C> or <C>data</C>, saying why.
            </p>
          </Endpoint>

          <Endpoint id="delete-listing-photo" method="DELETE" path="/listings/{key}/photos/{photoId}">
            <p>
              Takes a photo off one of your listings. <C>photoId</C> is the <C>id</C> that adding it gave back (it’s
              also the last part of a photo’s address, <C>…/listing-photo/{"{id}"}</C>), or the photo’s whole address
              as it is in <C>photos</C>, URL-encoded. The answer is <C>{"{ \"listing\": { … } }"}</C> without it.
            </p>
            <Code label="Request">{curl(base, "DELETE", `/listings/${OWN}/photos/${PHOTO}`)}</Code>
          </Endpoint>

          <Endpoint id="post-listing-videos" method="POST" path="/listings/{key}/videos">
            <p>
              Adds a video to one of your listings, after its photos. It plays by itself, silently, when someone gets to
              it, with a tap for sound. A listing has room for 3 videos; a 4th is a <C>422</C>, and the same video twice
              is a <C>409</C>.
            </p>
            <Fields
              title="Body"
              fields={[
                {
                  name: "url",
                  required: true,
                  children: (
                    <>
                      A YouTube, Vimeo or Loom link (the best way), or an <C>https://</C> link straight to an MP4, MOV or
                      WebM file, up to 50 MB. A file plays from where it is, so keep it there. Anything else is a{" "}
                      <C>400</C> about <C>url</C>, saying why.
                    </>
                  ),
                },
              ]}
            />
            <Code label="Request">
              {curl(base, "POST", `/listings/${OWN}/videos`, {
                body: { url: "https://youtu.be/dQw4w9WgXcQ" },
                idempotent: "yakima-walkthrough",
              })}
            </Code>
            <Code label="Answer (201)">
              {JSON.stringify(
                {
                  video: {
                    id: "3f0c6a52-9a1e-4d8b-b1f7-7b2d1f0c9e41",
                    url: "https://youtu.be/dQw4w9WgXcQ",
                    kind: "link",
                    embed_url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
                  },
                  listing: "LISTING",
                },
                null,
                2,
              ).replace('"LISTING"', "{ … the listing, with the new video last in videos … }")}
            </Code>
            <p>
              <C>GET /listings/{"{key}"}/videos</C> lists them; each listing also carries its <C>videos</C>. A video’s{" "}
              <C>kind</C> is <C>link</C> (YouTube, Vimeo or Loom) or <C>file</C>.
            </p>
          </Endpoint>

          <Endpoint id="delete-listing-video" method="DELETE" path="/listings/{key}/videos/{videoId}">
            <p>
              Takes a video off one of your listings, by the <C>id</C> in its <C>videos</C>. A video you uploaded on the
              site is taken off there (a <C>409</C> here).
            </p>
            <Code label="Request">{curl(base, "DELETE", `/listings/${OWN}/videos/3f0c6a52-9a1e-4d8b-b1f7-7b2d1f0c9e41`)}</Code>
          </Endpoint>
        </Group>

        <Group id="webhook-endpoints" title="Webhooks">
          <p>
            You can also add and remove these on Edit profile, under Connect your tools. What gets sent to them is
            under{" "}
            <a href="#webhooks" className={link}>
              Webhooks
            </a>
            , below.
          </p>

          <Endpoint id="get-webhooks" method="GET" path="/webhooks">
            <p>
              Your webhooks, newest first, each with how its last delivery went. <C>active</C> is false once it’s been
              paused after failing again and again (<C>disabled_at</C> says when); <C>failures</C> counts failed
              deliveries in a row. The signing secret is never shown again.
            </p>
            <Code label="Request">{curl(base, "GET", "/webhooks")}</Code>
            <Json value={{ webhooks: [webhook] }} />
          </Endpoint>

          <Endpoint id="post-webhooks" method="POST" path="/webhooks">
            <p>
              Adds a webhook. The answer has its signing <C>secret</C>, this once: keep it, to check what we send is
              from us.
            </p>
            <Fields
              fields={[
                {
                  name: "url",
                  required: true,
                  children: "Where to send events. A public address starting https://.",
                },
                {
                  name: "events",
                  children: (
                    <>
                      Which to send, from <C>link.opened</C>, <C>home.liked</C>, <C>home.passed</C>,{" "}
                      <C>comment.created</C> and <C>showing.requested</C>. All of them if left out.
                    </>
                  ),
                },
              ]}
            />
            <Code label="Request">
              {curl(base, "POST", "/webhooks", {
                body: { url: "https://hooks.example.com/porchcard", events: ["home.liked", "showing.requested"] },
                idempotent: "crm-webhook-1",
              })}
            </Code>
            <Json
              label="Answer (201)"
              value={{
                webhook: {
                  ...webhook,
                  events: ["home.liked", "showing.requested"],
                  last_delivery: null,
                },
                secret: "whsec_3Fq9Lm2Xv7Rt1Kp8Zc4Nw6Bh0Jd5Ys",
              }}
            />
          </Endpoint>

          <Endpoint id="delete-webhook" method="DELETE" path="/webhooks/{id}">
            <p>Removes a webhook. Nothing more is sent to it.</p>
            <Code label="Request">{curl(base, "DELETE", `/webhooks/${WEBHOOK}`)}</Code>
            <Json value={{ deleted: true }} />
          </Endpoint>

          <Endpoint id="test-webhook" method="POST" path="/webhooks/{id}/test">
            <p>
              Sends a <C>ping</C> event now, once, and says how it went: <C>status</C> is what your address answered
              (null if it didn’t), and <C>error</C> says what went wrong. It works on a paused webhook too, so you can
              check it before turning it back on.
            </p>
            <Code label="Request">{curl(base, "POST", `/webhooks/${WEBHOOK}/test`)}</Code>
            <Json value={{ delivery: { status: 200, ok: true, error: null } }} />
          </Endpoint>
        </Group>
      </Section>

      <Section id="webhooks" title="Webhooks">
        <p>
          A webhook is an address of your tool’s that we send a message to the moment a client does something on one
          of your links. Add one on Edit profile, under Connect your tools, or with <C>POST /webhooks</C>.
        </p>
        <dl className="flex flex-col divide-y divide-stone-200 rounded-xl bg-white ring-1 ring-stone-200">
          {(
            [
              ["link.opened", "Someone opened one of your links, the first time on each phone or computer."],
              [
                "home.liked",
                "A client liked a home. Sent each time they set a like, so the same home can come more than once.",
              ],
              ["home.passed", "A client passed on a home. Also sent each time they set it."],
              ["comment.created", "A client said something on a home, or answered in its conversation."],
              ["showing.requested", "A client asked to see a home in person."],
            ] as const
          ).map(([event, words]) => (
            <div key={event} className="px-3 py-2.5">
              <dt>
                <code className="font-mono text-[13px] font-semibold text-ink">{event}</code>
              </dt>
              <dd className="mt-0.5 text-body text-stone-700">{words}</dd>
            </div>
          ))}
        </dl>
        <p>
          Each is a <C>POST</C> with a JSON body like this one. <C>client</C> is who did it, by the same <C>id</C> and
          first name <C>GET /clients</C> gives; it’s null when we don’t know yet (a link opened by someone who hasn’t
          joined it). <C>home</C> comes with every event about a home, and <C>comment</C> with{" "}
          <C>comment.created</C>.
        </p>
        <Json
          label="comment.created"
          value={{
            id: EVENT,
            type: "comment.created",
            created_at: "2026-11-19T18:03:27.000Z",
            data: {
              link: { id: LINK_ID, title: "Nina & Ben", dashboard_url: `${site}/dashboard/shares/${LINK_ID}` },
              client: { id: "name:nina", name: "Nina", profile_url: null },
              home: {
                key: HOME,
                address: "4127 Larkmoor Ave",
                city: "Tacoma",
                price: 615000,
                url: `${site}/homes/${HOME}`,
              },
              comment: { id: COMMENT, body: "Love the porch. Can we see it Saturday?" },
            },
          }}
        />
        <p>With every one come these headers:</p>
        <Code>
          {[
            "Content-Type: application/json",
            "User-Agent: Porchcard-Webhooks/1",
            "Porchcard-Event: comment.created",
            `Porchcard-Delivery: 0d9e3b7a-6f21-4c58-a3e4-8b1c5f2d7e96`,
            "Porchcard-Signature: t=1795111407,v1=5f8a…",
          ].join("\n")}
        </Code>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            Answer with any <C>2xx</C> within 8 seconds. Do the slow work afterwards.
          </li>
          <li>
            With no answer, a <C>5xx</C>, a <C>408</C> or a <C>429</C>, we try again 2 seconds later, then 8 seconds
            after that. A retry has the same <C>Porchcard-Delivery</C> and body, so you can tell it’s one you’ve had.
          </li>
          <li>
            After 25 failed deliveries in a row, the webhook is paused. Fix your address, then turn it back on in Edit
            profile, under Connect your tools.
          </li>
          <li>
            Events go only to public <C>https://</C> addresses. A <C>ping</C> (from the test) has{" "}
            <C>data.webhook.id</C> and a <C>message</C> instead.
          </li>
        </ul>

        <h3 className="mt-2 text-lg font-semibold">Check it’s from us</h3>
        <p>
          <C>Porchcard-Signature</C> is <C>t=</C> the time it was sent (in seconds) and <C>v1=</C> an HMAC-SHA256,
          in hex, of the time, a full stop and the body exactly as it came, made with your webhook’s secret. Work it out
          the same way and compare. Turn away one more than 5 minutes old, so nobody can send you an old one again.
        </p>
        <Code label="Node.js">{`import crypto from "node:crypto";
import express from "express";

// rawBody: the body exactly as it arrived, before it's read as JSON.
function isFromPorchcard(rawBody, header, secret) {
  const parts = Object.fromEntries((header ?? "").split(",").map((part) => part.split("=")));
  const sent = Number(parts.t);
  if (!sent || Math.abs(Date.now() / 1000 - sent) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(\`\${parts.t}.\${rawBody}\`).digest();
  const given = Buffer.from(parts.v1 ?? "", "hex");
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

const app = express();
app.post("/porchcard", express.raw({ type: "application/json" }), (req, res) => {
  if (!isFromPorchcard(req.body, req.get("Porchcard-Signature"), process.env.PORCHCARD_WEBHOOK_SECRET)) {
    return res.sendStatus(400);
  }
  const event = JSON.parse(req.body);
  res.sendStatus(200);
  // Then: event.type, event.data.client, event.data.home …
});
app.listen(3000);`}</Code>
      </Section>

      <Section id="privacy" title="Your clients’ privacy">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            The API never gives out a client’s email address or phone number, nor their last name. A client is the
            first name you gave them (or their own), and their public profile if they have one.
          </li>
          <li>
            Porchcard never texts your clients. Sending homes gets you their link; your tool sends it, from you. We
            email only people already on Porchcard, as we do when you send from the site.
          </li>
          <li>A key only ever reaches your own clients, links and listings. Anyone else’s are simply not found.</li>
          <li>
            We keep only a fingerprint of each key, never the key itself. Revoke a key you’ve stopped using, and any
            key you think someone else has seen.
          </li>
        </ul>
      </Section>

      <Section id="tools" title="Using it with GoHighLevel, Zapier or Make">
        <p>
          Each of them can send a request to the API and catch our webhooks, without code. The parts are the same
          everywhere: the method, the address, the <C>Authorization</C> header with your key, and a JSON body.
        </p>

        <h3 className="mt-2 text-lg font-semibold">GoHighLevel</h3>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            To send homes: in a workflow, add a <strong className="font-semibold">Custom Webhook</strong> action. Method
            POST, URL <C>{`${base}/links`}</C>, headers <C>Authorization: Bearer pc_live_…</C> and{" "}
            <C>Content-Type: application/json</C>, and a body with the contact’s first name and the home keys.
          </li>
          <li>
            Save the <C>url</C> from the answer to a custom field, and text it to the contact in the next step.
          </li>
          <li>
            To hear back: start a workflow with an <strong className="font-semibold">Inbound Webhook</strong> trigger,
            and add its address as a webhook here.
          </li>
        </ul>

        <h3 className="mt-2 text-lg font-semibold">Zapier</h3>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            To send homes: add a <strong className="font-semibold">Webhooks by Zapier</strong> step,{" "}
            <strong className="font-semibold">Custom Request</strong>. Method POST, the URL, the two headers above, and
            the JSON body in Data.
          </li>
          <li>
            To hear back: start a Zap with Webhooks by Zapier, <strong className="font-semibold">Catch Hook</strong>,
            and add the address it gives you as a webhook here.
          </li>
        </ul>

        <h3 className="mt-2 text-lg font-semibold">Make</h3>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            To send homes: add an <strong className="font-semibold">HTTP</strong> module,{" "}
            <strong className="font-semibold">Make a request</strong>. Method POST, the URL, the two headers, body type
            Raw, content type JSON, and the body.
          </li>
          <li>
            To hear back: start a scenario with <strong className="font-semibold">Webhooks</strong>,{" "}
            <strong className="font-semibold">Custom webhook</strong>, and add its address as a webhook here.
          </li>
        </ul>
        <p>
          Tools like these can’t check the signature, so keep the address they give you to yourself. And give each
          send an <C>Idempotency-Key</C> made from the contact’s id, so a step that runs twice sends once.
        </p>

        <div className={cn(card, "mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5")}>
          <p className="font-semibold">Ready to connect a tool?</p>
          <Link href="/people/me/edit#api" className={cn(link, "inline-flex min-h-11 items-center gap-1.5")}>
            Make a key <ArrowRight aria-hidden size={16} />
          </Link>
        </div>
      </Section>
    </main>
  );
}
