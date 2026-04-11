/**
 * Sets CORS on the riboflavin Spaces bucket.
 *
 * Usage:
 *   node scripts/set-cors.mjs <ACCESS_KEY> <SECRET_KEY>
 */
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const [accessKey, secretKey] = process.argv.slice(2);
if (!accessKey || !secretKey) {
  console.error("Usage: node scripts/set-cors.mjs <ACCESS_KEY> <SECRET_KEY>");
  process.exit(1);
}

const client = new S3Client({
  region: "sfo3",
  endpoint: "https://sfo3.digitaloceanspaces.com",
  credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  forcePathStyle: false,
});

await client.send(
  new PutBucketCorsCommand({
    Bucket: "riboflavin",
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: ["*"],
          AllowedMethods: ["GET", "PUT", "HEAD", "DELETE"],
          AllowedHeaders: ["*"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);

console.log("CORS configured successfully on riboflavin bucket.");
