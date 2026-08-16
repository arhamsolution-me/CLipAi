import Groq from 'groq-sdk';
import fs from 'fs';
let currentKeyIndex = 0;

const getGroqClient = () => {
    const keysString = process.env.GROQ_API_KEYS;
    const singleKey = process.env.GROQ_API_KEY; // fallback

    let apiKey = singleKey;

    if (keysString) {
        const keys = keysString.split(',').map(k => k.trim()).filter(k => k.length > 0);
        if (keys.length > 0) {
            // Shift to the next key sequentially (Round-Robin)
            apiKey = keys[currentKeyIndex];
            currentKeyIndex = (currentKeyIndex + 1) % keys.length;
        }
    }

    if (!apiKey) {
        console.warn("GROQ_API_KEYS is not configured");
        return null;
    }
    
    return new Groq({ apiKey });
};

function secondsToTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function generateFallbackSegments(durationSeconds: number, numClips: number = 3) {
    numClips = Math.max(1, Math.min(numClips, 10));
    if (durationSeconds <= 0) return [];

    let clipLen = Math.min(60.0, Math.max(15.0, durationSeconds * 0.75));
    if (clipLen > durationSeconds) clipLen = durationSeconds;

    if (durationSeconds <= 15.0 || numClips === 1) {
        return [{
            start_seconds: 0.0,
            end_seconds: Number(durationSeconds.toFixed(2)),
            startTime: secondsToTimestamp(0),
            endTime: secondsToTimestamp(durationSeconds),
            reasoning: 'Full video segment',
            transcript_fallback: true
        }];
    }

    const maxStart = Math.max(0.0, durationSeconds - clipLen);
    const step = maxStart / Math.max(1, numClips - 1);
    
    const segments = [];
    for (let i = 0; i < numClips; i++) {
        let startSec = Number((i * step).toFixed(2));
        let endSec = Number(Math.min(startSec + clipLen, durationSeconds).toFixed(2));
        if (endSec <= startSec) {
            startSec = 0.0;
            endSec = Number(durationSeconds.toFixed(2));
        }
        segments.push({
            start_seconds: startSec,
            end_seconds: endSec,
            startTime: secondsToTimestamp(startSec),
            endTime: secondsToTimestamp(endSec),
            reasoning: `Uniform segment #${i+1} selection`,
            transcript_fallback: true
        });
    }
    return segments;
}

export async function analyzeTranscriptHighlights(videoId: string, transcriptFormatted: string | null, durationSeconds: number, title: string, description: string, numClips: number = 3) {
    numClips = Math.max(1, Math.min(numClips, 10));
    const client = getGroqClient();
    
    if (!client || !transcriptFormatted) {
        return generateFallbackSegments(durationSeconds, numClips);
    }

    const prompt = `
You are an expert viral video editor specializing in YouTube Shorts.
Analyze the following video transcript and metadata to extract the ${numClips} TOP viral highlight segments suitable for 45-60 second YouTube Shorts.

Video Title: ${title}
Video Duration: ${durationSeconds} seconds
Transcript:
${transcriptFormatted}

REQUIREMENTS:
1. Identify the ${numClips} best non-overlapping highlight segments.
2. Each segment MUST be between 45 and 60 seconds long.
3. Start timestamp and End timestamp MUST be within 0 to ${durationSeconds} seconds.
4. Focus on strong hooks, punchlines, dramatic moments, insights, or key takeaways.
5. Return ONLY a valid JSON array of objects with keys:
   - "start_seconds": number
   - "end_seconds": number
   - "reasoning": string (short explanation of why this segment is viral)
`;

    try {
        const response = await client.chat.completions.create({
            messages: [
                { role: "system", content: "You are a JSON-only response assistant for video clip editing." },
                { role: "user", content: prompt }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        const content = response.choices[0]?.message?.content || "{}";
        const parsed = JSON.parse(content);
        let parsedList = parsed.segments || parsed.highlights || parsed.clips || Object.values(parsed)[0];
        
        if (!Array.isArray(parsedList) || parsedList.length === 0) {
            parsedList = parsed;
        }
        if (!Array.isArray(parsedList)) {
            throw new Error("Parsed Groq response is not a valid list of segments");
        }

        const segments = [];
        for (const item of parsedList.slice(0, numClips)) {
            let sSec = Number(item.start_seconds) || 0;
            let eSec = Number(item.end_seconds) || (sSec + 45);

            sSec = Math.max(0, Math.min(sSec, Math.max(0, durationSeconds - 5.0)));
            eSec = Math.max(sSec + 5.0, Math.min(eSec, durationSeconds));

            segments.push({
                start_seconds: Number(sSec.toFixed(2)),
                end_seconds: Number(eSec.toFixed(2)),
                startTime: secondsToTimestamp(sSec),
                endTime: secondsToTimestamp(eSec),
                reasoning: String(item.reasoning || 'AI highlighted moment'),
                transcript_fallback: false
            });
        }

        if (segments.length < numClips) {
            const fallback = generateFallbackSegments(durationSeconds, numClips);
            for (const fb of fallback) {
                if (segments.length >= numClips) break;
                segments.push(fb);
            }
        }
        return segments;
    } catch (e) {
        console.error("Groq Analysis Error", e);
        return generateFallbackSegments(durationSeconds, numClips);
    }
}

export async function generateAiClipMetadata(originalTitle: string, originalDescription: string, transcriptSnippet: string, startTimestamp: string, endTimestamp: string, clipNumber: number) {
    const client = getGroqClient();
    
    if (!client) {
        return {
            title: `Viral Moment #${clipNumber}`,
            description: `Best clip from ${originalTitle} (${startTimestamp} - ${endTimestamp})\n\n#Shorts #Viral`,
            tags: ['shorts', 'viral', 'trending']
        };
    }

    const prompt = `
You are an expert social media manager writing optimized titles, descriptions, and tags for YouTube Shorts.

Original Video Title: ${originalTitle}
Original Video Description: ${originalDescription.substring(0, 300)}
Clip Timestamp: ${startTimestamp} to ${endTimestamp}
Clip Transcript Snippet: ${transcriptSnippet || "N/A"}

REQUIREMENTS:
1. "title": Write a scroll-stopping, highly engaging title specific to this clip's content. Max 60 characters. No generic filler like "Best of Part 1".
2. "description": Write an engaging description summarizing what happens in this specific clip, ending with relevant hashtags (#Shorts, #Viral, etc.). Max 500 characters.
3. "tags": Provide 5-8 relevant tags as a JSON array of strings.

Return ONLY a valid JSON object with format:
{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", "tag3"]
}
`;

    try {
        const response = await client.chat.completions.create({
            messages: [
                { role: "system", content: "You are a JSON-only YouTube Shorts metadata generator." },
                { role: "user", content: prompt }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.5,
            response_format: { type: "json_object" }
        });

        const content = response.choices[0]?.message?.content || "{}";
        const data = JSON.parse(content);
        
        return {
            title: String(data.title || `Viral Moment #${clipNumber}`).trim().substring(0, 60),
            description: String(data.description || "").trim().substring(0, 5000),
            tags: Array.isArray(data.tags) ? data.tags.map((t: string) => t.toLowerCase().replace('#', '')).slice(0, 10) : ['shorts', 'viral', 'trending']
        };
    } catch (e) {
        console.error("Error generating AI clip metadata via Groq:", e);
        return {
            title: `Viral Moment #${clipNumber}`,
            description: `Best clip from ${originalTitle} (${startTimestamp} - ${endTimestamp})\n\n#Shorts #Viral`,
            tags: ['shorts', 'viral', 'trending']
        };
    }
}

// ─── Dynamic Whisper Captions ───────────────────────────────────────────────
function formatSrtTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

export async function transcribeAudioToSrt(audioPath: string, srtPath: string, maxRetries = 3): Promise<boolean> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const client = getGroqClient();
        if (!client) {
            console.warn("Groq client not initialized. Cannot transcribe audio.");
            return false;
        }

        try {
            const fileStream = fs.createReadStream(audioPath);
            
            const response = await client.audio.transcriptions.create({
                file: fileStream,
                model: 'whisper-large-v3-turbo',
                response_format: 'verbose_json',
                language: 'en'
            });

            // The response format for verbose_json includes a 'segments' array
            const segments = (response as any).segments || [];
            if (segments.length === 0) {
                console.warn("No segments found in transcription response");
                return false;
            }

            let srtContent = '';
            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                const start = formatSrtTime(seg.start);
                const end = formatSrtTime(seg.end);
                srtContent += `${i + 1}\n`;
                srtContent += `${start} --> ${end}\n`;
                srtContent += `${seg.text.trim()}\n\n`;
            }

            fs.writeFileSync(srtPath, srtContent, 'utf-8');
            return true;
        } catch (e: any) {
            console.error(`Whisper Transcription Error (Attempt ${attempt + 1}/${maxRetries}):`, e.message);
            // It will loop and getGroqClient() will automatically SHIFT to the next key!
        }
    }
    console.error("All API keys failed or rate limited after shifting.");
    return false;
}
