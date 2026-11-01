import type dns from "node:dns";
import { describe, expect, it } from "vitest";
import { checkUrl, isPublicIp, safeLookup } from "./ssrf";

const rules = { allowedPorts: [80, 443], allowPrivate: false };

describe("isPublicIp", () => {
  it("allows ordinary public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "11.0.0.1", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e"]) expect(isPublicIp(ip), ip).toBe(true);
  });
  it("blocks private, loopback, link-local, metadata and reserved IPv4", () => {
    for (const ip of ["127.0.0.1", "127.255.255.254", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1", "192.0.2.5"]) expect(isPublicIp(ip), ip).toBe(false);
  });
  it("blocks IPv6 loopback, unique-local, link-local and multicast", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "ff02::1", "2001:db8::1"]) expect(isPublicIp(ip), ip).toBe(false);
  });
  it("sees through IPv4 hidden in IPv6", () => {
    expect(isPublicIp("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicIp("::ffff:7f00:1")).toBe(false);
    expect(isPublicIp("::ffff:10.0.0.1")).toBe(false);
    expect(isPublicIp("::ffff:169.254.169.254")).toBe(false);
    expect(isPublicIp("64:ff9b::7f00:1")).toBe(false);
    expect(isPublicIp("2002:7f00:1::")).toBe(false);
    expect(isPublicIp("::ffff:8.8.8.8")).toBe(true);
  });
  it("treats anything unparsable as not public", () => {
    for (const ip of ["", "abc", "999.1.1.1", "1.2.3", "1.2.3.4.5", "::g", "1::2::3"]) expect(isPublicIp(ip), ip).toBe(false);
  });
});

describe("checkUrl", () => {
  it("accepts normal http and https addresses", () => {
    expect(checkUrl("https://example.com/path?q=1", rules).ok).toBe(true);
    expect(checkUrl("http://example.com", rules).ok).toBe(true);
  });
  it("rejects other schemes, credentials and odd ports", () => {
    for (const u of ["file:///etc/passwd", "ftp://example.com", "javascript:alert(1)", "data:text/html,hi", "gopher://x", "https://user:pw@example.com", "https://example.com:22", "http://example.com:6379"]) expect(checkUrl(u, rules).ok, u).toBe(false);
  });
  it("rejects local names and numeric forms of private addresses", () => {
    for (const u of ["http://localhost", "http://LOCALHOST/", "http://foo.localhost", "http://printer.local", "http://db.internal", "http://127.0.0.1", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://2130706433/", "http://0x7f.1/", "http://0177.0.0.1/", "http://169.254.169.254/latest/meta-data", "http://10.0.0.1", "http://192.168.0.1"]) expect(checkUrl(u, rules).ok, u).toBe(false);
  });
  it("rejects garbage", () => {
    expect(checkUrl("not a url", rules).ok).toBe(false);
    expect(checkUrl("", rules).ok).toBe(false);
  });
  it("allowPrivate (dev only) lets local addresses and ports through", () => {
    expect(checkUrl("http://127.0.0.1:3000", { allowedPorts: [3000], allowPrivate: true }).ok).toBe(true);
  });
});

describe("safeLookup", () => {
  const fake = (answers: { address: string; family: number }[], err?: Error) =>
    ((_host: string, _o: unknown, cb: (e: Error | null, a: unknown) => void) => cb(err ?? null, answers)) as unknown as typeof dns.lookup;
  const run = (lookup: ReturnType<typeof safeLookup>) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown }>((resolve) => lookup("x.test", {}, (err, address) => resolve({ err, address })));

  it("returns a public address", async () => {
    const r = await run(safeLookup({ allowPrivate: false }, fake([{ address: "8.8.8.8", family: 4 }])));
    expect(r.err).toBeNull();
    expect(r.address).toBe("8.8.8.8");
  });
  it("blocks a name that resolves to a private address, even alongside a public one (rebinding mix)", async () => {
    const r = await run(safeLookup({ allowPrivate: false }, fake([{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }])));
    expect(r.err?.code).toBe("EBLOCKED");
  });
  it("blocks metadata and IPv6 loopback answers", async () => {
    expect((await run(safeLookup({ allowPrivate: false }, fake([{ address: "169.254.169.254", family: 4 }])))).err?.code).toBe("EBLOCKED");
    expect((await run(safeLookup({ allowPrivate: false }, fake([{ address: "::1", family: 6 }])))).err?.code).toBe("EBLOCKED");
  });
  it("passes DNS errors and empty answers on", async () => {
    expect((await run(safeLookup({ allowPrivate: false }, fake([], Object.assign(new Error("nx"), { code: "ENOTFOUND" }))))).err?.code).toBe("ENOTFOUND");
    expect((await run(safeLookup({ allowPrivate: false }, fake([])))).err?.code).toBe("ENOTFOUND");
  });
  it("allowPrivate lets local answers through (dev only)", async () => {
    expect((await run(safeLookup({ allowPrivate: true }, fake([{ address: "127.0.0.1", family: 4 }])))).err).toBeNull();
  });
});
