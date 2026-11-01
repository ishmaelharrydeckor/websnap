import dns from "node:dns";
import net from "node:net";

/** Parses an IPv4 address into a 32-bit number, or undefined. */
function v4(ip: string): number | undefined {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return undefined;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return undefined;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

const inRange = (n: number, base: string, bits: number) => {
  const b = v4(base)!;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((n & mask) >>> 0) === ((b & mask) >>> 0);
};

/** IPv4 ranges that are never reachable on the public internet or must not be fetched. */
const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, including cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved and broadcast
];

/** Expands an IPv6 address to eight 16-bit groups, or undefined if it isn't valid. */
function v6groups(ip: string): number[] | undefined {
  if (!net.isIPv6(ip)) return undefined;
  let s = ip.split("%")[0];
  // An embedded IPv4 tail (::ffff:1.2.3.4) becomes two hex groups.
  const tail = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) {
    const n = v4(tail[2]);
    if (n === undefined) return undefined;
    s = tail[1] + ((n >>> 16) & 0xffff).toString(16) + ":" + (n & 0xffff).toString(16);
  }
  const [head, rest] = s.split("::");
  const a = head ? head.split(":") : [];
  const b = rest !== undefined && rest !== "" ? rest.split(":") : [];
  const missing = 8 - a.length - b.length;
  if (rest === undefined ? a.length !== 8 : missing < 0) return undefined;
  const groups = rest === undefined ? a : [...a, ...Array(missing).fill("0"), ...b];
  const out = groups.map((g) => parseInt(g, 16));
  return out.length === 8 && out.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? out : undefined;
}

/** True when `ip` is a normal, publicly routable unicast address. Anything unparsable counts as not public. */
export function isPublicIp(ip: string): boolean {
  const n = v4(ip);
  if (n !== undefined) return !BLOCKED_V4.some(([base, bits]) => inRange(n, base, bits));
  const g = v6groups(ip);
  if (!g) return false;
  // IPv4 hidden inside IPv6: ::ffff:a.b.c.d (mapped), ::a.b.c.d (compatible), 64:ff9b::/96 (NAT64).
  const embedded = (hi: number, lo: number) => isPublicIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return embedded(g[6], g[7]);
  if (g.slice(0, 6).every((x) => x === 0)) return g[6] === 0 && g[7] <= 1 ? false : embedded(g[6], g[7]);
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return embedded(g[6], g[7]);
  if ((g[0] & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return false; // site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x2002) return embedded(g[1], g[2]); // 6to4 wraps an IPv4 address
  if (g[0] === 0x2001 && g[1] === 0) return false; // Teredo
  return (g[0] & 0xe000) === 0x2000; // only global unicast 2000::/3 is allowed
}

export interface UrlRules {
  allowedPorts: number[];
  /** For local development and tests only: lets private addresses through. */
  allowPrivate: boolean;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string };

const BLOCKED_NAMES = /(^|\.)(localhost|local|internal|localdomain|home|lan|intranet|corp)$/i;

/** Checks the parts of a URL we can judge without the network. */
export function checkUrl(input: string, rules: UrlRules): UrlCheck {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, error: "That doesn't look like a web address." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "Only http and https addresses can be captured." };
  if (url.username || url.password) return { ok: false, error: "Addresses with a username or password aren't allowed." };
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!rules.allowedPorts.includes(port)) return { ok: false, error: `Port ${port} isn't allowed.` };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!rules.allowPrivate) {
    if (BLOCKED_NAMES.test(host)) return { ok: false, error: "That address points to a private network." };
    if ((net.isIP(host) || v4(host) !== undefined) && !isPublicIp(host)) return { ok: false, error: "That address points to a private network." };
  }
  return { ok: true, url };
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void;

/**
 * A DNS lookup for sockets: resolves the name, then refuses unless every answer is public. Because the socket
 * connects to the address returned here, a name can't resolve to something else between the check and the use.
 */
export function safeLookup(rules: Pick<UrlRules, "allowPrivate">, resolve: typeof dns.lookup = dns.lookup) {
  return (hostname: string, options: dns.LookupOptions | LookupCb, callback?: LookupCb) => {
    const cb = (typeof options === "function" ? options : callback) as LookupCb;
    const opts = typeof options === "function" ? {} : options;
    resolve(hostname, { ...opts, all: true }, (err, addresses) => {
      if (err) return cb(err, "");
      const list = addresses as dns.LookupAddress[];
      if (list.length === 0) return cb(Object.assign(new Error("No address found"), { code: "ENOTFOUND" }), "");
      if (!rules.allowPrivate && list.some((a) => !isPublicIp(a.address))) {
        return cb(Object.assign(new Error("That address points to a private network."), { code: "EBLOCKED" }), "");
      }
      if (opts.all) return cb(null, list.map((a) => ({ address: a.address, family: a.family })));
      cb(null, list[0].address, list[0].family);
    });
  };
}
