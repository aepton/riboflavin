/**
 * Thin wrapper around @aws-sdk/client-s3 configured for DigitalOcean Spaces.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

const BUCKET = "riboflavin";
const REGION = "sfo3";
const ENDPOINT = `https://${REGION}.digitaloceanspaces.com`;

let client: S3Client | null = null;

export function initSpaces(accessKey: string, secretKey: string) {
  client = new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: false,
  });
}

function getClient(): S3Client {
  if (!client) throw new Error("Spaces client not initialised — call initSpaces first");
  return client;
}

// ── Read / write helpers ────────────────────────────────────────────────────

export async function putJSON(key: string, body: unknown): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: JSON.stringify(body, null, 2),
      ContentType: "application/json",
      ACL: "private",
    }),
  );
}

export async function getJSON<T = unknown>(key: string): Promise<T | null> {
  try {
    const res = await getClient().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    );
    const text = await res.Body?.transformToString();
    return text ? (JSON.parse(text) as T) : null;
  } catch (e: unknown) {
    if (e && typeof e === "object" && "name" in e && (e as { name: string }).name === "NoSuchKey") {
      return null;
    }
    throw e;
  }
}
