import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultDocument } from "@/lib/document/defaults";
import { FsBlobStore, S3BlobStore, type BlobStore } from "./blobstore";
import { readConfig } from "./config";
import { RateLimiter } from "./ratelimit";
import { ShareService } from "./service";
import { validateUpload } from "./validate";

const cfg = { ...readConfig({ SHARE_ENABLED: "1" }), maxFileBytes: 1000, maxTotalBytes: 1500, maxFiles: 4 };
const docWith = (...ids: string[]) => {
  const d = createDefaultDocument();
  d.media = ids.map((id) => ({ id, kind: "image" as const, assetId: id, width: 10, height: 10 }));
  return JSON.stringify(d);
};
const png = { name: "preview", type: "image/png", size: 100 };

describe("validateUpload", () => {
  it("accepts a design with the files it uses", () => {
    const r = validateUpload(docWith("img-one"), png, [{ name: "img-one", type: "image/png", size: 200 }], cfg);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.assetIds).toEqual(["img-one"]);
  });
  it("rejects bad JSON, wrong version and non-objects", () => {
    expect(validateUpload("{nope", png, [], cfg)).toMatchObject({ ok: false, status: 400 });
    expect(validateUpload('{"version":2}', png, [], cfg)).toMatchObject({ ok: false, status: 400 });
    expect(validateUpload("5", png, [], cfg)).toMatchObject({ ok: false, status: 400 });
  });
  it("needs a raster preview", () => {
    expect(validateUpload(docWith(), undefined, [], cfg)).toMatchObject({ ok: false, status: 400 });
    expect(validateUpload(docWith(), { ...png, type: "text/html" }, [], cfg)).toMatchObject({ ok: false, status: 415 });
  });
  it("rejects files the design doesn't use, duplicates, odd names and unknown types", () => {
    const f = (name: string, type = "image/png", size = 10) => ({ name, type, size });
    expect(validateUpload(docWith("aaaa"), png, [f("zzzz")], cfg)).toMatchObject({ ok: false, status: 400 });
    expect(validateUpload(docWith("aaaa"), png, [f("aaaa"), f("aaaa")], cfg)).toMatchObject({ ok: false, status: 400 });
    expect(validateUpload(docWith("../etc"), png, [f("../etc")], cfg)).toMatchObject({ ok: false, status: 400 });
    expect(validateUpload(docWith("aaaa"), png, [f("aaaa", "text/html")], cfg)).toMatchObject({ ok: false, status: 415 });
  });
  it("enforces per-file, total and count limits", () => {
    const f = (name: string, size: number) => ({ name, type: "image/png", size });
    expect(validateUpload(docWith("aaaa"), png, [f("aaaa", 2000)], cfg)).toMatchObject({ ok: false, status: 413 });
    expect(validateUpload(docWith("aaaa", "bbbb"), png, [f("aaaa", 900), f("bbbb", 900)], cfg)).toMatchObject({ ok: false, status: 413 });
    expect(validateUpload(docWith("aaaa", "bbbb", "cccc", "dddd"), png, ["aaaa", "bbbb", "cccc", "dddd"].map((n) => f(n, 1)), cfg)).toMatchObject({ ok: false, status: 413 });
  });
  it("cleans up the stored design (bad numbers are normalised)", () => {
    const r = validateUpload(JSON.stringify({ version: 1, canvas: { sizeId: "x", width: 0, height: 0 } }), png, [], cfg);
    expect(r.ok && r.doc.canvas.width).toBeGreaterThanOrEqual(16);
  });
});

describe("validateUpload with a project", () => {
  const slide = (id?: string) => JSON.parse(docWith(...(id ? [id] : [])));
  const project = (slides: unknown[], extra: object = {}) => JSON.stringify({ version: 1, slides, active: 1, continuous: true, ...extra });
  it("accepts several slides and counts files from every slide", () => {
    const r = validateUpload(project([slide("img-one"), slide("img-two")]), png, [{ name: "img-two", type: "image/png", size: 200 }], cfg);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project?.slides).toHaveLength(2);
      expect(r.project?.active).toBe(1);
      expect(r.project?.continuous).toBe(true);
      expect(r.doc).toBe(r.project?.slides[0]);
    }
  });
  it("rejects a file that no slide uses", () => {
    const r = validateUpload(project([slide(), slide()]), png, [{ name: "img-one", type: "image/png", size: 10 }], cfg);
    expect(r.ok).toBe(false);
  });
  it("rejects empty, too many and malformed slides, and clamps active", () => {
    expect(validateUpload(project([]), png, [], cfg).ok).toBe(false);
    expect(validateUpload(project(Array.from({ length: 31 }, () => slide())), png, [], cfg).ok).toBe(false);
    expect(validateUpload(project([slide(), { version: 2 }]), png, [], cfg).ok).toBe(false);
    const r = validateUpload(project([slide(), slide()], { active: 99 }), png, [], cfg);
    expect(r.ok && r.project?.active).toBe(1);
  });
});

describe("RateLimiter", () => {
  it("blocks past the limit and recovers after the window", () => {
    const rl = new RateLimiter(2, 1000);
    expect([rl.allow("a", 0), rl.allow("a", 1), rl.allow("a", 2)]).toEqual([true, true, false]);
    expect(rl.allow("b", 2)).toBe(true);
    expect(rl.allow("a", 1500)).toBe(true);
  });
  it("a limit of 0 means unlimited", () => {
    const rl = new RateLimiter(0, 1000);
    expect(Array.from({ length: 50 }, () => rl.allow("a", 0)).every(Boolean)).toBe(true);
  });
});

describe("FsBlobStore", () => {
  let dir: string;
  beforeEach(async () => void (dir = await mkdtemp(path.join(os.tmpdir(), "ws-share-"))));
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("round-trips bytes and type, and deletes by prefix", async () => {
    const s = new FsBlobStore(dir);
    await s.put("abc/a/one", new Uint8Array([1, 2, 3]), "image/png");
    expect(await s.get("abc/a/one")).toEqual({ bytes: new Uint8Array([1, 2, 3]), type: "image/png" });
    expect(await s.get("abc/a/missing")).toBeUndefined();
    await s.deletePrefix("abc/");
    expect(await s.get("abc/a/one")).toBeUndefined();
  });
  it("refuses keys that escape the folder", async () => {
    const s = new FsBlobStore(dir);
    await expect(s.put("../evil", new Uint8Array([1]), "x")).rejects.toThrow();
    await expect(s.get("../../etc/passwd")).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  });
});

describe("ShareService", () => {
  let dir: string;
  let now = 1_000_000;
  let svc: ShareService;
  const share = () => ({ doc: createDefaultDocument(), preview: { bytes: new Uint8Array([9, 9]), type: "image/png" }, assets: [{ id: "aaaa", bytes: new Uint8Array([1, 2, 3]), type: "image/png" }] });
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ws-share-"));
    now = 1_000_000;
    svc = new ShareService({ ...cfg, expireDays: 1 }, new FsBlobStore(dir), ":memory:", () => now);
  });
  afterEach(async () => {
    svc.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("creates a share that can be read back", async () => {
    const { id } = await svc.create(share());
    expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect((await svc.readDoc(id))?.version).toBe(1);
    expect((await svc.readPreview(id))?.type).toBe("image/png");
    expect((await svc.readAsset(id, "aaaa"))?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(await svc.readAsset(id, "nope")).toBeUndefined();
    expect(svc.get(id)?.bytes).toBe(5);
  });
  it("stores and returns a whole project", async () => {
    const slides = [createDefaultDocument(), createDefaultDocument()];
    const { id } = await svc.create({ ...share(), project: { version: 1, slides, active: 1, continuous: false } });
    const read = await svc.readDoc(id);
    expect(read && "slides" in read ? read.slides : []).toHaveLength(2);
  });
  it("gives every share a different unguessable id", async () => {
    const ids = new Set((await Promise.all([1, 2, 3, 4, 5].map(() => svc.create(share())))).map((r) => r.id));
    expect(ids.size).toBe(5);
  });
  it("deletes only with the right token", async () => {
    const { id, deleteToken } = await svc.create(share());
    expect(await svc.remove(id, "wrong")).toBe(false);
    expect(await svc.remove("missing", deleteToken)).toBe(false);
    expect(svc.get(id)).toBeDefined();
    expect(await svc.remove(id, deleteToken)).toBe(true);
    expect(svc.get(id)).toBeUndefined();
    expect(await svc.readPreview(id)).toBeUndefined();
  });
  it("expires and purges old shares", async () => {
    const { id } = await svc.create(share());
    now += 2 * 86400_000;
    expect(svc.get(id)).toBeUndefined();
    expect(await svc.readDoc(id)).toBeUndefined();
    expect(await svc.purgeExpired()).toBe(1);
    expect(await svc.purgeExpired()).toBe(0);
  });
  it("leaves nothing behind when storing fails midway", async () => {
    const puts: string[] = [];
    const deleted: string[] = [];
    const flaky: BlobStore = {
      async put(key) {
        puts.push(key);
        if (puts.length === 3) throw new Error("disk full");
      },
      get: async () => undefined,
      async deletePrefix(p) {
        deleted.push(p);
      },
    };
    const s = new ShareService(cfg, flaky, ":memory:");
    await expect(s.create(share())).rejects.toThrow("disk full");
    expect(deleted).toHaveLength(1);
    s.close();
  });
});

describe("S3BlobStore", () => {
  it("needs a bucket", () => {
    expect(() => new S3BlobStore(readConfig({}).s3)).toThrow(/S3_BUCKET/);
  });
  it("sends the expected requests through the SDK", async () => {
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    vi.doMock("@aws-sdk/client-s3", () => {
      const cmd = (name: string) =>
        class {
          input: Record<string, unknown>;
          constructor(input: Record<string, unknown>) {
            this.input = input;
            (this as unknown as { name: string }).name = name;
          }
        };
      return {
        S3Client: class {
          async send(c: { constructor: { name: string }; input: Record<string, unknown> }) {
            sent.push({ name: c.constructor.name, input: c.input });
            if (c.constructor.name === "GetObjectCommand") return { Body: { transformToByteArray: async () => new Uint8Array([7]) }, ContentType: "image/png" };
            if (c.constructor.name === "ListObjectsV2Command") return { Contents: [{ Key: "shares/abc/doc.json" }], IsTruncated: false };
            return {};
          }
        },
        PutObjectCommand: class PutObjectCommand extends cmd("Put") {},
        GetObjectCommand: class GetObjectCommand extends cmd("Get") {},
        ListObjectsV2Command: class ListObjectsV2Command extends cmd("List") {},
        DeleteObjectsCommand: class DeleteObjectsCommand extends cmd("Delete") {},
      };
    });
    const store = new S3BlobStore({ ...readConfig({}).s3, bucket: "b" });
    await store.put("abc/preview", new Uint8Array([1]), "image/png");
    expect(await store.get("abc/preview")).toEqual({ bytes: new Uint8Array([7]), type: "image/png" });
    await store.deletePrefix("abc/");
    expect(sent.map((s) => s.name)).toEqual(["PutObjectCommand", "GetObjectCommand", "ListObjectsV2Command", "DeleteObjectsCommand"]);
    expect(sent[0].input).toMatchObject({ Bucket: "b", Key: "shares/abc/preview", ContentType: "image/png" });
    expect(sent[3].input).toMatchObject({ Delete: { Objects: [{ Key: "shares/abc/doc.json" }] } });
    vi.doUnmock("@aws-sdk/client-s3");
  });
});
