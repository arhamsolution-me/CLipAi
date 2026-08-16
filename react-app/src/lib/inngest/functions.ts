import { inngest } from './client';
import { prisma } from '@/lib/prisma';
import { getVideoMetadata } from '@/lib/services/video';
import { fetchYoutubeTranscript, formatTranscriptForPrompt } from '@/lib/services/transcript';
import { analyzeTranscriptHighlights, generateAiClipMetadata } from '@/lib/services/ai';

// ─────────────────────────────────────────────
// EVENT: Analyze a YouTube video for clips
// ─────────────────────────────────────────────
export const analyzeVideoFunction = inngest.createFunction(
  { id: 'analyze-video', name: 'Analyze YouTube Video', retries: 2 },
  { event: 'video/analyze' },
  async ({ event, step }) => {
    const { url, num_clips, projectId, userId } = event.data;

    // Step 1: Fetch metadata
    const metadata = await step.run('fetch-metadata', async () => {
      return await getVideoMetadata(url);
    });

    // Step 2: Update job status
    await step.run('update-status-transcript', async () => {
      await prisma.job.updateMany({
        where: { projectId },
        data: { status: 'analyzing', progress: 25 },
      });
    });

    // Step 3: Fetch transcript
    const rawTranscript = await step.run('fetch-transcript', async () => {
      return await fetchYoutubeTranscript(metadata.video_id);
    });

    const transcriptFormatted = formatTranscriptForPrompt(rawTranscript);

    // Step 4: AI analysis
    const highlightSegments = await step.run('ai-analysis', async () => {
      await prisma.job.updateMany({
        where: { projectId },
        data: { status: 'generating_clips', progress: 60 },
      });
      return await analyzeTranscriptHighlights(
        metadata.video_id,
        transcriptFormatted,
        metadata.duration,
        metadata.title,
        metadata.description,
        num_clips
      );
    });

    // Step 5: Generate metadata & save clips
    const clips = await step.run('save-clips', async () => {
      const savedClips = [];
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

        const clip = await prisma.clip.create({
          data: {
            clipIdNum: clipNumber,
            projectId,
            userId,
            videoId: metadata.video_id,
            videoUrl: url,
            startTime: seg.startTime,
            endTime: seg.endTime,
            startSeconds: seg.start_seconds,
            endSeconds: seg.end_seconds,
            title: aiMeta.title,
            description: aiMeta.description,
            suggestedTags: JSON.stringify(aiMeta.tags),
            reasoning: seg.reasoning,
            status: 'analyzed',
          } as any,
        });

        savedClips.push({ ...clip, suggestedTags: aiMeta.tags });
      }

      // Mark project and job as complete
      await prisma.job.updateMany({
        where: { projectId },
        data: { status: 'completed', progress: 100 },
      });
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'completed' },
      });

      return savedClips;
    });

    return { metadata, clips };
  }
);
