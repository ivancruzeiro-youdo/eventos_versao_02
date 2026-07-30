import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const REGION = process.env.AWS_REGION || 'sa-east-1';

// requestChecksumCalculation: 'WHEN_REQUIRED' — newer SDK versions default to always
// computing a request checksum, which for a *presigned* PutObject URL bakes in a
// checksum for an empty body (the real file isn't available yet at presign time) into
// the signed query string. The browser's later PUT of the actual file then fails a
// checksum mismatch once CORS lets the request through. Presigned uploads never need
// this by default, so it's disabled at the client level.
export const s3Client = new S3Client({ region: REGION, requestChecksumCalculation: 'WHEN_REQUIRED' });

export function getS3Bucket(): string {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET não configurado no ambiente.');
  }
  return bucket;
}

export async function uploadBufferToS3(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3Client.send(new PutObjectCommand({
    Bucket: getS3Bucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

export async function createUploadPresignedUrl(key: string, contentType: string, expiresInSeconds = 300): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getS3Bucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

export async function createDownloadPresignedUrl(key: string, filename: string, expiresInSeconds = 300): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getS3Bucket(),
    Key: key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
  });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

export async function deleteS3Object(key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({
    Bucket: getS3Bucket(),
    Key: key,
  }));
}
