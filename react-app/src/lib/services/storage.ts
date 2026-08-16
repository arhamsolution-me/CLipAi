import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

const USE_S3 = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET);

const s3 = USE_S3
  ? new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
  : null;

const BUCKET = process.env.AWS_S3_BUCKET || '';
const LOCAL_CLIPS_DIR = path.join(process.cwd(), 'public', 'clips');

// ─── Upload a final clip file ────────────────────────────────────────────────
export async function uploadClip(userId: string, projectId: string, clipId: string, filePath: string): Promise<string> {
  if (USE_S3 && s3) {
    const filename = path.basename(filePath);
    const key = `users/${userId}/projects/${projectId}/clips/${clipId}/${filename}`;
    const fileBuffer = fs.readFileSync(filePath);

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: 'video/mp4',
    }));

    return `https://${BUCKET}.s3.amazonaws.com/${key}`;
  }

  // Local fallback: file is already in public/clips, return public URL
  const filename = path.basename(filePath);
  return `/clips/${filename}`;
}

// ─── Generate a pre-signed download URL ─────────────────────────────────────
export async function getDownloadUrl(storageUrl: string): Promise<string> {
  if (USE_S3 && s3 && storageUrl.startsWith('https://')) {
    const key = storageUrl.split('.com/')[1];
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return await getSignedUrl(s3, command, { expiresIn: 3600 });
  }
  // Local fallback: direct public URL
  return storageUrl;
}

// ─── Delete a clip from storage ──────────────────────────────────────────────
export async function deleteClip(storageUrl: string): Promise<void> {
  if (USE_S3 && s3 && storageUrl.startsWith('https://')) {
    const key = storageUrl.split('.com/')[1];
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    return;
  }
  // Local fallback
  const localPath = path.join(process.cwd(), 'public', storageUrl.replace(/^\//, ''));
  if (fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
  }
}

export const storageMode = USE_S3 ? 'S3' : 'local';
