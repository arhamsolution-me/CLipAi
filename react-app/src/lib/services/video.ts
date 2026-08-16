import ytDlp from 'yt-dlp-exec';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import ffmpegStatic from 'ffmpeg-static';

ffmpeg.setFfmpegPath(ffmpegStatic as string);

export async function getVideoMetadata(videoUrl: string) {
    const rawOutput = await ytDlp(videoUrl, { dumpJson: true });
    let info: any = rawOutput;
    
    if (typeof rawOutput === 'string') {
        info = JSON.parse(rawOutput);
    }
    
    return {
        title: info.title || 'YouTube Video',
        description: info.description || '',
        thumbnail: info.thumbnail || '',
        duration: info.duration || 0,
        video_id: info.id
    };
}

export async function downloadClipSegment(videoUrl: string, clipId: string, startSeconds: number, endSeconds: number, clipsFolder: string) {
    if (!fs.existsSync(clipsFolder)) {
        fs.mkdirSync(clipsFolder, { recursive: true });
    }
    
    const buffer = 2.0;
    const segStart = Math.max(0, startSeconds - buffer);
    const segEnd = endSeconds + buffer;
    
    const targetPattern = path.join(clipsFolder, `seg_${clipId}.mp4`);
    if (fs.existsSync(targetPattern) && fs.statSync(targetPattern).size > 0) {
        return targetPattern;
    }

    try {
        await ytDlp(videoUrl, {
            format: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
            output: targetPattern,
            downloadSections: `*${segStart}-${segEnd}`,
            forceKeyframesAtCuts: true,
            noCacheDir: true,
            extractorArgs: 'youtube:player_client=android',
            downloaderArgs: 'ffmpeg:-user_agent "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Mobile Safari/537.36"',
            retries: 3,
            ffmpegLocation: ffmpegStatic as string
        } as any);
        return targetPattern;
    } catch (err) {
        console.error("Segment download failed:", err);
        throw new Error("Failed to download video segment");
    }
}

export async function cutAndFormatClip(
    sourceVideoPath: string,
    startSeconds: number,
    durationSeconds: number,
    outputClipPath: string,
    aspectRatio: '16:9' | '9:16' = '9:16'
): Promise<string> {
    const filterGraph: string[] = [];
    let mapV = '0:v';

    if (aspectRatio === '9:16') {
        filterGraph.push('[0:v]scale=180:320:force_original_aspect_ratio=increase,crop=180:320,boxblur=10:10,scale=1080:1920[bg]');
        filterGraph.push('[0:v]scale=1080:-2[fg]');
        filterGraph.push('[bg][fg]overlay=(W-w)/2:(H-h)/2[vid]');
        mapV = '[vid]';
    }

    return new Promise((resolve, reject) => {
        const cmd = ffmpeg(sourceVideoPath)
            .setStartTime(Math.max(0, startSeconds))
            .setDuration(Math.max(1.0, durationSeconds));

        if (filterGraph.length > 0) {
            cmd.complexFilter(filterGraph);
            cmd.videoCodec('libx264');
        } else {
            // If no filters needed, we can't use complexFilter
            cmd.videoCodec('libx264');
        }

        cmd.outputOptions([
                '-map', mapV,
                '-map', '0:a?',
                '-preset', 'veryfast',
                '-crf', '18',
                '-pix_fmt', 'yuv420p',
                '-avoid_negative_ts', 'make_zero'
            ])
            .audioCodec('aac')
            .audioBitrate('128k')
            .audioFrequency(44100)
            .audioChannels(2)
            .on('end', () => resolve(outputClipPath))
            .on('error', (err) => {
                console.error("FFmpeg Error:", err);
                reject(err);
            })
            .save(outputClipPath);
    });
}

// ─── Phase 7: Burn-in captions using FFmpeg drawtext ─────────────────────────
function parseSrtToDrawtext(srtPath: string, fontColor: string, yExpr: string, isWindows: boolean): string {
    if (!fs.existsSync(srtPath)) return '';
    const content = fs.readFileSync(srtPath, 'utf8');
    const blocks = content.split(/\n\s*\n/).filter(b => b.trim());
    
    const fontPath = isWindows ? 'C:/Windows/Fonts/arialbd.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
    const filters: string[] = [];
    
    for (const block of blocks) {
        const lines = block.split('\n');
        if (lines.length < 3) continue;
        const timeLine = lines[1];
        const textLines = lines.slice(2);
        
        const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
        if (!timeMatch) continue;
        
        const startSec = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
        const endSec = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
        
        // Replace special characters that break FFmpeg filter parsing even inside single quotes
        let text = textLines.join(' ').trim();
        if (!text) continue;
        
        // Use typographic apostrophes and quotes to completely sidestep FFmpeg escaping hell
        text = text.replace(/'/g, '’').replace(/"/g, '”');
        
        // Wrap text to ~25 chars per line
        const words = text.split(' ');
        const wrapped: string[] = [];
        let current = '';
        for (const word of words) {
            if ((current + ' ' + word).trim().length > 25) {
                if (current) wrapped.push(current.trim());
                current = word;
            } else {
                current = (current + ' ' + word).trim();
            }
        }
        if (current) wrapped.push(current.trim());
        
        const wrappedText = wrapped.join('\n').replace(/:/g, '\\:');
        
        const def = [
            `drawtext=fontfile='${fontPath}'`,
            `text='${wrappedText}'`,
            `fontsize=80`,
            `fontcolor=${fontColor}`,
            `borderw=4`,
            `bordercolor=black`,
            `x=(w-text_w)/2`,
            `y=${yExpr}`,
            `line_spacing=12`,
            `enable='between(t,${startSec},${endSec})'`
        ].join(':');
        
        filters.push(def);
    }
    return filters.join(',');
}

export async function cutAndFormatClipWithCaptions(
    sourceVideoPath: string,
    startSeconds: number,
    durationSeconds: number,
    outputClipPath: string,
    srtPath: string,
    options: {
        fontColor?: string;
        fontSize?: number;
        position?: 'bottom' | 'center' | 'top';
        aspectRatio?: '16:9' | '9:16';
    } = {}
): Promise<string> {
    const { fontColor = 'white', fontSize = 80, position = 'bottom', aspectRatio = '9:16' } = options;

    const yExpr = position === 'top' ? 'h*0.1' : position === 'center' ? '(h-text_h)/2' : 'h-th-h*0.12';
    const isWindows = process.platform === 'win32';
    
    // Replace buggy subtitles filter with a dynamic chain of drawtext filters mapped from the SRT
    const subtitlesDef = parseSrtToDrawtext(srtPath, fontColor, yExpr, isWindows) || 'null';


    const filterGraph: string[] = [];
    let mapV = '0:v';

    if (aspectRatio === '9:16') {
        filterGraph.push('[0:v]scale=180:320:force_original_aspect_ratio=increase,crop=180:320,boxblur=10:10,scale=1080:1920[bg]');
        filterGraph.push('[0:v]scale=1080:-2[fg]');
        filterGraph.push('[bg][fg]overlay=(W-w)/2:(H-h)/2[vid]');
        filterGraph.push(`[vid]${subtitlesDef}[final]`);
        mapV = '[final]';
    } else {
        // Standardize 16:9 to 1920x1080 so that fontsize=80 and wrapping fits perfectly
        filterGraph.push('[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[vid]');
        filterGraph.push(`[vid]${subtitlesDef}[final]`);
        mapV = '[final]';
    }

    return new Promise((resolve, reject) => {
        ffmpeg(sourceVideoPath)
            .setStartTime(Math.max(0, startSeconds))
            .setDuration(Math.max(1.0, durationSeconds))
            .complexFilter(filterGraph)
            .videoCodec('libx264')
            .outputOptions([
                '-map', mapV,
                '-map', '0:a?',
                '-preset', 'veryfast',
                '-crf', '18',
                '-pix_fmt', 'yuv420p',
                '-avoid_negative_ts', 'make_zero'
            ])
            .audioCodec('aac')
            .audioBitrate('128k')
            .audioFrequency(44100)
            .audioChannels(2)
            .on('end', () => resolve(outputClipPath))
            .on('error', (err) => {
                console.error('FFmpeg Caption Error:', err);
                reject(err);
            })
            .save(outputClipPath);
    });
}

// ─── Extract Audio for Transcription ──────────────────────────────────────────
export async function extractAudioForTranscription(
    sourceVideoPath: string,
    outputAudioPath: string,
    startSeconds: number,
    durationSeconds: number
): Promise<string> {
    return new Promise((resolve, reject) => {
        ffmpeg(sourceVideoPath)
            .setStartTime(Math.max(0, startSeconds))
            .setDuration(Math.max(1.0, durationSeconds))
            .noVideo()
            .audioCodec('libmp3lame')
            .audioBitrate('128k')
            .audioFrequency(44100)
            .audioChannels(1) // Mono is better for Whisper
            .on('end', () => resolve(outputAudioPath))
            .on('error', (err) => {
                console.error('FFmpeg Audio Extraction Error:', err);
                reject(err);
            })
            .save(outputAudioPath);
    });
}
