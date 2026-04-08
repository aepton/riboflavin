const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const BUCKET = "riboflavin";
const REGION = "sfo3";
const ENDPOINT = `https://${REGION}.digitaloceanspaces.com`;

function getClient() {
  return new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    credentials: {
      accessKeyId: process.env.SPACES_ACCESS_KEY,
      secretAccessKey: process.env.SPACES_SECRET_KEY,
    },
    forcePathStyle: false,
  });
}

async function main(args) {
  const { key, body } = args;
  if (!key || body === undefined) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Missing required parameters: key, body" },
    };
  }

  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: JSON.stringify(body, null, 2),
        ContentType: "application/json",
        ACL: "private",
      })
    );
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: { ok: true },
    };
  } catch (e) {
    console.error("Spaces write error:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Failed to write to Spaces" },
    };
  }
}

exports.main = main;
