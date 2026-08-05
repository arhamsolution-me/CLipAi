import os
import subprocess
import logging
import yt_dlp
import imageio_ffmpeg

logger = logging.getLogger(__name__)

def get_ffmpeg_path() -> str:
    """Returns absolute path to working ffmpeg executable provided by imageio-ffmpeg."""
    try:
        path = imageio_ffmpeg.get_ffmpeg_exe()
        if os.path.exists(path):
            # Also check for a properly-named ffmpeg.exe in the same directory
            # (yt-dlp requires the binary to be named exactly 'ffmpeg.exe')
            ffmpeg_dir = os.path.dirname(path)
            proper_path = os.path.join(ffmpeg_dir, 'ffmpeg.exe')
            if os.path.exists(proper_path):
                return proper_path
            return path
    except Exception as e:
        logger.warning(f"Could not get imageio-ffmpeg path: {e}")
    return 'ffmpeg'

def _ensure_ffmpeg_on_path():
    """
    yt-dlp's FFmpegFD.available() checks os.environ['PATH'] directly rather than
    relying only on ffmpeg_location when processing download_ranges.
    Adding ffmpeg's directory to os.environ['PATH'] ensures yt-dlp detects ffmpeg correctly.
    """
    try:
        ffmpeg_exe = get_ffmpeg_path()
        if ffmpeg_exe and os.path.exists(ffmpeg_exe):
            ffmpeg_dir = os.path.dirname(ffmpeg_exe)
            if ffmpeg_dir not in os.environ.get('PATH', ''):
                os.environ['PATH'] = ffmpeg_dir + os.pathsep + os.environ.get('PATH', '')
                logger.info(f"Added FFmpeg directory to PATH: {ffmpeg_dir}")
    except Exception as e:
        logger.warning(f"Failed to append FFmpeg dir to PATH: {e}")

# Ensure PATH is set on module import
_ensure_ffmpeg_on_path()

def _get_ytdlp_ffmpeg_dir() -> str:
    """
    yt-dlp looks for a binary literally named 'ffmpeg' / 'ffmpeg.exe' in the
    given directory. imageio-ffmpeg ships it with a versioned name like
    'ffmpeg-win-x86_64-v7.1.exe', which yt-dlp cannot find by name.

    This helper creates a temporary directory containing a hard-link (or copy)
    named 'ffmpeg.exe' that points to the real binary, then returns the dir path.
    The caller is responsible for cleaning it up.
    """
    import sys
    import shutil
    import tempfile

    ffmpeg_exe = get_ffmpeg_path()

    # Already named correctly — just return its directory
    basename = os.path.basename(ffmpeg_exe).lower()
    if basename in ('ffmpeg', 'ffmpeg.exe'):
        return os.path.dirname(ffmpeg_exe), None  # (dir, temp_dir_to_cleanup)

    temp_dir = tempfile.mkdtemp(prefix='ytdlp_ffmpeg_')
    target_name = 'ffmpeg.exe' if sys.platform == 'win32' else 'ffmpeg'
    target_path = os.path.join(temp_dir, target_name)

    try:
        os.link(ffmpeg_exe, target_path)          # hard-link (instant, no disk copy)
    except OSError:
        shutil.copy2(ffmpeg_exe, target_path)     # fallback: full copy

    logger.info(f"Created yt-dlp ffmpeg stub at: {target_path}")
    return temp_dir, temp_dir                     # (dir, temp_dir_to_cleanup)


def download_clip_segment(video_url: str, clip_id: str, start_seconds: float, end_seconds: float, clips_folder: str) -> str:
    """
    Downloads ONLY the required time segment of a YouTube video using yt-dlp's
    download_ranges option. This avoids downloading the full video and is much
    faster and more storage-efficient.
    Returns the path to the downloaded segment MP4 file.
    Raises RuntimeError if download fails.
    """
    import shutil

    _ensure_ffmpeg_on_path()
    os.makedirs(clips_folder, exist_ok=True)

    # Add a small buffer so FFmpeg has frames to seek from
    buffer = 2.0
    seg_start = max(0, start_seconds - buffer)
    seg_end = end_seconds + buffer

    target_pattern = os.path.join(clips_folder, f'seg_{clip_id}.mp4')

    # Re-use if already downloaded
    if os.path.exists(target_pattern) and os.path.getsize(target_pattern) > 0:
        logger.info(f"Segment seg_{clip_id}.mp4 already exists, re-using.")
        return target_pattern

    # Build a temp dir with a properly-named ffmpeg.exe for yt-dlp detection
    ffmpeg_dir, temp_dir = _get_ytdlp_ffmpeg_dir()
    logger.info(f"yt-dlp ffmpeg dir: {ffmpeg_dir}")

    ydl_opts = {
        # Use a single combined stream so yt-dlp does NOT need ffmpeg to merge.
        # We re-encode to 9:16 with our own FFmpeg call anyway.
        'format': 'best[height<=720]/best',
        'outtmpl': target_pattern,
        'ffmpeg_location': ffmpeg_dir,
        'quiet': False,
        'no_warnings': True,
        'retries': 5,
        'socket_timeout': 30,
        'download_ranges': yt_dlp.utils.download_range_func(None, [(seg_start, seg_end)]),
        # Skip keyframe forcing — our FFmpeg re-cut handles precision
        'force_keyframes_at_cuts': False,
    }

    try:
        logger.info(f"Downloading segment [{seg_start:.1f}s – {seg_end:.1f}s] for clip {clip_id}...")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([video_url])

        if not os.path.exists(target_pattern) or os.path.getsize(target_pattern) == 0:
            raise RuntimeError("yt-dlp finished but segment file is missing or empty.")

        return target_pattern
    except Exception as e:
        logger.error(f"Segment download failed for clip {clip_id}: {e}")
        raise RuntimeError(f"Video download failed: {str(e)}")
    finally:
        # Clean up the temporary ffmpeg stub directory if we created one
        if temp_dir and os.path.isdir(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except Exception:
                pass




# Keep backward-compatible alias (downloads full video — use download_clip_segment instead)
def download_source_video(video_url: str, video_id: str, clips_folder: str) -> str:
    """
    Downloads the full YouTube video ONCE using yt-dlp.
    NOTE: Prefer download_clip_segment() to avoid downloading the entire video.
    Returns the path to the downloaded source MP4 file.
    Raises RuntimeError if download fails.
    """
    os.makedirs(clips_folder, exist_ok=True)
    target_pattern = os.path.join(clips_folder, f'full_{video_id}.mp4')

    if os.path.exists(target_pattern) and os.path.getsize(target_pattern) > 0:
        logger.info(f"Source video full_{video_id}.mp4 already downloaded.")
        return target_pattern

    ffmpeg_exe = get_ffmpeg_path()
    logger.info(f"Using FFmpeg binary at: {ffmpeg_exe}")

    ydl_opts = {
        'format': 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
        'outtmpl': target_pattern,
        'merge_output_format': 'mp4',
        'ffmpeg_location': ffmpeg_exe,
        'quiet': False,
        'no_warnings': True,
        'retries': 5,
        'socket_timeout': 30,
    }

    try:
        logger.info(f"Downloading full source video {video_url} via yt-dlp...")
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([video_url])

        if not os.path.exists(target_pattern) or os.path.getsize(target_pattern) == 0:
            raise RuntimeError("yt-dlp completed but source file was not found or is empty.")

        return target_pattern
    except Exception as e:
        logger.error(f"Download failed for video {video_id}: {e}")
        raise RuntimeError(f"Video download failed: {str(e)}")

def cut_and_format_clip(source_video_path: str, start_seconds: float, duration_seconds: float, output_clip_path: str) -> str:
    """
    Cuts a segment from the local source video and formats it to 9:16 vertical ratio with stereo AAC audio.
    Uses ffmpeg with -preset veryfast for high performance.
    Raises RuntimeError if FFmpeg fails.
    """
    if not os.path.exists(source_video_path):
        raise RuntimeError(f"Source video file not found at {source_video_path}")

    start_seconds = max(0.0, float(start_seconds))
    duration_seconds = max(1.0, float(duration_seconds))

    ffmpeg_exe = get_ffmpeg_path()

    # Build FFmpeg command with fast seeking, 9:16 scale/pad filter, and AAC audio encoding
    cmd = [
        ffmpeg_exe, '-y',
        '-ss', str(start_seconds),
        '-i', source_video_path,
        '-t', str(duration_seconds),
        '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '2',
        '-avoid_negative_ts', 'make_zero',
        output_clip_path
    ]

    logger.info(f"Running FFmpeg cut command: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0 or not os.path.exists(output_clip_path) or os.path.getsize(output_clip_path) == 0:
        error_msg = result.stderr or result.stdout or "Unknown FFmpeg error"
        logger.error(f"FFmpeg failed: {error_msg}")
        raise RuntimeError(f"FFmpeg processing failed: {error_msg}")

    return output_clip_path

def cleanup_source_video(source_video_path: str):
    """Clean up source full video after clips are created"""
    if os.path.exists(source_video_path):
        try:
            os.remove(source_video_path)
            logger.info(f"Cleaned up source video file {source_video_path}")
        except Exception as e:
            logger.warning(f"Could not remove source video file {source_video_path}: {e}")
