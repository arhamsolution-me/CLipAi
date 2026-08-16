import os
import json
import logging
import re
from groq import Groq

logger = logging.getLogger(__name__)

def get_groq_client():
    api_key = os.getenv('GROQ_API_KEY')
    if not api_key or not api_key.strip():
        logger.warning("GROQ_API_KEY is not configured in .env")
        return None
    try:
        return Groq(api_key=api_key.strip())
    except Exception as e:
        logger.error(f"Failed to initialize Groq client: {e}")
        return None

def seconds_to_timestamp(seconds):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"

def timestamp_to_seconds(timestamp):
    parts = timestamp.split(':')
    if len(parts) == 2:
        return int(parts[0]) * 60 + int(parts[1])
    elif len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    return 0

def generate_fallback_segments(duration_seconds, num_clips=3):
    """
    Generates N non-overlapping or evenly-spaced segments within video duration.
    Guarantees valid, positive start/end seconds that stay strictly within duration_seconds.
    """
    num_clips = max(1, min(int(num_clips), 10))
    duration_seconds = float(duration_seconds)
    
    if duration_seconds <= 0:
        return []

    # For clips, target up to 60s or 75% of video length (min 15s)
    clip_len = min(60.0, max(15.0, duration_seconds * 0.75))
    if clip_len > duration_seconds:
        clip_len = duration_seconds

    if duration_seconds <= 15.0 or num_clips == 1:
        # Video is very short or 1 clip requested
        return [{
            'start_seconds': 0.0,
            'end_seconds': round(duration_seconds, 2),
            'startTime': seconds_to_timestamp(0),
            'endTime': seconds_to_timestamp(duration_seconds),
            'reasoning': 'Full video segment',
            'transcript_fallback': True
        }]

    # Space out num_clips start times across available video duration
    max_start = max(0.0, duration_seconds - clip_len)
    step = max_start / max(1, num_clips - 1)

    segments = []
    for i in range(num_clips):
        start_sec = round(i * step, 2)
        end_sec = round(min(start_sec + clip_len, duration_seconds), 2)
        if end_sec <= start_sec:
            start_sec = 0.0
            end_sec = round(duration_seconds, 2)

        segments.append({
            'start_seconds': float(start_sec),
            'end_seconds': float(end_sec),
            'startTime': seconds_to_timestamp(start_sec),
            'endTime': seconds_to_timestamp(end_sec),
            'reasoning': f'Uniform segment #{i+1} selection',
            'transcript_fallback': True
        })
    return segments

def analyze_transcript_highlights(video_id, transcript_formatted, duration_seconds, title, description, num_clips=3):
    """
    Uses Groq llama-3.3-70b-versatile to rank transcript segments for highlight potential.
    Returns requested number of non-overlapping 45-60 second segments.
    """
    num_clips = max(1, min(int(num_clips), 10))
    duration_seconds = float(duration_seconds)
    client = get_groq_client()
    if not client or not transcript_formatted:
        logger.warning(f"Falling back to random highlight selection for video {video_id} (Groq available: {client is not None}, Transcript available: {bool(transcript_formatted)})")
        return generate_fallback_segments(duration_seconds, num_clips=num_clips)

    prompt = f"""
You are an expert viral video editor specializing in YouTube Shorts.
Analyze the following video transcript and metadata to extract the {num_clips} TOP viral highlight segments suitable for 45-60 second YouTube Shorts.

Video Title: {title}
Video Duration: {duration_seconds} seconds
Transcript:
{transcript_formatted}

REQUIREMENTS:
1. Identify the {num_clips} best non-overlapping highlight segments.
2. Each segment MUST be between 45 and 60 seconds long.
3. Start timestamp and End timestamp MUST be within 0 to {duration_seconds} seconds.
4. Focus on strong hooks, punchlines, dramatic moments, insights, or key takeaways.
5. Return ONLY a valid JSON array of objects with keys:
   - "start_seconds": number
   - "end_seconds": number
   - "reasoning": string (short explanation of why this segment is viral)
"""
    try:
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a JSON-only response assistant for video clip editing."},
                {"role": "user", "content": prompt}
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        logger.info(f"Groq transcript analysis response: {content}")
        
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            # If wrapped in a key like 'segments' or 'highlights'
            parsed_list = parsed.get('segments') or parsed.get('highlights') or parsed.get('clips') or list(parsed.values())[0]
        else:
            parsed_list = parsed

        if not isinstance(parsed_list, list) or len(parsed_list) == 0:
            raise ValueError("Parsed Groq response is not a valid list of segments")

        segments = []
        for item in parsed_list[:num_clips]:
            try:
                s_sec = float(item.get('start_seconds', 0))
                e_sec = float(item.get('end_seconds', s_sec + 45))
            except (ValueError, TypeError):
                continue

            # Ensure start is within video bounds
            s_sec = max(0.0, min(s_sec, max(0.0, duration_seconds - 5.0)))
            # Ensure end is after start and within video bounds
            e_sec = max(s_sec + 5.0, min(e_sec, duration_seconds))

            segments.append({
                'start_seconds': round(s_sec, 2),
                'end_seconds': round(e_sec, 2),
                'startTime': seconds_to_timestamp(s_sec),
                'endTime': seconds_to_timestamp(e_sec),
                'reasoning': str(item.get('reasoning', 'AI highlighted moment')),
                'transcript_fallback': False
            })

        # Fill up to num_clips if fewer segments returned
        if len(segments) < num_clips:
            fallback = generate_fallback_segments(duration_seconds, num_clips=num_clips)
            for fb in fallback:
                if len(segments) >= num_clips:
                    break
                segments.append(fb)

        return segments

    except Exception as e:
        logger.error(f"Error during Groq transcript analysis: {e}. Falling back to standard segment picking.")
        return generate_fallback_segments(duration_seconds, num_clips=num_clips)

def generate_ai_clip_metadata(original_title, original_description, transcript_snippet, start_timestamp, end_timestamp, clip_number):
    """
    Generates scroll-stopping title, detailed description, and tags via Groq for a single clip.
    """
    client = get_groq_client()
    
    if not client:
        # Fallback metadata generation without Groq API
        clean_words = [w for w in original_title.split() if len(w) > 3][:3]
        topic = " ".join(clean_words) if clean_words else "Viral Clip"
        fallback_title = f"{topic} - Part {clip_number} #{start_timestamp}"[:60]
        fallback_desc = f"🔥 Key highlight from '{original_title}' ({start_timestamp} - {end_timestamp})\n\n{original_description[:200]}\n\n#Shorts #Viral #Trending"[:5000]
        fallback_tags = ['shorts', 'viral', 'trending', 'youtubeshorts', 'clip']
        return {
            'title': fallback_title,
            'description': fallback_desc,
            'tags': fallback_tags
        }

    prompt = f"""
You are an expert social media manager writing optimized titles, descriptions, and tags for YouTube Shorts.

Original Video Title: {original_title}
Original Video Description: {original_description[:300]}
Clip Timestamp: {start_timestamp} to {end_timestamp}
Clip Transcript Snippet: {transcript_snippet if transcript_snippet else "N/A"}

REQUIREMENTS:
1. "title": Write a scroll-stopping, highly engaging title specific to this clip's content. Max 60 characters. No generic filler like "Best of Part 1".
2. "description": Write an engaging description summarizing what happens in this specific clip, ending with relevant hashtags (#Shorts, #Viral, etc.). Max 500 characters.
3. "tags": Provide 5-8 relevant tags as a JSON array of strings.

Return ONLY a valid JSON object with format:
{{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", "tag3"]
}}
"""
    try:
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a JSON-only YouTube Shorts metadata generator."},
                {"role": "user", "content": prompt}
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.5,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        data = json.loads(content)
        
        title = str(data.get('title', f"Viral Moment #{clip_number}")).strip()[:60]
        description = str(data.get('description', original_description[:200])).strip()[:5000]
        tags = data.get('tags', ['shorts', 'viral', 'trending'])
        if not isinstance(tags, list):
            tags = ['shorts', 'viral', 'trending']

        return {
            'title': title,
            'description': description,
            'tags': [str(t).lower().replace('#', '') for t in tags[:10]]
        }
    except Exception as e:
        logger.error(f"Error generating AI clip metadata via Groq: {e}")
        clean_words = [w for w in original_title.split() if len(w) > 3][:3]
        topic = " ".join(clean_words) if clean_words else "Viral Moment"
        return {
            'title': f"{topic} #{clip_number}"[:60],
            'description': f"Best clip from {original_title} ({start_timestamp} - {end_timestamp})\n\n#Shorts #Viral"[:5000],
            'tags': ['shorts', 'viral', 'trending']
        }
