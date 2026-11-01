import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BlockedError, redirectTarget, safeRequest, safeRequestFollowing } from "./fetcher";

let server: http.Server;
let base: string;
const seen: { method: string; url: string; body: string }[] = [];
const limits = { maxBytes: 1000, timeoutMs: 1500 };
const dev = { allowedPorts: [0], allowPrivate: true };

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    seen.push({ method: req.method ?? "", url: req.url ?? "", body });
    const u = req.url ?? "";
    if (u === "/a") return void res.writeHead(302, { location: "/b" }).end();
    if (u === "/b") return void res.writeHead(200, { "content-type": "text/plain", "set-cookie": ["a=1", "b=2"] }).end("hello");
    if (u === "/loop") return void res.writeHead(302, { location: "/loop" }).end();
    if (u === "/post-redirect") return void res.writeHead(307, { location: "/echo" }).end();
    if (u === "/post-redirect-302") return void res.writeHead(302, { location: "/echo" }).end();
    if (u === "/echo") return void res.writeHead(200).end(body || "no-body");
    if (u === "/big") return void res.writeHead(200).end("x".repeat(5000));
    if (u === "/slow") return;
    if (u === "/gz") return void res.writeHead(200, { "content-encoding": "gzip", "x-seen-accept-encoding": String(req.headers["accept-encoding"]) }).end("plain");
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
  dev.allowedPorts = [port];
});
afterAll(() => server.close());

const get = { method: "GET", headers: {} as Record<string, string> };

describe("safeRequest", () => {
  it("fetches and returns status, headers and body", async () => {
    const r = await safeRequest(`${base}/b`, get, dev, limits);
    expect(r.status).toBe(200);
    expect(r.body.toString()).toBe("hello");
    expect(r.headers["content-type"]).toBe("text/plain");
    expect(r.headers["set-cookie"]).toBe("a=1\nb=2");
  });
  it("refuses private addresses by default", async () => {
    await expect(safeRequest(`${base}/b`, get, { allowedPorts: dev.allowedPorts, allowPrivate: false }, limits)).rejects.toBeInstanceOf(BlockedError);
  });
  it("refuses a disallowed port without connecting", async () => {
    const before = seen.length;
    await expect(safeRequest(`${base}/b`, get, { ...dev, allowedPorts: [1] }, limits)).rejects.toBeInstanceOf(BlockedError);
    expect(seen.length).toBe(before);
  });
  it("stops reading past the size limit", async () => {
    await expect(safeRequest(`${base}/big`, get, dev, limits)).rejects.toThrow(/more data/);
  });
  it("gives up on a server that never answers", async () => {
    await expect(safeRequest(`${base}/slow`, get, dev, { ...limits, timeoutMs: 300 })).rejects.toThrow();
  });
  it("asks for plain (uncompressed) bodies and drops hop-by-hop headers", async () => {
    const r = await safeRequest(`${base}/gz`, { method: "GET", headers: { "accept-encoding": "gzip, br", connection: "keep-alive", host: "evil" } }, dev, limits);
    expect(r.headers["x-seen-accept-encoding"]).toBe("identity");
    expect(r.headers["content-encoding"]).toBeUndefined();
  });
  it("does not follow redirects itself, but can say where one goes", async () => {
    const r = await safeRequest(`${base}/a`, get, dev, limits);
    expect(r.status).toBe(302);
    expect(redirectTarget(r, `${base}/a`)).toBe(`${base}/b`);
    expect(redirectTarget({ status: 200, headers: {}, body: Buffer.alloc(0) }, base)).toBeUndefined();
  });
});

describe("safeRequestFollowing", () => {
  it("follows redirects", async () => {
    expect((await safeRequestFollowing(`${base}/a`, get, dev, limits)).body.toString()).toBe("hello");
  });
  it("stops after too many redirects", async () => {
    await expect(safeRequestFollowing(`${base}/loop`, get, dev, limits, 3)).rejects.toThrow(/Too many redirects/);
  });
  it("keeps method and body on 307 but turns 302 into a GET", async () => {
    const post = { method: "POST", headers: {}, body: Buffer.from("payload") };
    expect((await safeRequestFollowing(`${base}/post-redirect`, post, dev, limits)).body.toString()).toBe("payload");
    expect((await safeRequestFollowing(`${base}/post-redirect-302`, post, dev, limits)).body.toString()).toBe("no-body");
  });
  it("checks every hop: a redirect to a blocked port is refused", async () => {
    // Allowed port list contains the server's port only, so redirecting elsewhere must fail.
    const other = http.createServer((_q, res) => res.writeHead(302, { location: "http://127.0.0.1:1/x" }).end());
    await new Promise<void>((r) => other.listen(0, "127.0.0.1", r));
    const p = (other.address() as AddressInfo).port;
    await expect(safeRequestFollowing(`http://127.0.0.1:${p}/`, get, { ...dev, allowedPorts: [p] }, limits)).rejects.toBeInstanceOf(BlockedError);
    other.close();
  });
});
