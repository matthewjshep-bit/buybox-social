import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, request, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

// The Porchcard API as an agent's own tool sees it (app/api/v1): a key made
// on Edit profile, sent as "Authorization: Bearer …" on every request, and
// JSON back. Every answer read here is kept for the test to look through
// afterwards: nothing private (an email, a device's token, a client's
// surname) may ever be in one.

// The card on an agent's Edit profile where their tools are connected.
export const toolsCard = (page: Page) => page.getByRole("region", { name: "Connect your tools" });

// A new key, the way an agent makes one: a name for the tool, Make a key,
// and the key copied out of the box it's shown in, the one time it is.
export async function makeKey(page: Page, name: string) {
  await page.goto("/people/me/edit");
  const card = toolsCard(page);
  await card.getByLabel("Name", { exact: true }).fill(name);
  await card.getByRole("button", { name: "Make a key" }).click();
  const shown = card.getByRole("group", { name: `Your key for ${name}` });
  await expect(shown).toBeVisible();
  const key = await shown.getByRole("textbox").inputValue();
  expect(key).toMatch(/^pc_live_[A-Za-z0-9]{32}$/);
  return key;
}

// Every answer the API gave in this test, as it came: its body and headers.
export type Answer = { method: string; path: string; status: number; headers: Record<string, string>; text: string };
export const answers: Answer[] = [];

// JSON as it came back, read loosely: each test checks what it expects of it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

export type ApiResult<T = Loose> = {
  status: number;
  headers: Record<string, string>;
  body: T;
  text: string;
};

async function keep(method: string, path: string, response: APIResponse): Promise<ApiResult> {
  const text = await response.text();
  const headers = response.headers();
  answers.push({ method, path, status: response.status(), headers, text });
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status(), headers, body, text };
}

// A tool holding one agent's key: every request carries it, and only it
// (no cookie: a fresh request context has none).
export class Api {
  private constructor(private context: APIRequestContext) {}

  static async as(key: string | null, extra: Record<string, string> = {}) {
    const baseURL = test.info().project.use.baseURL;
    const context = await request.newContext({
      baseURL,
      extraHTTPHeaders: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...extra },
    });
    return new Api(context);
  }

  // The same requests from a context of someone's own (a signed-in page's).
  static over(context: APIRequestContext) {
    return new Api(context);
  }

  async get(path: string, headers?: Record<string, string>) {
    return keep("GET", path, await this.context.get(`/api/v1${path}`, { headers }));
  }

  async post(path: string, data?: unknown, headers?: Record<string, string>) {
    return keep("POST", path, await this.context.post(`/api/v1${path}`, { data, headers }));
  }

  async patch(path: string, data?: unknown, headers?: Record<string, string>) {
    return keep("PATCH", path, await this.context.patch(`/api/v1${path}`, { data, headers }));
  }

  async delete(path: string, headers?: Record<string, string>) {
    return keep("DELETE", path, await this.context.delete(`/api/v1${path}`, { headers }));
  }
}

// Nothing private in anything the API said in this test: no email address
// of anyone (every test account's is at example.com), no device's token, no
// surname a buyer gave, and never a cookie set.
export function expectNothingPrivate(surnames: string[] = []) {
  for (const answer of answers) {
    const where = `${answer.method} ${answer.path} (${answer.status})`;
    expect(answer.text, where).not.toMatch(/[\w.+-]+@example\.com/);
    expect(answer.text, where).not.toMatch(/device_?token/i);
    for (const surname of surnames) expect(answer.text, where).not.toContain(surname);
    expect(answer.headers["set-cookie"], where).toBeUndefined();
    // Every answer is JSON, and never kept by anything in between.
    expect(answer.headers["content-type"], where).toMatch(/^application\/json/);
    expect(answer.headers["cache-control"], where).toBe("no-store");
  }
}

// What the API says when it says no: always this shape.
export function expectError(result: ApiResult, status: number, code: string, field?: string) {
  expect(result.status, result.text).toBe(status);
  expect(result.body?.error?.code, result.text).toBe(code);
  expect(typeof result.body?.error?.message).toBe("string");
  expect(result.body.error.message.length).toBeGreaterThan(0);
  if (field !== undefined) expect(result.body.error.field, result.text).toBe(field);
}

// A webhook receiver, as an agent's tool would have one: a little server on
// this machine that keeps everything sent to it and answers 200.
export type Delivery = { path: string; headers: IncomingHttpHeaders; raw: string; json: Loose };

export async function receiver() {
  const deliveries: Delivery[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let json: unknown = null;
      try {
        json = JSON.parse(raw);
      } catch {
        json = null;
      }
      deliveries.push({ path: req.url ?? "", headers: req.headers, raw, json });
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: (path = "/hooks/porchcard") => `http://127.0.0.1:${port}${path}`,
    deliveries,
    // The first delivery of this event (and anything else asked of it), once it's come.
    async next(event: string, where: (d: Delivery) => boolean = () => true) {
      let found: Delivery | undefined;
      await expect
        .poll(
          () => {
            found = deliveries.find((d) => d.headers["porchcard-event"] === event && where(d));
            return Boolean(found);
          },
          { timeout: 20_000, message: `a ${event} delivery` },
        )
        .toBe(true);
      return found!;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// Porchcard-Signature: "t=<unix seconds>,v1=<hex HMAC-SHA256 of '<t>.<body>'>",
// with the webhook's own secret: checked as a tool should check it.
export function expectSigned(delivery: Delivery, secret: string) {
  const header = String(delivery.headers["porchcard-signature"] ?? "");
  const match = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header);
  expect(match, `signature header "${header}"`).not.toBeNull();
  const [, t, v1] = match!;
  expect(Math.abs(Date.now() / 1000 - Number(t))).toBeLessThan(300);
  const expected = createHmac("sha256", secret).update(`${t}.${delivery.raw}`).digest();
  expect(timingSafeEqual(expected, Buffer.from(v1, "hex"))).toBe(true);
  // Signed with this secret and no other.
  const wrong = createHmac("sha256", `${secret}x`).update(`${t}.${delivery.raw}`).digest();
  expect(timingSafeEqual(wrong, Buffer.from(v1, "hex"))).toBe(false);
}
