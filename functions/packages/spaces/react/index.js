const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");

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
  const { slug, markId, emoji } = args;
  if (!slug || !markId || !emoji) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Missing required parameters: slug, markId, emoji" },
    };
  }

  const client = getClient();
  const key = `rounds/${slug}`;

  try {
    const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const text = await res.Body.transformToString();
    const round = JSON.parse(text);

    let mark = null;
    for (const claim of round.claims || []) {
      const found = (claim.marks || []).find((m) => m.id === markId);
      if (found) { mark = found; break; }
    }
    if (!mark) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: { error: "Mark not found" },
      };
    }

    mark.counter.reactions = mark.counter.reactions || {};
    mark.counter.reactions[emoji] = (mark.counter.reactions[emoji] || 0) + 1;

    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: JSON.stringify(round, null, 2),
        ContentType: "application/json",
        ACL: "private",
      })
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: { reactions: mark.counter.reactions },
    };
  } catch (e) {
    if (e.name === "NoSuchKey") {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: { error: "Round not found" },
      };
    }
    console.error("Spaces react error:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Failed to record reaction" },
    };
  }
}

exports.main = main;
