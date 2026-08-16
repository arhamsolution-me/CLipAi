import { YoutubeTranscript } from 'youtube-transcript';

export async function fetchYoutubeTranscript(videoId: string) {
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        return transcript;
    } catch (e) {
        console.warn(`Failed to fetch any transcript for video ${videoId}:`, e);
        return null;
    }
}

export function formatTranscriptForPrompt(transcript: any[] | null, maxChars: number = 15000): string {
    if (!transcript || transcript.length === 0) return "";
    
    let formattedLines = [];
    for (const item of transcript) {
        const startVal = item.offset / 1000; // youtube-transcript returns offset in ms
        const textVal = item.text;
        
        const startMin = Math.floor(startVal / 60);
        const startSec = Math.floor(startVal % 60);
        const timestamp = `[${startMin.toString().padStart(2, '0')}:${startSec.toString().padStart(2, '0')}]`;
        const cleanText = String(textVal).replace(/\n/g, ' ').trim();
        formattedLines.push(`${timestamp} ${cleanText}`);
    }
    
    let fullText = formattedLines.join("\n");
    if (fullText.length > maxChars) {
        fullText = fullText.substring(0, maxChars) + "\n...[transcript truncated]";
    }
    return fullText;
}
