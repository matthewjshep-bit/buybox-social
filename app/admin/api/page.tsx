import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { C, Code, Endpoint, Fields, Json } from "@/app/developers/parts";
import { Card, PageTitle } from "@/components/admin-ui";
import { listAdminKeys } from "@/lib/api/keys";
import { requireSuperAdmin } from "@/lib/auth";
import { BRAND_COLORS } from "@/lib/format";
import { siteOrigin } from "@/lib/site";
import { link } from "@/lib/ui";
import { AdminKeys } from "./keys";

export const metadata = { title: "API · Admin" };

// The owner's API: their admin keys, and how to use one, on one page. Only
// the owner sees it (anyone else gets "not found"); nothing public links
// here, and /developers stays about agents' own keys. The docs say what
// /api/admin/v1 takes and gives back, with the agent API (/api/v1) used
// through the Porchcard-Account header for an agent's listings, photos,
// links, clients and webhooks.

// The examples' made-up people and ids, written once so each matches
// wherever it comes back.
const JORDAN = "4d2b8f6a-1c3e-4a97-b05d-8e7f2a1c9d36";
const JORDAN_PROFILE = "6f1d2c0a-3b8e-4a51-9c27-0d4e5f6a7b81";
const OWN = "OWN-0b8e4f2a-7c1d-4e95-a3b6-5f9d2e8c1a74";
const PHOTO = "e3a7c5d1-9b2f-4086-8d4e-1c6a0f7b3e92";
const LOG_ENTRY = "b7c1e9d3-5a2f-4e86-9d40-3f6a8c2e1b75";
const OWNER_ID = "0e9d8c7b-6a5f-4e3d-8c2b-1a0f9e8d7c6b";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

// The curl for a request: the admin key from an environment variable (never
// typed into a command someone might paste somewhere), the agent it acts as
// when it's on /api/v1, and a JSON body when there is one. Bodies here never
// hold a single quote, so they sit inside one.
function call(
  url: string,
  method: Method,
  { body, idempotent, acting }: { body?: unknown; idempotent?: string; acting?: string } = {},
) {
  const lines = [
    `curl ${method === "GET" ? "" : `-X ${method} `}"${url}"`,
    `  -H "Authorization: Bearer $PORCHCARD_ADMIN_KEY"`,
  ];
  if (acting) lines.push(`  -H "Porchcard-Account: ${acting}"`);
  if (body !== undefined) lines.push(`  -H "Content-Type: application/json"`);
  if (idempotent) lines.push(`  -H "Idempotency-Key: ${idempotent}"`);
  if (body !== undefined) lines.push(`  -d '${JSON.stringify(body, null, 2).replace(/\n/g, "\n  ")}'`);
  return lines.join(" \\\n");
}

// A part of the docs, under the card's own heading.
function Part({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6">
      <h3 id={`${id}-title`} className="text-lg font-semibold">
        {title}
      </h3>
      <div className="mt-3 flex min-w-0 flex-col gap-4 leading-relaxed text-stone-800">{children}</div>
    </section>
  );
}

export default async function AdminApiPage() {
  await connection();
  const owner = await requireSuperAdmin();
  const [keys, site] = await Promise.all([listAdminKeys(owner.id), siteOrigin()]);
  const admin = `${site}/api/admin/v1`;
  const agentApi = `${site}/api/v1`;

  // An account as the admin API writes it.
  const created = {
    id: JORDAN,
    email: "jordan@harborpine.com",
    role: "agent",
    kind: "agent",
    signed_in: false,
    owner: false,
    full_name: "Jordan Rivera",
    phone: "206-555-0188",
    brokerage: "Harbor & Pine Realty",
    mls_agent_id: "NW-48213",
    contact_phone: "2065550188",
    contact_email: "jordan@harborpine.com",
    bio: "Tacoma homes and fixer-uppers since 2009.",
    profile_links: [{ label: "Website", url: "https://harborpine.com/" }],
    brand_color: "#1F5F5B",
    photo_url: `${site}/people/${JORDAN_PROFILE}/photo?v=3f9a1c0d2e`,
    banner: "",
    banner_url: null,
    profile_url: `${site}/people/${JORDAN_PROFILE}`,
    created_at: "2026-11-19T17:02:11.000Z",
  };
  const counts = {
    own_listings: 1,
    links_sent: 0,
    clients: 0,
    followers: 0,
    likes: 0,
    comments: 0,
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
    photos: [],
    url: `${site}/homes/${OWN}`,
    listed_by: { agent: "Jordan Rivera", office: "Harbor & Pine Realty" },
    own: true,
    shown: true,
    closed: false,
    arv: 520000,
    rehab: 85000,
    show_price_per_sqft: true,
    updated_at: "2026-11-19T17:04:30.000Z",
    edit_url: `${site}/dashboard/listings/${OWN}`,
  };

  const profileFields = [
    { name: "full_name", children: "Up to 80 characters (60 for a buyer). Can't be cleared." },
    { name: "phone", children: "Their own number, for you. Never shown." },
    { name: "bio", children: "Up to 300 characters." },
    { name: "brokerage", children: "Agent only. Up to 80 characters." },
    {
      name: "mls_agent_id",
      children: "Agent only. Their MLS agent id, so their MLS listings show as theirs.",
    },
    {
      name: "contact_phone, contact_email",
      children: "Agent only. What clients see on a link: a number with area code, an email.",
    },
    {
      name: "profile_links",
      children: "Agent only. Up to 5, each { label, url }.",
    },
    {
      name: "brand_color",
      children: (
        <>
          Agent only. One of {BRAND_COLORS.map((c, i) => (
            <span key={c.value}>
              {i > 0 ? " " : ""}
              <C>{c.value}</C>
            </span>
          ))}
          .
        </>
      ),
    },
    {
      name: "photo, banner",
      children: (
        <>
          <C>{'{ "url": "https://…" }'}</C> or <C>{'{ "data": "data:image/jpeg;base64,…" }'}</C> (JPEG, PNG or WebP). Resized
          as the site resizes them. Use <C>url</C> for a big image: a request over about 4 MB is turned away.
        </>
      ),
    },
  ];

  return (
    <>
      <PageTitle title="API">Full access to every account. Only you see this page.</PageTitle>

      <Card>
        <AdminKeys keys={keys} />
      </Card>

      <Card title="How to use it" className="mt-6">
        <div className="flex flex-col gap-8">
          <Part id="base" title="Address and key">
            <p>
              Admin: <C>{admin}</C>
              <br />
              Agents&apos; API: <C>{agentApi}</C>
            </p>
            <p>
              Send your key on every request as <C>Authorization: Bearer pc_admin_…</C>. It works only while your
              account&apos;s email is {owner.email.toLowerCase()}.
            </p>
            <p>
              Same rules as the agents&apos; API: JSON in and out, 120 requests a minute, errors as{" "}
              <C>{'{ "error": { "code", "message", "field" } }'}</C>, and an <C>Idempotency-Key</C> on a <C>POST</C> so
              a retry never makes two. Every change is logged.
            </p>
          </Part>

          <Part id="acting" title="Work as an agent">
            <p>
              Add <C>Porchcard-Account: {"<their id>"}</C> to any request to <C>{agentApi}</C>. It then works exactly as
              that agent&apos;s own key: their listings, photos, links, clients and webhooks. Every endpoint is on{" "}
              <Link href="/developers" className={link}>
                the API page
              </Link>
              .
            </p>
            <p>
              Without the header: <C>400</C>. Not an agent&apos;s id: <C>404</C>.
            </p>
            <Code label="1. Make the agent">
              {call(`${admin}/accounts`, "POST", {
                body: {
                  email: "jordan@harborpine.com",
                  kind: "agent",
                  full_name: "Jordan Rivera",
                  brokerage: "Harbor & Pine Realty",
                  photo: { url: "https://photos.example.com/jordan.jpg" },
                },
                idempotent: "make-jordan",
              })}
            </Code>
            <Json label="Answer (201)" value={{ account: { id: JORDAN, role: "agent", "…": "…" } }} />
            <Code label="2. Add a listing for them">
              {call(`${agentApi}/listings`, "POST", {
                acting: JORDAN,
                body: {
                  address: "2210 S Yakima Ave",
                  city: "Tacoma",
                  state: "WA",
                  zip: "98405",
                  price: 389000,
                  beds: 3,
                  baths: 1,
                  sqft: 1320,
                  arv: 520000,
                  rehab: 85000,
                },
                idempotent: "jordan-yakima",
              })}
            </Code>
            <Json
              label="Answer (201)"
              value={{
                listing: { key: OWN, address: "2210 S Yakima Ave", "…": "…" },
              }}
            />
            <Code label="3. Add its photo">
              {call(`${agentApi}/listings/${OWN}/photos`, "POST", {
                acting: JORDAN,
                body: { url: "https://photos.example.com/yakima/front.jpg" },
                idempotent: "jordan-yakima-front",
              })}
            </Code>
            <Json
              label="Answer (201)"
              value={{
                photo: {
                  id: PHOTO,
                  url: `${site}/listing-photo/${PHOTO}`,
                  width: 1600,
                  height: 1067,
                },
                listing: { ...own, photos: [`${site}/listing-photo/${PHOTO}`] },
              }}
            />
          </Part>

          <Part id="sign-in" title="When they sign in">
            <p>
              No email is sent. Tell them to sign in at <C>{`${site}/login`}</C> with the email you used. They land in
              the account you made, with everything you added.
            </p>
          </Part>

          <Part id="endpoints" title="Admin endpoints">
            <p>
              Each path below is under <C>{admin}</C>.
            </p>
            <Endpoint id="admin-me" method="GET" path="/me">
              <p>Which key this is, and whose.</p>
              <Code label="Request">{call(`${admin}/me`, "GET")}</Code>
              <Json
                value={{
                  key: { name: "My script", prefix: "pc_admin_7Hq2x" },
                  owner: {
                    id: OWNER_ID,
                    email: owner.email.toLowerCase(),
                    name: owner.full_name.trim(),
                  },
                }}
              />
            </Endpoint>

            <Endpoint id="admin-accounts" method="GET" path="/accounts">
              <p>
                Every account, newest first. <C>q</C> finds a name, email, phone, brokerage or MLS id; <C>role</C> is{" "}
                <C>agent</C> or <C>buyer</C>; <C>limit</C> 1 to 100 (50); <C>offset</C>.
              </p>
              <Code label="Request">{call(`${admin}/accounts?q=rivera&role=agent`, "GET")}</Code>
              <Json value={{ accounts: [created], total: 1 }} />
            </Endpoint>

            <Endpoint id="admin-post-account" method="POST" path="/accounts">
              <p>
                Makes an account. An email that already has one is a <C>409</C>.
              </p>
              <Fields
                fields={[
                  {
                    name: "email",
                    required: true,
                    children: "What they'll sign in with.",
                  },
                  {
                    name: "kind",
                    required: true,
                    children: (
                      <>
                        What they are: <C>agent</C>, <C>investor</C> (whose listings are deals), <C>lender</C> or{" "}
                        <C>buyer</C> (shopping). It&apos;s the chip beside their name, and they aren&apos;t asked it when
                        they sign in. (Or send <C>role</C>, <C>agent</C> or <C>buyer</C>, as before.)
                      </>
                    ),
                  },
                  ...profileFields,
                ]}
              />
              <Code label="Request">
                {call(`${admin}/accounts`, "POST", {
                  body: {
                    email: "jordan@harborpine.com",
                    kind: "agent",
                    full_name: "Jordan Rivera",
                    phone: "206-555-0188",
                    brokerage: "Harbor & Pine Realty",
                    mls_agent_id: "NW-48213",
                    contact_phone: "206-555-0188",
                    contact_email: "jordan@harborpine.com",
                    bio: "Tacoma homes and fixer-uppers since 2009.",
                    profile_links: [{ label: "Website", url: "harborpine.com" }],
                    brand_color: "#1F5F5B",
                    photo: { url: "https://photos.example.com/jordan.jpg" },
                  },
                  idempotent: "make-jordan",
                })}
              </Code>
              <Json label="Answer (201)" value={{ account: created }} />
            </Endpoint>

            <Endpoint id="admin-get-account" method="GET" path="/accounts/{id}">
              <p>One account, with what they&apos;ve done.</p>
              <Code label="Request">{call(`${admin}/accounts/${JORDAN}`, "GET")}</Code>
              <Json value={{ account: { ...created, counts } }} />
            </Endpoint>

            <Endpoint id="admin-patch-account" method="PATCH" path="/accounts/{id}">
              <p>
                Send only what changes: any field above, <C>email</C> or <C>role</C>. <C>null</C> clears a field
                (except <C>full_name</C>), a photo or a banner (<C>brand_color</C> goes back to <C>#1F5F5B</C>). An email that&apos;s taken is a{" "}
                <C>409</C>. Your own role and email can&apos;t change.
              </p>
              <p>
                A new email for someone who has signed in: the site shows it, but they still sign in with the old one.
                For someone who hasn&apos;t yet, they sign in with the new one.
              </p>
              <Code label="Request">
                {call(`${admin}/accounts/${JORDAN}`, "PATCH", {
                  body: { brokerage: "Northlight Realty", banner: null },
                })}
              </Code>
              <Json
                value={{
                  account: {
                    ...created,
                    brokerage: "Northlight Realty",
                    counts,
                  },
                }}
              />
            </Endpoint>

            <Endpoint id="admin-delete-account" method="DELETE" path="/accounts/{id}?confirm={email}">
              <p>
                Deletes an account for good. <C>confirm</C> must be that account&apos;s email, or it&apos;s a <C>400</C>
                . Your own account can&apos;t be deleted (<C>409</C>).
              </p>
              <p>
                Their profile, own listings, links and keys go with it, and so do their likes and comments on profiles
                and public homes. A listing of theirs on another agent&apos;s link stays there, withdrawn. MLS homes
                stay.
              </p>
              <p>
                Some things stay. On another agent&apos;s link, their place stays under their first name, with what
                they liked and said there. A sign-up form they filled in stays, and so do video files they uploaded.
                Signing in again with that email makes a new account. Answer: <C>204</C>, no body.
              </p>
              <Code label="Request">
                {call(`${admin}/accounts/${JORDAN}?confirm=${encodeURIComponent("jordan@harborpine.com")}`, "DELETE")}
              </Code>
              <Json
                label="Wrong or missing confirm (400)"
                value={{
                  error: {
                    code: "invalid_request",
                    message: "To delete this account, send its email as ?confirm=.",
                    field: "confirm",
                  },
                }}
              />
            </Endpoint>

            <Endpoint id="admin-log" method="GET" path="/log">
              <p>
                Every change made with an admin key, here or as an agent, newest first. <C>limit</C>, <C>offset</C>.
              </p>
              <Code label="Request">{call(`${admin}/log?limit=20`, "GET")}</Code>
              <Json
                value={{
                  entries: [
                    {
                      id: LOG_ENTRY,
                      created_at: "2026-11-19T17:05:02.000Z",
                      method: "POST",
                      path: `/api/v1/listings/${OWN}/photos`,
                      status: 201,
                      account_id: JORDAN,
                      key: { name: "My script", prefix: "pc_admin_7Hq2x" },
                    },
                  ],
                  total: 3,
                }}
              />
            </Endpoint>
          </Part>
        </div>
      </Card>
    </>
  );
}
