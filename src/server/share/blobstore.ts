import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ShareConfig } from "./config";

export interface StoredBlob {
  bytes: Uint8Array;
  type: string;
}

/** Where shared files live. The share service only ever uses these three calls. */
export interface BlobStore {
  put(key: string, bytes: Uint8Array, type: string): Promise<void>;
  get(key: string): Promise<StoredBlob | undefined>;
  /** Removes everything stored under a prefix such as `abc123/`. */
  deletePrefix(prefix: string): Promise<void>;
}

/** Plain files on disk. A sidecar `.type` file keeps each blob's content type. */
export class FsBlobStore implements BlobStore {
  private root: string;
  constructor(root: string) {
    this.root = path.resolve(root);
  }
  private resolve(key: string): string {
    const p = path.resolve(this.root, key);
    if (p !== this.root && !p.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, bytes: Uint8Array, type: string) {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, bytes);
    await writeFile(p + ".type", type);
  }
  async get(key: string) {
    const p = this.resolve(key);
    try {
      const [bytes, type] = await Promise.all([readFile(p), readFile(p + ".type", "utf8")]);
      return { bytes: new Uint8Array(bytes), type };
    } catch {
      return undefined;
    }
  }
  async deletePrefix(prefix: string) {
    await rm(this.resolve(prefix), { recursive: true, force: true });
  }
}

/** Any S3-compatible service (AWS, MinIO, R2, Backblaze...). The SDK is loaded only when this is used. */
export class S3BlobStore implements BlobStore {
  private clientPromise?: Promise<{ client: import("@aws-sdk/client-s3").S3Client; sdk: typeof import("@aws-sdk/client-s3") }>;
  constructor(private cfg: ShareConfig["s3"]) {
    if (!cfg.bucket) throw new Error("S3_BUCKET is required when SHARE_STORAGE=s3");
  }
  private client() {
    this.clientPromise ??= import("@aws-sdk/client-s3").then((sdk) => ({
      sdk,
      client: new sdk.S3Client({
        region: this.cfg.region,
        endpoint: this.cfg.endpoint,
        forcePathStyle: this.cfg.forcePathStyle,
        credentials: this.cfg.accessKeyId && this.cfg.secretAccessKey ? { accessKeyId: this.cfg.accessKeyId, secretAccessKey: this.cfg.secretAccessKey } : undefined,
      }),
    }));
    return this.clientPromise;
  }
  private key(k: string) {
    return this.cfg.prefix + k;
  }
  async put(key: string, bytes: Uint8Array, type: string) {
    const { client, sdk } = await this.client();
    await client.send(new sdk.PutObjectCommand({ Bucket: this.cfg.bucket, Key: this.key(key), Body: bytes, ContentType: type }));
  }
  async get(key: string) {
    const { client, sdk } = await this.client();
    try {
      const res = await client.send(new sdk.GetObjectCommand({ Bucket: this.cfg.bucket, Key: this.key(key) }));
      if (!res.Body) return undefined;
      return { bytes: await res.Body.transformToByteArray(), type: res.ContentType ?? "application/octet-stream" };
    } catch (e) {
      if ((e as { name?: string }).name === "NoSuchKey") return undefined;
      throw e;
    }
  }
  async deletePrefix(prefix: string) {
    const { client, sdk } = await this.client();
    let token: string | undefined;
    do {
      const list = await client.send(new sdk.ListObjectsV2Command({ Bucket: this.cfg.bucket, Prefix: this.key(prefix), ContinuationToken: token }));
      const keys = (list.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (keys.length) await client.send(new sdk.DeleteObjectsCommand({ Bucket: this.cfg.bucket, Delete: { Objects: keys } }));
      token = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (token);
  }
}

export function createBlobStore(cfg: ShareConfig): BlobStore {
  return cfg.storage === "s3" ? new S3BlobStore(cfg.s3) : new FsBlobStore(path.join(cfg.dataDir, "files"));
}
