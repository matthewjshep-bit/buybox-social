import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { request as httpRequest, type ClientRequest, type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";

// Requests our server makes to addresses someone else gave us: a webhook an
// agent's tool asked to be sent to, a photo by its address. Whoever gave the
// address mustn't be able to point it at us: at this server itself, at the
// cloud's own metadata address (169.254.169.254, which hands out
// credentials), or at anything else on a private network.
//
// The address a name stands for is checked as the connection is made (in the
// socket's own lookup), not just once beforehand: a name can say "public" to
// a check and "private" a moment later when it's used (DNS rebinding), and
// only the one actually connected to counts. An address typed as numbers is
// never looked up, so it's checked from the URL itself.
//
// Only https, never a redirect followed (a 3xx comes back as it is), and no
// more than so long or so many bytes. For working on a computer at home,
// API_WEBHOOKS_ALLOW_LOCAL=true lets http and the computer itself
// (localhost) through, and still nothing else private.

export class SafeRequestError extends Error {
  constructor(
    public code: "blocked" | "timeout" | "too_large" | "network",
    message: string,
  ) {
    super(message);
    this.name = "SafeRequestError";
  }
}

export type SafeResponse = { status: number; headers: IncomingHttpHeaders; body: Buffer };

export type SafeRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;
  maxBytes?: number;
  // Past maxBytes, settle on what came (the status, and the body cut short)
  // rather than fail: for an answer whose status is all that matters.
  truncate?: boolean;
};

const allowLocal = () => process.env.API_WEBHOOKS_ALLOW_LOCAL === "true";

// An IPv4 address as a number, or null when it isn't one.
function ipv4Number(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
    n = n * 256 + Number(part);
  }
  return n;
}

const inV4 = (n: number, base: string, bits: number) => {
  const start = ipv4Number(base)!;
  const size = 2 ** (32 - bits);
  return n >= start && n < start + size;
};

// IPv4 ranges that aren't the public internet: "this network", private
// networks, shared (carrier) address space, loopback, link-local (where the
// cloud metadata address is), protocol and documentation ranges, benchmark
// testing, multicast, and everything reserved above it up to broadcast.
const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4Blocked(address: string): boolean {
  const n = ipv4Number(address);
  if (n === null) return true;
  if (allowLocal() && inV4(n, "127.0.0.0", 8)) return false;
  return V4_BLOCKED.some(([base, bits]) => inV4(n, base, bits));
}

// An IPv6 address as its eight 16-bit groups, or null when it isn't one.
// (An IPv4 address written at its end, as in ::ffff:10.0.0.1, is two groups.)
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase();
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  const tail = text.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) {
    const n = ipv4Number(tail[2]);
    if (n === null) return null;
    text = `${tail[1]}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const read = (part: string) => (part ? part.split(":") : []);
  const head = read(halves[0]);
  const rest = halves.length === 2 ? read(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

// IPv6 is let through only from the global unicast range (2000::/3), less
// the parts of it that lead somewhere else: Teredo and 6to4 (which carry an
// IPv4 address inside) and documentation addresses. That leaves out
// loopback, unspecified, unique local (fc00::/7), link-local (fe80::/10),
// multicast and the rest. An IPv4 address written as IPv6 (::ffff:a.b.c.d)
// is judged as the IPv4 address it is.
function v6Blocked(address: string): boolean {
  const g = ipv6Groups(address);
  if (!g) return true;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return v4Blocked(`${g[6] >>> 8}.${g[6] & 0xff}.${g[7] >>> 8}.${g[7] & 0xff}`);
  }
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return !allowLocal();
  if ((g[0] & 0xe000) !== 0x2000) return true;
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo, 2001::/32
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation, 2001:db8::/32
  if (g[0] === 0x2002) return true; // 6to4, 2002::/16
  return false;
}

// Whether a numeric address is one we won't connect to.
export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return v4Blocked(address);
  if (version === 6) return v6Blocked(address);
  return true;
}

// What's wrong with a URL as somewhere to send things, in plain words, or
// null when it may be used. For checking an address when it's saved; every
// request checks again, as it connects.
export function checkPublicUrl(url: string): string | null {
  if (typeof url !== "string" || url.length > 2000) return "That address is too long.";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "That isn't a web address. It should start with https://";
  }
  const local = allowLocal();
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    return "The address must start with https://";
  }
  if (parsed.username || parsed.password) return "Leave the user name and password out of the address.";
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) return "That address has no site in it.";
  if (isIP(host)) {
    return isBlockedAddress(host) ? "That address is on a private network. Use one on the public internet." : null;
  }
  const isLocalhost = host === "localhost" || host.endsWith(".localhost");
  if (isLocalhost && !local) return "That address is on a private network. Use one on the public internet.";
  if (!isLocalhost && !host.includes(".")) return "That address has no full site name in it, like example.com.";
  return null;
}

// The socket's lookup: the name looked up as usual, and every address it
// stands for checked before any is used. If any one is private the request
// fails, rather than trusting whichever address gets picked.
const checkedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...(options as LookupOptions), all: true }, (error, addresses: LookupAddress[]) => {
    if (error) return callback(error, "", 0);
    if (!addresses.length) {
      return callback(Object.assign(new Error(`No address found for ${hostname}`), { code: "ENOTFOUND" }), "", 0);
    }
    const blocked = addresses.find((entry) => isBlockedAddress(entry.address));
    if (blocked) {
      return callback(
        Object.assign(new Error(`${hostname} is on a private network.`), { code: "EBLOCKED" }),
        "",
        0,
      );
    }
    if ((options as LookupOptions).all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

const seconds = (ms: number) => {
  const n = Math.max(1, Math.round(ms / 1000));
  return `${n} ${n === 1 ? "second" : "seconds"}`;
};

export function safeRequest(url: string, opts: SafeRequestOptions = {}): Promise<SafeResponse> {
  const { method = "GET", headers = {}, body, timeoutMs = 10_000, maxBytes = 1024 * 1024, truncate = false } = opts;
  const wrong = checkPublicUrl(url);
  if (wrong) return Promise.reject(new SafeRequestError("blocked", wrong));
  const target = new URL(url);
  const send = target.protocol === "https:" ? httpsRequest : httpRequest;
  const payload = body === undefined ? undefined : typeof body === "string" ? Buffer.from(body) : body;

  return new Promise<SafeResponse>((resolve, reject) => {
    let settled = false;
    // The whole request, start to finish, not just a quiet spell. (By the
    // time it fires, `request` below is there to stop.)
    const timer = setTimeout(
      () => fail(new SafeRequestError("timeout", `No answer within ${seconds(timeoutMs)}.`)),
      timeoutMs,
    );
    const fail = (error: SafeRequestError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.destroy();
      reject(error);
    };

    const options = {
      method,
      headers: { ...headers, ...(payload ? { "Content-Length": String(payload.length) } : {}) },
      lookup: checkedLookup,
      // A fresh connection each time: none kept open and handed to the next
      // request, and no proxy from the environment standing in the middle.
      agent: false as const,
    };
    const onResponse = (response: IncomingMessage) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          if (truncate && !settled) {
            settled = true;
            clearTimeout(timer);
            resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) });
            request.destroy();
            return;
          }
          fail(new SafeRequestError("too_large", `The answer was more than ${maxBytes} bytes.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) });
      });
      response.on("error", (error) => fail(new SafeRequestError("network", error.message)));
      response.on("close", () => {
        if (!response.complete) fail(new SafeRequestError("network", "The connection closed early."));
      });
    };

    // Node turns some mistakes away at once (a header it won't send): then
    // there's nothing to wait for.
    let request: ClientRequest;
    try {
      request = send(target, options, onResponse);
    } catch (error) {
      settled = true;
      clearTimeout(timer);
      reject(new SafeRequestError("network", error instanceof Error ? error.message : "The request couldn't be made."));
      return;
    }

    request.on("error", (error: Error & { code?: string }) => {
      // (A refusal from our lookup says so by its code.)
      if (error.code === "EBLOCKED") return fail(new SafeRequestError("blocked", error.message));
      fail(new SafeRequestError("network", error.message || "The connection failed."));
    });

    if (payload) request.write(payload);
    request.end();
  });
}
