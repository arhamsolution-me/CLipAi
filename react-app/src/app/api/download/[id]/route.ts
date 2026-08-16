import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { downloadClipSegment, cutAndFormatClip, cutAndFormatClipWithCaptions, extractAudioForTranscription } from '@/lib/services/video';
import { transcribeAudioToSrt } from '@/lib/services/ai';
import { uploadClip } from '@/lib/services/storage';
import fs from 'fs';
import path from 'path';

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const resolvedParams = await props.params;
        const clipIdRaw = resolvedParams.id;

        // Support both numeric (legacy) and cuid IDs
        const clip = isNaN(Number(clipIdRaw))
            ? await prisma.clip.findUnique({ where: { id: clipIdRaw }, include: { project: true } })
            : await (prisma.clip as any).findFirst({ where: { id: parseInt(clipIdRaw, 10) }, include: { project: true } });

        if (!clip) {
            return new NextResponse('Clip not found', { status: 404 });
        }

        // Authorization: if user is logged in, verify ownership
        try {
            const { userId } = await auth();
            if (userId && (clip as any).userId && (clip as any).userId !== userId) {
                return new NextResponse('Forbidden', { status: 403 });
            }
        } catch {}

        // Parse options from URL query
        const { searchParams } = new URL(req.url);
        const hasCaptions = searchParams.get('captions') !== 'false' && (clip as any).hasCaptions !== false;
        const aspectRatio = searchParams.get('aspect') === '16:9' ? '16:9' : '9:16';

        const clipsFolder = path.join(process.cwd(), 'public', 'clips');
        if (!fs.existsSync(clipsFolder)) {
            fs.mkdirSync(clipsFolder, { recursive: true });
        }

        const aspectStr = aspectRatio.replace(':', 'x');
        const finalClipPath = path.join(clipsFolder, `final_${clip.id}_${aspectStr}_cap${hasCaptions}.mp4`);

        // If already processed with these exact settings, serve directly
        if (fs.existsSync(finalClipPath) && fs.statSync(finalClipPath).size > 0) {
            return NextResponse.json({ url: `/clips/${path.basename(finalClipPath)}` });
        }

        // 1. Download segment from YouTube
        const videoUrl = (clip as any).videoUrl || clip.project?.youtubeUrl;
        
        if (!videoUrl) {
             return new NextResponse('Original video URL not found', { status: 400 });
        }

        const rawVideoPath = await downloadClipSegment(
            videoUrl,
            clip.id.toString(),
            clip.startSeconds,
            clip.endSeconds,
            clipsFolder
        );

        // 2. Cut & Format (with optional captions)
        const startOffset = clip.startSeconds - Math.max(0, clip.startSeconds - 2.0);
        const duration = clip.endSeconds - clip.startSeconds;


        if (hasCaptions) {
            const audioPath = path.join(clipsFolder, `audio_${clip.id}.mp3`);
            const srtPath = path.join(clipsFolder, `captions_${clip.id}.srt`);
            
            // Extract audio and generate subtitles
            await extractAudioForTranscription(rawVideoPath, audioPath, startOffset, duration);
            const success = await transcribeAudioToSrt(audioPath, srtPath);

            if (success && fs.existsSync(srtPath)) {
                await cutAndFormatClipWithCaptions(
                    rawVideoPath,
                    startOffset,
                    duration,
                    finalClipPath,
                    srtPath,
                    {
                        fontColor: (clip as any).captionColor || '&H00FFFFFF',
                        fontSize: 24,
                        position: 'bottom',
                        aspectRatio: aspectRatio
                    }
                );
            } else {
                console.warn("Transcription failed. Falling back to no captions.");
                await cutAndFormatClip(rawVideoPath, startOffset, duration, finalClipPath, aspectRatio);
            }

            // Cleanup temp files
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            if (fs.existsSync(srtPath)) fs.unlinkSync(srtPath);
        } else {
            await cutAndFormatClip(rawVideoPath, startOffset, duration, finalClipPath, aspectRatio);
        }

        // 3. Upload to S3 (or leave local)
        const userId = (clip as any).userId || 'anon';
        const projectId = (clip as any).projectId || 'default';
        const storageUrl = await uploadClip(userId, projectId, clip.id.toString(), finalClipPath);

        // 4. Update DB
        await prisma.clip.update({
            where: { id: clip.id },
            data: { storageUrl, status: 'completed' } as any,
        });

        // 5. Serve the file (via URL)
        return NextResponse.json({ url: storageUrl });

    } catch (error: any) {
        console.error('Download Error:', error);
        return new NextResponse(error.message || 'Error processing download', { status: 500 });
    }
}
