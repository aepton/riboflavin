const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

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
  const key = args.key;
  if (!key) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: { error: "Missing required parameter: key" },
    };
  }

  try {
    const res = await getClient().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key })
    );
    const text = await res.Body.transformToString();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.parse(text),
    };
  } catch (e) {
    if (e.name === "NoSuchKey") {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: { error: "Not found" },
      };
    }
    console.error("Spaces read error:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Failed to read from Spaces" },
    };
  }
}

exports.main = main;
