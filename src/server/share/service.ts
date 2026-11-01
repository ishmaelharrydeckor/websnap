import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { DesignDocument } from "@/lib/document/types";
import { createBlobStore, type BlobStore } from "./blobstore";
import type { ShareConfig } from "./config";

export interface ShareRecord {
  id: string;
  createdAt: number;
  expiresAt: number | null;
  bytes: number;
  /** Content type of each stored asset, by asset id. */
  assets: Record<string, string>;
}

export interface NewShare {
  doc: DesignDocument;
  preview: { bytes: Uint8Array; type: string };
  assets: { id: string; bytes: Uint8Array; type: string }[];
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Share records live in SQLite; the files live in a BlobStore. */
export class ShareService {
  private db: DatabaseSync;
  constructor(
    private cfg: ShareConfig,
    private store: BlobStore = createBlobStore(cfg),
    dbPath = path.join(cfg.dataDir, "shares.sqlite"),
    private now: () => number = Date.now,
  ) {
    if (dbPath !== ":memory:") mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      delete_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      bytes INTEGER NOT NULL,
      assets TEXT NOT NULL
    )`);
  }

  /** Stores a design and returns its id and the secret that allows deleting it later. */
  async create(share: NewShare): Promise<{ id: string; deleteToken: string }> {
    const id = randomBytes(9).toString("base64url"); // 72 bits, unguessable
    const deleteToken = randomBytes(24).toString("base64url");
    const createdAt = this.now();
    const expiresAt = this.cfg.expireDays > 0 ? createdAt + this.cfg.expireDays * 86400_000 : null;
    const enc = new TextEncoder();
    try {
      await this.store.put(`${id}/doc.json`, enc.encode(JSON.stringify(share.doc)), "application/json");
      await this.store.put(`${id}/preview`, share.preview.bytes, share.preview.type);
      for (const a of share.assets) await this.store.put(`${id}/a/${a.id}`, a.bytes, a.type);
    } catch (e) {
      await this.store.deletePrefix(`${id}/`).catch(() => {});
      throw e;
    }
    const bytes = share.preview.bytes.length + share.assets.reduce((n, a) => n + a.bytes.length, 0);
    const types = Object.fromEntries(share.assets.map((a) => [a.id, a.type]));
    this.db.prepare("INSERT INTO shares (id, delete_hash, created_at, expires_at, bytes, assets) VALUES (?, ?, ?, ?, ?, ?)").run(id, sha256(deleteToken), createdAt, expiresAt, bytes, JSON.stringify(types));
    return { id, deleteToken };
  }

  /** The record for a live share; undefined if it doesn't exist or has expired. */
  get(id: string): ShareRecord | undefined {
    const row = this.db.prepare("SELECT id, created_at, expires_at, bytes, assets FROM shares WHERE id = ?").get(id) as
      | { id: string; created_at: number; expires_at: number | null; bytes: number; assets: string }
      | undefined;
    if (!row) return undefined;
    if (row.expires_at !== null && row.expires_at <= this.now()) return undefined;
    return { id: row.id, createdAt: row.created_at, expiresAt: row.expires_at, bytes: row.bytes, assets: JSON.parse(row.assets) };
  }

  async readDoc(id: string): Promise<DesignDocument | undefined> {
    if (!this.get(id)) return undefined;
    const blob = await this.store.get(`${id}/doc.json`);
    return blob ? (JSON.parse(new TextDecoder().decode(blob.bytes)) as DesignDocument) : undefined;
  }

  async readPreview(id: string) {
    return this.get(id) ? this.store.get(`${id}/preview`) : undefined;
  }

  async readAsset(id: string, assetId: string) {
    const rec = this.get(id);
    if (!rec || !(assetId in rec.assets)) return undefined;
    return this.store.get(`${id}/a/${assetId}`);
  }

  /** Deletes a share if the token matches. Returns false when the id or token is wrong. */
  async remove(id: string, token: string): Promise<boolean> {
    const row = this.db.prepare("SELECT delete_hash FROM shares WHERE id = ?").get(id) as { delete_hash: string } | undefined;
    if (!row) return false;
    const a = Buffer.from(row.delete_hash);
    const b = Buffer.from(sha256(token));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    await this.store.deletePrefix(`${id}/`);
    this.db.prepare("DELETE FROM shares WHERE id = ?").run(id);
    return true;
  }

  /** Removes expired shares and their files. Returns how many were removed. */
  async purgeExpired(): Promise<number> {
    const rows = this.db.prepare("SELECT id FROM shares WHERE expires_at IS NOT NULL AND expires_at <= ?").all(this.now()) as { id: string }[];
    for (const { id } of rows) {
      await this.store.deletePrefix(`${id}/`);
      this.db.prepare("DELETE FROM shares WHERE id = ?").run(id);
    }
    return rows.length;
  }

  close() {
    this.db.close();
  }
}
