/** Everything the share server reads from the environment. Sharing is off unless SHARE_ENABLED is set. */
export interface ShareConfig {
  enabled: boolean;
  storage: "fs" | "s3";
  dataDir: string;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
  /** When set, uploads must send `Authorization: Bearer <token>`. */
  uploadToken?: string;
  /** Uploads allowed per IP per hour. */
  uploadsPerHour: number;
  /** Days until a link expires; 0 = never. */
  expireDays: number;
  s3: { bucket: string; region: string; endpoint?: string; accessKeyId?: string; secretAccessKey?: string; forcePathStyle: boolean; prefix: string };
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function readConfig(env: Record<string, string | undefined> = process.env): ShareConfig {
  return {
    enabled: env.SHARE_ENABLED === "1" || env.SHARE_ENABLED === "true",
    storage: env.SHARE_STORAGE === "s3" ? "s3" : "fs",
    dataDir: env.SHARE_DATA_DIR || "./share-data",
    maxFileBytes: num(env.SHARE_MAX_FILE_MB, 50) * 1024 * 1024,
    maxTotalBytes: num(env.SHARE_MAX_TOTAL_MB, 100) * 1024 * 1024,
    maxFiles: num(env.SHARE_MAX_FILES, 40),
    uploadToken: env.SHARE_UPLOAD_TOKEN || undefined,
    uploadsPerHour: num(env.SHARE_UPLOADS_PER_HOUR, 20),
    expireDays: num(env.SHARE_EXPIRE_DAYS, 0),
    s3: {
      bucket: env.S3_BUCKET ?? "",
      region: env.S3_REGION || "us-east-1",
      endpoint: env.S3_ENDPOINT || undefined,
      accessKeyId: env.S3_ACCESS_KEY_ID || undefined,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY || undefined,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === "1" || env.S3_FORCE_PATH_STYLE === "true",
      prefix: env.S3_PREFIX ?? "shares/",
    },
  };
}
