import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * Private object storage (Backblaze B2 / MinIO / any S3). Objects are NEVER exposed by URL;
 * they are streamed to logged-in users through authenticated routes only.
 */
const globalForS3 = globalThis as unknown as { s3?: S3Client };

function client() {
  if (!globalForS3.s3) {
    const e = process.env;
    if (!e.S3_ENDPOINT || !e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) {
      throw new Error("S3 storage is not configured (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)");
    }
    globalForS3.s3 = new S3Client({
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION ?? "us-east-1",
      forcePathStyle: e.S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
    });
  }
  return globalForS3.s3;
}

const bucket = () => process.env.S3_BUCKET!;

export const paperFileKey = (paperId: string) => `papers/${paperId}.pdf`;

export async function putPdf(key: string, bytes: Uint8Array) {
  await client().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: bytes, ContentType: "application/pdf" }),
  );
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return res.Body!.transformToByteArray();
}

export async function getObjectStream(key: string) {
  const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return { body: res.Body!.transformToWebStream(), length: res.ContentLength };
}

export async function deleteObject(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
