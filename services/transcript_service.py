import logging

logger = logging.getLogger(__name__)

def fetch_youtube_transcript(video_id: str):
    """
    Fetches transcript for a YouTube video using youtube-transcript-api.
    Returns list of objects/dicts or None if transcript unavailable.
    """
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        api = YouTubeTranscriptApi()
        
        # Try fetching primary transcript
        try:
            transcript = api.fetch(video_id, languages=['en', 'en-US', 'en-GB'])
            logger.info(f"Successfully fetched primary English transcript for video {video_id}")
            return transcript
        except Exception as e:
            logger.warning(f"Default English transcript fetch failed for {video_id}: {e}. Trying default fetch...")
            transcript = api.fetch(video_id)
            return transcript

    except Exception as e:
        logger.warning(f"Failed to fetch any transcript for video {video_id}: {e}")
        return None

def format_transcript_for_prompt(transcript, max_chars=15000):
    """
    Formats raw transcript items into a readable timed text block for AI prompt analysis.
    Truncates if text is excessively long.
    """
    if not transcript:
        return ""
    
    formatted_lines = []
    for item in transcript:
        # Support both object attributes (.text, .start) and dictionary keys (['text'], ['start'])
        if hasattr(item, 'start'):
            start_val = item.start
            text_val = item.text
        elif isinstance(item, dict):
            start_val = item.get('start', 0)
            text_val = item.get('text', '')
        else:
            continue

        start_min = int(start_val // 60)
        start_sec = int(start_val % 60)
        timestamp = f"[{start_min:02d}:{start_sec:02d}]"
        clean_text = str(text_val).replace('\n', ' ').strip()
        formatted_lines.append(f"{timestamp} {clean_text}")
        
    full_text = "\n".join(formatted_lines)
    if len(full_text) > max_chars:
        full_text = full_text[:max_chars] + "\n...[transcript truncated]"
    return full_text
