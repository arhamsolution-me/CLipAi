import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { getVideoMetadata } from '@/lib/services/video';
import { fetchYoutubeTranscript, formatTranscriptForPrompt } from '@/lib/services/transcript';
import { analyzeTranscriptHighlights, generateAiClipMetadata } from '@/lib/services/ai';

export async function POST(req: Request) {
    try {
        // Auth — optional: allow unauthenticated for dev, enforce userId when present
        let userId: string | null = null;
        try {
            const session = await auth();
            userId = session.userId;
        } catch {}

        const body = await req.json();
        const { url, num_clips = 6 } = body;

        if (!url) {
            return NextResponse.json({ error: 'URL parameter is required.' }, { status: 400 });
        }

        const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;

        if (!videoId) {
            return NextResponse.json({ error: 'Invalid YouTube URL.' }, { status: 400 });
        }

        // 1. Fetch metadata
        const metadata = await getVideoMetadata(url);

        // 2. Create project in DB if user is authenticated
        let projectId: string | null = null;
        if (userId) {
            // Upsert the user into the local database first to satisfy the foreign key constraint
            await prisma.user.upsert({
                where: { id: userId },
                update: {},
                create: {
                    id: userId,
                    email: `user_${userId}@placeholder.com`,
                    name: 'SaaS User',
                },
            });

            const project = await prisma.project.create({
                data: {
                    userId,
                    title: metadata.title,
                    youtubeUrl: url,
                    videoId: metadata.video_id,
                    duration: metadata.duration,
                    thumbnail: metadata.thumbnail,
                    status: 'processing',
                },
            });
            projectId = project.id;

            await prisma.job.create({
                data: {
                    type: 'analyze_video',
                    status: 'analyzing',
                    projectId,
                    progress: 10,
                },
            });
        }

        // 3. Fetch transcript
        const rawTranscript = await fetchYoutubeTranscript(videoId);
        const transcriptFormatted = formatTranscriptForPrompt(rawTranscript);

        // 4. AI highlights
        const highlightSegments = await analyzeTranscriptHighlights(
            videoId,
            transcriptFormatted,
            metadata.duration,
            metadata.title,
            metadata.description,
            num_clips
        );

        const clipsResponse = [];

        // 5. Generate metadata & save
        for (let i = 0; i < highlightSegments.length; i++) {
            const seg = highlightSegments[i];
            const clipNumber = i + 1;

            let transcriptSnippet = '';
            if (rawTranscript) {
                const lines = rawTranscript
                    .filter((item: any) => {
                        const s = item.offset / 1000;
                        return s >= seg.start_seconds && s <= seg.end_seconds;
                    })
                    .map((item: any) => item.text);
                transcriptSnippet = lines.join(' ').substring(0, 1000);
            }

            const aiMeta = await generateAiClipMetadata(
                metadata.title,
                metadata.description,
                transcriptSnippet,
                seg.startTime,
                seg.endTime,
                clipNumber
            );

            const clipData: any = {
                clipIdNum: clipNumber,
                startTime: seg.startTime,
                endTime: seg.endTime,
                startSeconds: seg.start_seconds,
                endSeconds: seg.end_seconds,
                title: aiMeta.title,
                description: aiMeta.description,
                suggestedTags: JSON.stringify(aiMeta.tags),
                reasoning: seg.reasoning,
                status: 'analyzed',
            };

            if (userId) clipData.userId = userId;
            if (projectId) clipData.projectId = projectId;

            const newClip = await prisma.clip.create({ data: clipData });

            clipsResponse.push({ ...newClip, suggestedTags: aiMeta.tags });
        }

        // 6. Mark project complete
        if (projectId) {
            await prisma.project.update({
                where: { id: projectId },
                data: { status: 'completed' },
            });
            await prisma.job.updateMany({
                where: { projectId },
                data: { status: 'completed', progress: 100 },
            });
        }

        return NextResponse.json({ metadata, clips: clipsResponse });

    } catch (error: any) {
        console.error('Analysis Error:', error);
        return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
    }
}
