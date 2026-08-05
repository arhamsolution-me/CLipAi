import os
import re
import json
import logging
import subprocess
from typing import List, Dict, Any, Optional

from services.video_service import get_ffmpeg_path

logger = logging.getLogger(__name__)

def hex_to_ass_color(hex_color: str) -> str:
    """
    Converts #RRGGBB or RRGGBB to ASS color format &H00BBGGRR.
    """
    if not hex_color:
        return "&H0000FFFF"  # Default Yellow
    clean_hex = hex_color.lstrip('#')
    if len(clean_hex) != 6:
        clean_hex = "FFFF00"  # Fallback to Yellow
    r = clean_hex[0:2]
    g = clean_hex[2:4]
    b = clean_hex[4:6]
    return f"&H00{b}{g}{r}"

def format_ass_timestamp(seconds: float) -> str:
    """
    Converts seconds float to ASS timestamp format H:MM:SS.cs (e.g., 0:01:23.45).
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centisecs = int(round((seconds - int(seconds)) * 100))
    if centisecs >= 100:
        centisecs = 99
    return f"{hours}:{minutes:02d}:{secs:02d}.{centisecs:02d}"

def extract_audio_from_clip(video_path: str, audio_out_path: str) -> str:
    """
    Extracts 16kHz mono WAV audio from video file for ASR processing.
    """
    ffmpeg_exe = get_ffmpeg_path()
    cmd = [
        ffmpeg_exe, '-y',
        '-i', video_path,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        audio_out_path
    ]
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    return audio_out_path

def transcribe_word_timestamps(audio_path: str, fallback_text: Optional[str] = None, clip_duration: float = 30.0) -> List[Dict[str, Any]]:
    """
    Transcribes audio using faster-whisper to get precise word-level timestamps.
    Degrades gracefully to fallback_text distribution if Whisper is unavailable.
    Returns: [{'word': 'Hello', 'start': 0.12, 'end': 0.45}, ...]
    """
    words_data = []

    # Attempt ASR via faster-whisper
    try:
        from faster_whisper import WhisperModel
        logger.info("Initializing faster-whisper (tiny model) for word-level transcription...")
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        segments, _ = model.transcribe(audio_path, word_timestamps=True)

        for segment in segments:
            if hasattr(segment, 'words') and segment.words:
                for word_info in segment.words:
                    clean_word = word_info.word.strip()
                    if clean_word:
                        words_data.append({
                            'word': clean_word,
                            'start': round(word_info.start, 2),
                            'end': round(word_info.end, 2)
                        })

        if words_data:
            logger.info(f"faster-whisper extracted {len(words_data)} word-level timestamps.")
            return words_data

    except Exception as whisper_err:
        logger.warning(f"faster-whisper unavailable or failed ({whisper_err}). Using word timestamp fallback distribution.")

    # Fallback timestamp estimation
    if fallback_text and fallback_text.strip():
        raw_words = re.findall(r'\S+', fallback_text.strip())
    else:
        raw_words = ["ClipFlow", "AI", "Auto", "Generated", "Captions"]

    total_words = len(raw_words)
    if total_words == 0:
        return []

    time_per_word = max(0.2, clip_duration / total_words)
    current_time = 0.0

    for word in raw_words:
        end_time = min(clip_duration, current_time + time_per_word)
        words_data.append({
            'word': word,
            'start': round(current_time, 2),
            'end': round(end_time, 2)
        })
        current_time = end_time

    return words_data

def translate_words_if_requested(words_data: List[Dict[str, Any]], target_lang: str) -> List[Dict[str, Any]]:
    """
    Translates transcript words into a target language using Groq API if target_lang is specified.
    """
    if not target_lang or target_lang.lower() in ['auto', 'en', 'none']:
        return words_data

    try:
        from services.ai_service import get_groq_client
        client = get_groq_client()
        full_text = " ".join([w['word'] for w in words_data])

        prompt = (
            f"Translate the following transcript text accurately into target language code '{target_lang}'. "
            f"Return ONLY the translated text as a plain string, preserving original punctuation and tone.\n\n"
            f"Text: {full_text}"
        )

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3
        )

        translated_text = response.choices[0].message.content.strip()
        translated_words = re.findall(r'\S+', translated_text)

        if not translated_words:
            return words_data

        # Map original timestamps to translated words proportionally
        total_duration = words_data[-1]['end'] if words_data else 10.0
        time_per_word = total_duration / len(translated_words)

        new_words_data = []
        cur_t = 0.0
        for w in translated_words:
            end_t = min(total_duration, cur_t + time_per_word)
            new_words_data.append({
                'word': w,
                'start': round(cur_t, 2),
                'end': round(end_t, 2)
            })
            cur_t = end_t

        return new_words_data

    except Exception as err:
        logger.warning(f"Translation failed ({err}). Proceeding with original language.")
        return words_data

def generate_ass_subtitles(
    words_data: List[Dict[str, Any]],
    style_preset: str = 'tiktok_pop',
    font_name: str = 'Arial Black',
    highlight_color_hex: str = '#FFFF00',
    output_ass_path: str = 'captions.ass'
) -> str:
    """
    Generates Advanced SubStation Alpha (.ass) subtitle file formatted for 9:16 vertical videos (1080x1920).
    Presets:
      - 'tiktok_pop': 1-3 words group on screen, current spoken word highlighted in vibrant color + scaled.
      - 'bounce': Word pop animation using ASS keyframes.
      - 'highlight_word': Full phrase on screen, active word highlighted.
    """
    ass_color = hex_to_ass_color(highlight_color_hex)
    primary_white = "&H00FFFFFF"
    outline_black = "&H00000000"

    ass_header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},72,{primary_white},&H000000FF,{outline_black},&H80000000,-1,0,0,0,100,100,0,0,1,5,3,2,60,60,400,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    events = []

    if not words_data:
        # Empty captions file
        with open(output_ass_path, 'w', encoding='utf-8') as f:
            f.write(ass_header)
        return output_ass_path

    # Chunk words into small phrase groups (1 to 3 words per line) for short-form video readability
    chunk_size = 2 if style_preset in ['tiktok_pop', 'bounce'] else 4
    chunks = [words_data[i:i + chunk_size] for i in range(0, len(words_data), chunk_size)]

    for chunk in chunks:
        chunk_start = format_ass_timestamp(chunk[0]['start'])
        chunk_end = format_ass_timestamp(chunk[-1]['end'] + 0.1)

        if style_preset == 'tiktok_pop':
            # Create a line where each word shines during its active start/end sub-window
            for active_idx, target_word in enumerate(chunk):
                sub_start = format_ass_timestamp(target_word['start'])
                sub_end = format_ass_timestamp(target_word['end'] + 0.05)

                line_parts = []
                for i, w in enumerate(chunk):
                    word_str = w['word'].upper()
                    if i == active_idx:
                        # Highlight active word with color & pop scale
                        line_parts.append(r"{\c" + ass_color + r"\fscx115\fscy115}" + word_str + r"{\r}")
                    else:
                        line_parts.append(r"{\c" + primary_white + r"\fscx100\fscy100}" + word_str)

                text_content = " ".join(line_parts)
                events.append(f"Dialogue: 0,{sub_start},{sub_end},Default,,0,0,0,,{text_content}")

        elif style_preset == 'bounce':
            for active_idx, target_word in enumerate(chunk):
                sub_start = format_ass_timestamp(target_word['start'])
                sub_end = format_ass_timestamp(target_word['end'] + 0.05)

                line_parts = []
                for i, w in enumerate(chunk):
                    word_str = w['word'].upper()
                    if i == active_idx:
                        # ASS Transform bounce animation tag: scale up then normalize
                        bounce_tag = r"{\c" + ass_color + r"\fscx130\fscy130\t(0,100,\fscx100\fscy100)}"
                        line_parts.append(bounce_tag + word_str + r"{\r}")
                    else:
                        line_parts.append(r"{\c" + primary_white + r"}" + word_str)

                text_content = " ".join(line_parts)
                events.append(f"Dialogue: 0,{sub_start},{sub_end},Default,,0,0,0,,{text_content}")

        else:  # 'highlight_word' / default
            for active_idx, target_word in enumerate(chunk):
                sub_start = format_ass_timestamp(target_word['start'])
                sub_end = format_ass_timestamp(target_word['end'] + 0.05)

                line_parts = []
                for i, w in enumerate(chunk):
                    word_str = w['word']
                    if i == active_idx:
                        line_parts.append(r"{\c" + ass_color + r"\b1}" + word_str + r"{\r}")
                    else:
                        line_parts.append(r"{\c" + primary_white + r"\b0}" + word_str)

                text_content = " ".join(line_parts)
                events.append(f"Dialogue: 0,{sub_start},{sub_end},Default,,0,0,0,,{text_content}")

    with open(output_ass_path, 'w', encoding='utf-8') as f:
        f.write(ass_header + "\n".join(events) + "\n")

    logger.info(f"Generated ASS subtitle file at: {output_ass_path}")
    return output_ass_path

def burn_captions_into_video(input_video_path: str, output_video_path: str, ass_path: str) -> str:
    """
    Burns .ass subtitle file into input_video_path using FFmpeg ass filter.
    """
    ffmpeg_exe = get_ffmpeg_path()

    # Escape windows path separators for FFmpeg filter string
    clean_ass_path = ass_path.replace('\\', '/').replace(':', '\\:')

    cmd = [
        ffmpeg_exe, '-y',
        '-i', input_video_path,
        '-vf', f"ass='{clean_ass_path}'",
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '22',
        '-c:a', 'copy',
        output_video_path
    ]

    logger.info(f"Burning captions with FFmpeg: {' '.join(cmd)}")
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    if result.returncode != 0:
        logger.error(f"FFmpeg ASS burn-in failed: {result.stderr}")
        raise RuntimeError(f"FFmpeg caption burn-in failed: {result.stderr[:300]}")

    return output_video_path

def process_clip_captions(
    clip_video_path: str,
    output_video_path: str,
    fallback_transcript: Optional[str] = None,
    clip_duration: float = 30.0,
    caption_style: str = 'tiktok_pop',
    caption_font: str = 'Arial Black',
    caption_color: str = '#FFFF00',
    caption_language: str = 'auto',
    temp_dir: Optional[str] = None
) -> str:
    """
    Orchestrates the entire Phase 1 caption pipeline:
    1. Extract audio from clip
    2. Transcribe word-level timestamps (faster-whisper or fallback)
    3. Translate if target language requested
    4. Generate ASS animated subtitle file
    5. Burn captions into video via FFmpeg
    """
    if not temp_dir:
        temp_dir = os.path.dirname(clip_video_path)

    base_name = os.path.splitext(os.path.basename(clip_video_path))[0]
    audio_path = os.path.join(temp_dir, f"{base_name}_audio.wav")
    ass_path = os.path.join(temp_dir, f"{base_name}_captions.ass")

    try:
        # Step 1: Extract Audio
        extract_audio_from_clip(clip_video_path, audio_path)

        # Step 2: Transcribe Words
        words_data = transcribe_word_timestamps(audio_path, fallback_text=fallback_transcript, clip_duration=clip_duration)

        # Step 3: Translate if needed
        words_data = translate_words_if_requested(words_data, caption_language)

        # Step 4: Generate ASS file
        generate_ass_subtitles(
            words_data=words_data,
            style_preset=caption_style,
            font_name=caption_font,
            highlight_color_hex=caption_color,
            output_ass_path=ass_path
        )

        # Step 5: Burn ASS into Video
        burn_captions_into_video(clip_video_path, output_video_path, ass_path)
        return output_video_path

    finally:
        # Clean up temporary audio & ASS files
        for temp_file in [audio_path, ass_path]:
            if os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                except Exception:
                    pass
