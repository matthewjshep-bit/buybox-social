import { createHmac, randomUUID } from "node:crypto";
import { clientKeyFor } from "../clients";
import { sql } from "../db";
import { appUrl } from "../format";
import { linkTitle } from "../people-picker";
import { ANONYMOUS_BUYER } from "../timeline";
import { randomBase62 } from "./keys";
import { checkPublicUrl, safeRequest, SafeRequestError } from "./safe-request";

// Webhooks: addresses an agent's own tools (a CRM, Zapier, Make) gave us, to
// be told the moment a client does something on one of the agent's links:
// opens it, likes or passes on a home, says something, asks to see one. What
// goes out is only what the agent sees on their Clients page anyway (a first
// name, the home, what was said), never an email address or a phone number.
//
// Each one is signed with the webhook's own secret (shown to the agent once,
// when it's made), so the tool can tell it came from us: the header
// Porchcard-Signature is `t=<unix seconds>,v1=<hex HMAC-SHA256 of
// "<t>.<body>">`. A send that fails is tried twice more, a little later; one
// that keeps failing is paused, so a tool that's gone away isn't knocked on
// forever, until the agent turns it back on.

export const EVENTS = ["link.opened", "home.liked", "home.passed", "comment.created", "showing.requested"] as const;
export type WebhookEvent = (typeof EVENTS)[number];

export const WEBHOOKS_MOST = 5;
// Failed sends in a row before a webhook is paused.
const PAUSE_AFTER = 25;
// Sends kept for each webhook, for the agent to see how it's going.
const DELIVERIES_KEPT = 50;
const TIMEOUT_MS = 8_000;
// We never read the answer, only its status: a page longer than this is
// stopped rather than waited for.
const ANSWER_MOST_BYTES = 64 * 1024;
// When each try goes, after the one before it fails.
const RETRY_WAITS_MS = [0, 2_000, 8_000];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

const isEvent = (value: unknown): value is WebhookEvent => EVENTS.includes(value as WebhookEvent);

export type WebhookDelivery = {
  event: string;
  // The status the tool answered with, or null when it never answered.
  status: number | null;
  ok: boolean;
  // What went wrong, in plain words, or null when it got there.
  error: string | null;
  at: Date;
};

export type WebhookSummary = {
  id: string;
  url: string;
  events: WebhookEvent[];
  created_at: Date;
  // When it was paused after failing again and again, or null while it's on.
  disabled_at: Date | null;
  // Failed sends in a row (back to 0 once one gets there).
  failures: number;
  last_delivery: WebhookDelivery | null;
};

type SummaryRow = {
  id: string;
  url: string;
  events: string[];
  created_at: Date;
  disabled_at: Date | null;
  failures: number;
  last_event: string | null;
  last_status: number | null;
  last_error: string | null;
  last_delivered_at: Date | null;
  last_at: Date | null;
};

const summaryOf = (row: SummaryRow): WebhookSummary => ({
  id: row.id,
  url: row.url,
  events: EVENTS.filter((event) => row.events.includes(event)),
  created_at: row.created_at,
  disabled_at: row.disabled_at,
  failures: row.failures,
  last_delivery:
    row.last_at && row.last_event
      ? {
          event: row.last_event,
          status: row.last_status,
          ok: row.last_delivered_at !== null,
          error: row.last_error,
          at: row.last_at,
        }
      : null,
});

// A webhook as the API gives it back: dates as ISO strings. Never the secret.
export function webhookJson(webhook: WebhookSummary) {
  const iso = (date: Date | null) => (date ? new Date(date).toISOString() : null);
  return {
    id: webhook.id,
    url: webhook.url,
    events: webhook.events,
    created_at: iso(webhook.created_at),
    active: webhook.disabled_at === null,
    disabled_at: iso(webhook.disabled_at),
    failures: webhook.failures,
    last_delivery: webhook.last_delivery
      ? {
          event: webhook.last_delivery.event,
          status: webhook.last_delivery.status,
          ok: webhook.last_delivery.ok,
          error: webhook.last_delivery.error,
          at: iso(webhook.last_delivery.at),
        }
      : null,
  };
}

export type WebhookJson = ReturnType<typeof webhookJson>;

// Their webhooks, newest first, each with how its last send went.
export async function listWebhooks(agentId: string): Promise<WebhookSummary[]> {
  const rows = await sql<SummaryRow[]>`
    select w.id, w.url, w.events, w.created_at, w.disabled_at, w.failures,
      d.event as last_event, d.status as last_status, d.error as last_error,
      d.delivered_at as last_delivered_at, d.created_at as last_at
    from api_webhooks w
    left join lateral (
      select event, status, error, delivered_at, created_at from api_webhook_deliveries
      where webhook_id = w.id
      order by created_at desc, id desc
      limit 1
    ) d on true
    where w.account_id = ${agentId}
    order by w.created_at desc, w.id`;
  return rows.map(summaryOf);
}

async function oneWebhook(agentId: string, id: string): Promise<WebhookSummary | null> {
  const all = await listWebhooks(agentId);
  return all.find((webhook) => webhook.id === id) ?? null;
}

export type CreateWebhookError = { error: string; field?: "url" | "events"; limit?: true };

// A new webhook for this agent: where to send, and which of EVENTS (all of
// them, when none are named). Gives back its signing secret this once; it's
// never shown again. No more than WEBHOOKS_MOST, paused ones included. Their
// account row is held while they're counted, so two made at the same moment
// can't both slip under the limit.
export async function createWebhook(
  agentId: string,
  url: string,
  events?: readonly string[] | null,
): Promise<{ webhook: WebhookSummary; secret: string } | CreateWebhookError> {
  const address = typeof url === "string" ? url.trim() : "";
  if (!address) return { error: "Give the address to send to. It starts with https://", field: "url" };
  const wrong = checkPublicUrl(address);
  if (wrong) return { error: wrong, field: "url" };

  let chosen: WebhookEvent[] = [...EVENTS];
  if (events !== undefined && events !== null) {
    if (!Array.isArray(events) || events.some((event) => !isEvent(event))) {
      return { error: `Events can only be ${EVENTS.join(", ")}.`, field: "events" };
    }
    chosen = EVENTS.filter((event) => events.includes(event));
    if (chosen.length === 0) return { error: "Choose at least one thing to be told about.", field: "events" };
  }

  const secret = `whsec_${randomBase62(32)}`;
  const made = await sql.begin(async (tx): Promise<CreateWebhookError | { id: string }> => {
    const [account] = await tx<{ role: string | null }[]>`
      select role from accounts where id = ${agentId} for update`;
    if (account?.role !== "agent") return { error: "Only agents can add webhooks." };
    const [{ n }] = await tx<{ n: number }[]>`
      select count(*)::int as n from api_webhooks where account_id = ${agentId}`;
    if (n >= WEBHOOKS_MOST) {
      return {
        error: `You have ${WEBHOOKS_MOST} webhooks already. Remove one you don't use to add another.`,
        limit: true as const,
      };
    }
    const [row] = await tx<{ id: string }[]>`
      insert into api_webhooks (account_id, url, events, secret)
      values (${agentId}, ${address}, ${chosen}::text[], ${secret})
      returning id`;
    return { id: row.id };
  });
  if ("error" in made) return made;
  const webhook = await oneWebhook(agentId, made.id);
  if (!webhook) return { error: "That webhook couldn't be added. Try again." };
  return { webhook, secret };
}

// Removes one of their webhooks, and what's kept of its sends. False when it
// isn't theirs (or is gone already).
export async function deleteWebhook(agentId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await sql`delete from api_webhooks where id = ${id} and account_id = ${agentId} returning id`;
  return rows.length > 0;
}

// Turns a paused webhook back on, its count of failures started again. False
// when it isn't theirs.
export async function enableWebhook(agentId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await sql`
    update api_webhooks set disabled_at = null, failures = 0
    where id = ${id} and account_id = ${agentId}
    returning id`;
  return rows.length > 0;
}

type Target = { id: string; url: string; secret: string };
export type DeliveryResult = { status: number | null; ok: boolean; error: string | null };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// What the tool answered that it's no use asking again: anything but "try
// later" (408, 429) or a failure of its own (5xx). A refused address (on a
// private network) is the same every time too.
const worthRetrying = (result: DeliveryResult, blocked: boolean) =>
  !blocked && (result.status === null || result.status === 408 || result.status === 429 || result.status >= 500);

// One try: the body signed with the time it goes, so a tool can turn away an
// old one sent again by someone else.
async function attempt(
  target: Target,
  event: string,
  deliveryId: string,
  raw: string,
): Promise<{ result: DeliveryResult; blocked: boolean }> {
  const t = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", target.secret).update(`${t}.${raw}`).digest("hex");
  try {
    const answer = await safeRequest(target.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Porchcard-Webhooks/1",
        "Porchcard-Event": event,
        "Porchcard-Delivery": deliveryId,
        "Porchcard-Signature": `t=${t},v1=${signature}`,
      },
      body: raw,
      timeoutMs: TIMEOUT_MS,
      maxBytes: ANSWER_MOST_BYTES,
      truncate: true,
    });
    const ok = answer.status >= 200 && answer.status < 300;
    return {
      result: { status: answer.status, ok, error: ok ? null : `It answered ${answer.status}.` },
      blocked: false,
    };
  } catch (error) {
    const message =
      error instanceof SafeRequestError
        ? error.message
        : error instanceof Error
          ? error.message
          : "The request couldn't be made.";
    return {
      result: { status: null, ok: false, error: message.slice(0, 300) || "The request couldn't be made." },
      blocked: error instanceof SafeRequestError && error.code === "blocked",
    };
  }
}

// One event to one webhook: tried up to three times (a test, once, since
// someone's waiting on it), then written down, the newest DELIVERIES_KEPT
// kept. A real event also keeps count of failures in a row, and pauses the
// webhook at PAUSE_AFTER; a test leaves that alone, so trying one out never
// pauses it or turns it back on.
async function deliver(
  target: Target,
  event: string,
  eventId: string,
  raw: string,
  { test = false } = {},
): Promise<DeliveryResult> {
  const deliveryId = randomUUID();
  let result: DeliveryResult = { status: null, ok: false, error: "It wasn't sent." };
  let attempts = 0;
  for (const wait of test ? [0] : RETRY_WAITS_MS) {
    if (wait) await sleep(wait);
    attempts += 1;
    const tried = await attempt(target, event, deliveryId, raw);
    result = tried.result;
    if (result.ok || !worthRetrying(result, tried.blocked)) break;
  }

  try {
    // (Only while the webhook is still there: it may have been removed
    // while this was being sent.)
    await sql`
      insert into api_webhook_deliveries (id, webhook_id, event_id, event, status, error, attempts, delivered_at)
      select ${deliveryId}::uuid, ${target.id}::uuid, ${eventId}::uuid, ${event}, ${result.status}::int,
        ${result.error}, ${attempts}::int, case when ${result.ok}::boolean then now() end
      where exists (select 1 from api_webhooks where id = ${target.id})`;
    await sql`
      delete from api_webhook_deliveries
      where webhook_id = ${target.id} and id in (
        select id from api_webhook_deliveries where webhook_id = ${target.id}
        order by created_at desc, id desc
        offset ${DELIVERIES_KEPT})`;
    if (!test) {
      await sql`
        update api_webhooks set
          failures = case when ${result.ok}::boolean then 0 else failures + 1 end,
          disabled_at = case
            when not ${result.ok}::boolean and failures + 1 >= ${PAUSE_AFTER}::int then coalesce(disabled_at, now())
            else disabled_at end
        where id = ${target.id}`;
    }
  } catch (error) {
    console.error("[webhooks] couldn't record a delivery", error);
  }
  return result;
}

// Sends one of their webhooks a "ping", now, whether it's on or paused, so
// they can see it gets there. Null when it isn't theirs.
export async function sendTestEvent(agentId: string, id: string): Promise<DeliveryResult | null> {
  if (!isUuid(id)) return null;
  const [target] = await sql<Target[]>`
    select id, url, secret from api_webhooks where id = ${id} and account_id = ${agentId}`;
  if (!target) return null;
  const eventId = randomUUID();
  const raw = JSON.stringify({
    id: eventId,
    type: "ping",
    created_at: new Date().toISOString(),
    data: { webhook: { id: target.id }, message: "This is a test from Porchcard. Your webhook works." },
  });
  return deliver(target, "ping", eventId, raw, { test: true });
}

export type LinkEventDetails = {
  // Who did it, on the link. Null when nobody's known (a link opened by
  // someone who hasn't joined it).
  participantId: string | null;
  listingKey?: string;
  commentId?: string;
  body?: string;
};

// Tells the webhooks of the agent whose link this is that someone did
// something there. Called from inside `after()`, so the client's page never
// waits on it. With no webhook wanting this event (nearly always) it's one
// query and done. It never throws: whatever goes wrong is logged, and the
// client's tap has already been saved.
export async function emitLinkEvent(shareId: string, type: WebhookEvent, details: LinkEventDetails): Promise<void> {
  try {
    if (!isUuid(shareId) || !isEvent(type)) return;
    // Only an agent's link, only webhooks that are on and asked for this.
    const targets = await sql<(Target & { agent_id: string; client_name: string })[]>`
      select w.id, w.url, w.secret, s.agent_id, s.client_name
      from shares s
      join accounts a on a.id = s.agent_id and a.role = 'agent'
      join api_webhooks w on w.account_id = s.agent_id
      where s.id = ${shareId} and w.disabled_at is null and ${type} = any (w.events)`;
    if (targets.length === 0) return;
    const { agent_id: agentId, client_name: clientName } = targets[0];

    const [first] = await sql<{ address: string | null }[]>`
      select l.data->>'UnparsedAddress' as address
      from share_listings sl join listings l on l.listing_key = sl.listing_key
      where sl.share_id = ${shareId} and sl.removed_at is null
      order by sl.position
      limit 1`;

    // Who did it, by the same id and name GET /clients gives them, and their
    // public page if they've signed up. Never more than that about them.
    let client: { id: string; name: string; profile_url: string | null } | null = null;
    if (isUuid(details.participantId)) {
      const [person] = await sql<{ first_name: string; profile: string | null }[]>`
        select p.first_name, (select v.id from visitors v where v.account_id = p.account_id) as profile
        from participants p
        where p.id = ${details.participantId} and p.share_id = ${shareId}`;
      const key = person ? await clientKeyFor(agentId, details.participantId) : null;
      if (person && key) {
        client = {
          id: key,
          name: person.first_name.trim() || ANONYMOUS_BUYER,
          profile_url: person.profile ? `${appUrl()}/people/${person.profile}` : null,
        };
      }
    }

    let home: { key: string; address: string; city: string; price: number | null; url: string } | undefined;
    if (typeof details.listingKey === "string" && details.listingKey.length <= 100) {
      const [row] = await sql<{ address: string | null; city: string | null; price: unknown }[]>`
        select l.data->>'UnparsedAddress' as address, l.data->>'City' as city, l.data->'ListPrice' as price
        from share_listings sl join listings l on l.listing_key = sl.listing_key
        where sl.share_id = ${shareId} and sl.listing_key = ${details.listingKey}`;
      if (row) {
        home = {
          key: details.listingKey,
          address: row.address ?? "",
          city: row.city ?? "",
          price: typeof row.price === "number" && Number.isFinite(row.price) ? row.price : null,
          url: `${appUrl()}/homes/${encodeURIComponent(details.listingKey)}`,
        };
      }
    }

    const comment =
      typeof details.commentId === "string" && typeof details.body === "string"
        ? { id: details.commentId, body: details.body }
        : undefined;

    const eventId = randomUUID();
    const raw = JSON.stringify({
      id: eventId,
      type,
      created_at: new Date().toISOString(),
      data: {
        link: {
          id: shareId,
          title: linkTitle(clientName, first?.address),
          dashboard_url: `${appUrl()}/dashboard/shares/${shareId}`,
        },
        client,
        ...(home ? { home } : {}),
        ...(comment ? { comment } : {}),
      },
    });

    // Each webhook on its own: one that's slow or down doesn't hold up the rest.
    const sent = await Promise.allSettled(
      targets.map((target) => deliver({ id: target.id, url: target.url, secret: target.secret }, type, eventId, raw)),
    );
    for (const outcome of sent) {
      if (outcome.status === "rejected") console.error("[webhooks] delivery failed", outcome.reason);
    }
  } catch (error) {
    console.error(`[webhooks] couldn't send ${type} for link ${shareId}`, error);
  }
}
