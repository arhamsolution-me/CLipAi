import os
import re
import json
import uuid
import logging
from threading import Thread
from datetime import datetime

from flask import Flask, render_template, request, jsonify, send_file
from werkzeug.utils import secure_filename
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from dotenv import load_dotenv
import requests
import redis
from rq import Queue

from models import db, Job, Clip, cleanup_old_data
from services.transcript_service import fetch_youtube_transcript, format_transcript_for_prompt
from services.ai_service import analyze_transcript_highlights, generate_ai_clip_metadata, seconds_to_timestamp, timestamp_to_seconds
from services.video_service import download_source_video, cut_and_format_clip
from tasks import process_job_task

# Configure logging
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s in %(module)s: %(message)s')
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)

# Security & App Configuration
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'yt-upl2-secret-key-change-in-prod')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('SQLALCHEMY_DATABASE_URI', 'sqlite:///yt_upl2.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024 * 1024  # 2 GB upload limit

ALLOWED_VIDEO_EXTENSIONS = {'mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'flv'}

def allowed_video_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_VIDEO_EXTENSIONS

# Initialize Database
db.init_app(app)

with app.app_context():
    db.create_all()
    # Perform 24-hour cleanup on startup
    clips_folder = os.path.join(app.root_path, 'clips')
    cleanup_old_data(db.session, clips_folder, hours=24)

# Initialize Rate Limiter
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

# Redis Queue Initialization with graceful fallback
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
redis_conn = None
rq_queue = None

try:
    redis_conn = redis.from_url(REDIS_URL, socket_timeout=2)
    redis_conn.ping()
    rq_queue = Queue('yt_upl2_jobs', connection=redis_conn)
    logger.info("Connected to Redis and initialized RQ Queue.")
except Exception as redis_err:
    logger.warning(f"Redis unavailable ({redis_err}). Background tasks will run using Thread fallback.")
    redis_conn = None
    rq_queue = None

# Regex for YouTube URL Validation
YOUTUBE_URL_REGEX = re.compile(
    r'^(https?://)?(www\.)?(youtube\.com/(watch\?v=|shorts/)|youtu\.be/)([a-zA-Z0-9_-]{11})(\S*)?$'
)

def extract_video_id(url: str):
    """Strict YouTube URL extraction and validation."""
    if not url or not isinstance(url, str):
        return None
    match = YOUTUBE_URL_REGEX.search(url.strip())
    if match:
        return match.group(5)
    return None

def get_video_metadata(video_id: str):
    """Retrieve video metadata from YouTube API."""
    api_key = os.getenv('YOUTUBE_API_KEY')
    if not api_key:
        raise Exception("YOUTUBE_API_KEY is not configured in .env file.")

    url = 'https://www.googleapis.com/youtube/v3/videos'
    params = {
        'part': 'snippet,statistics,contentDetails',
        'id': video_id,
        'key': api_key
    }

    response = requests.get(url, params=params, timeout=10)
    data = response.json()

    if not data.get('items'):
        raise Exception('YouTube Video not found or access restricted.')

    item = data['items'][0]
    snippet = item['snippet']
    content_details = item.get('contentDetails', {})

    return {
        'title': snippet.get('title', 'YouTube Video'),
        'description': snippet.get('description', ''),
        'thumbnail': snippet.get('thumbnails', {}).get('high', {}).get('url', ''),
        'duration': content_details.get('duration', 'PT0S'),
        'video_id': video_id
    }

def parse_duration(duration_str: str) -> int:
    """Parse YouTube ISO 8601 duration format (PT1H2M3S) to total seconds."""
    pattern = r'PT(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?'
    match = re.match(pattern, duration_str)
    if not match:
        return 0
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds

def probe_local_video_duration(file_path: str) -> float:
    """Use FFmpeg to probe video duration in seconds."""
    from services.video_service import get_ffmpeg_path
    import subprocess
    ffmpeg_exe = get_ffmpeg_path()
    # ffprobe is in the same directory as ffmpeg
    ffprobe_path = os.path.join(os.path.dirname(ffmpeg_exe), 'ffprobe.exe')
    if not os.path.exists(ffprobe_path):
        ffprobe_path = 'ffprobe'
    try:
        result = subprocess.run(
            [ffprobe_path, '-v', 'quiet', '-print_format', 'json',
             '-show_format', '-show_streams', file_path],
            capture_output=True, text=True, timeout=30
        )
        import json as _json
        info = _json.loads(result.stdout)
        duration = float(info.get('format', {}).get('duration', 0))
        if duration <= 0:
            # Try streams
            for stream in info.get('streams', []):
                d = float(stream.get('duration', 0))
                if d > 0:
                    duration = d
                    break
        return duration
    except Exception as e:
        logger.warning(f"ffprobe failed ({e}), falling back to ffmpeg duration probe.")
    # Fallback: use ffmpeg stderr to read duration
    try:
        from services.video_service import get_ffmpeg_path as _ffmp
        result2 = subprocess.run(
            [ffmpeg_exe, '-i', file_path],
            capture_output=True, text=True, timeout=30
        )
        import re as _re
        m = _re.search(r'Duration:\s*(\d+):(\d+):([\d.]+)', result2.stderr)
        if m:
            h, mn, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
            return h * 3600 + mn * 60 + s
    except Exception as e2:
        logger.error(f"FFmpeg duration probe also failed: {e2}")
    return 0


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/analyze', methods=['POST'])
@limiter.limit("5 per minute")
def analyze_video():
    """
    Analyzes YouTube video:
    1. Validates URL
    2. Pulls YouTube video metadata
    3. Fetches transcript via youtube-transcript-api
    4. Scores highlights via Groq AI (or smart fallback)
    5. Generates scroll-stopping titles/descriptions via Groq AI
    6. Stores clips in SQLite database
    """
    data = request.json or {}
    url = data.get('url')
    try:
        num_clips = int(data.get('num_clips', 3))
    except (ValueError, TypeError):
        num_clips = 3
    num_clips = max(1, min(num_clips, 10))

    if not url:
        return jsonify({'error': 'URL parameter is required.'}), 400

    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({'error': 'Invalid or malformed YouTube URL provided.'}), 400

    try:
        # Step A: Get Metadata
        metadata = get_video_metadata(video_id)
        duration_seconds = parse_duration(metadata['duration'])

        # Step B: Fetch Transcript
        transcript_raw = fetch_youtube_transcript(video_id)
        transcript_formatted = format_transcript_for_prompt(transcript_raw) if transcript_raw else None
        
        transcript_fallback = transcript_raw is None
        if transcript_fallback:
            logger.warning(f"[FALLBACK] Transcript unavailable for video {video_id}. Using uniform highlight picking.")

        # Step C: Score highlights using Groq AI
        highlight_segments = analyze_transcript_highlights(
            video_id=video_id,
            transcript_formatted=transcript_formatted,
            duration_seconds=duration_seconds,
            title=metadata['title'],
            description=metadata['description'],
            num_clips=num_clips
        )

        clips_response = []
        
        # Step D: Generate Metadata for each segment
        for index, seg in enumerate(highlight_segments, start=1):
            s_sec = seg['start_seconds']
            e_sec = seg['end_seconds']
            start_ts = seconds_to_timestamp(s_sec)
            end_ts = seconds_to_timestamp(e_sec)

            # Find matching transcript text snippet for Groq metadata prompt
            snippet_text = ""
            if transcript_raw:
                snippet_lines = []
                for item in transcript_raw:
                    start_val = item.start if hasattr(item, 'start') else (item.get('start', 0) if isinstance(item, dict) else 0)
                    text_val = item.text if hasattr(item, 'text') else (item.get('text', '') if isinstance(item, dict) else '')
                    if s_sec <= start_val <= e_sec:
                        snippet_lines.append(str(text_val))
                snippet_text = " ".join(snippet_lines)[:1000]

            ai_meta = generate_ai_clip_metadata(
                original_title=metadata['title'],
                original_description=metadata['description'],
                transcript_snippet=snippet_text,
                start_timestamp=start_ts,
                end_timestamp=end_ts,
                clip_number=index
            )

            # Create Clip in DB
            new_clip = Clip(
                clip_id_num=index,
                video_id=video_id,
                video_url=url,
                start_time=start_ts,
                end_time=end_ts,
                start_seconds=s_sec,
                end_seconds=e_sec,
                title=ai_meta['title'],
                description=ai_meta['description'],
                suggested_tags=json.dumps(ai_meta['tags']),
                reasoning=seg['reasoning'],
                privacy_status='public',
                status='analyzed',
                transcript_fallback=transcript_fallback or seg.get('transcript_fallback', False)
            )
            db.session.add(new_clip)
            db.session.flush()

            clip_dict = new_clip.to_dict()
            clips_response.append(clip_dict)

        db.session.commit()

        return jsonify({
            'metadata': metadata,
            'clips': clips_response
        })

    except Exception as e:
        db.session.rollback()
        logger.error(f"Analysis error for URL {url}: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/api/analyze-local', methods=['POST'])
@limiter.limit("5 per minute")
def analyze_local_video():
    """
    Accepts a video file upload from the user's computer.
    Saves it, probes duration, generates AI clip segments,
    and returns clips ready for the upload pipeline.
    No transcript is available, so uses uniform/AI fallback highlighting.
    """
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided.'}), 400

    file = request.files['video']
    if not file or file.filename == '':
        return jsonify({'error': 'No file selected.'}), 400

    if not allowed_video_file(file.filename):
        allowed_exts = ', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))
        return jsonify({'error': f'Unsupported file type. Allowed: {allowed_exts}'}), 400

    try:
        num_clips = int(request.form.get('num_clips', 3))
    except (ValueError, TypeError):
        num_clips = 3
    num_clips = max(1, min(num_clips, 10))

    custom_title = request.form.get('title', '').strip() or file.filename

    clips_folder = os.path.join(app.root_path, 'clips')
    os.makedirs(clips_folder, exist_ok=True)

    # Save the uploaded file with a unique name
    original_name = secure_filename(file.filename)
    unique_prefix = str(uuid.uuid4())[:8]
    saved_filename = f'upload_{unique_prefix}_{original_name}'
    saved_path = os.path.join(clips_folder, saved_filename)

    try:
        file.save(saved_path)
        logger.info(f"Local upload saved to: {saved_path}")
    except Exception as e:
        return jsonify({'error': f'Failed to save uploaded file: {str(e)}'}), 500

    try:
        duration_seconds = probe_local_video_duration(saved_path)
        if duration_seconds <= 0:
            return jsonify({'error': 'Could not determine video duration. Make sure FFmpeg is installed.'}), 500

        # Generate highlight segments using AI (no transcript available)
        highlight_segments = analyze_transcript_highlights(
            video_id=unique_prefix,
            transcript_formatted=None,
            duration_seconds=duration_seconds,
            title=custom_title,
            description='',
            num_clips=num_clips
        )

        clips_response = []

        for index, seg in enumerate(highlight_segments, start=1):
            s_sec = seg['start_seconds']
            e_sec = seg['end_seconds']
            start_ts = seconds_to_timestamp(s_sec)
            end_ts = seconds_to_timestamp(e_sec)

            ai_meta = generate_ai_clip_metadata(
                original_title=custom_title,
                original_description='',
                transcript_snippet='',
                start_timestamp=start_ts,
                end_timestamp=end_ts,
                clip_number=index
            )

            new_clip = Clip(
                clip_id_num=index,
                video_id=unique_prefix,
                video_url='local:' + saved_path,  # Special marker for local files
                start_time=start_ts,
                end_time=end_ts,
                start_seconds=s_sec,
                end_seconds=e_sec,
                title=ai_meta['title'],
                description=ai_meta['description'],
                suggested_tags=json.dumps(ai_meta['tags']),
                reasoning=seg['reasoning'],
                privacy_status='public',
                status='analyzed',
                transcript_fallback=True
            )
            # Clip is initially un-cut (file_path=None); source is stored in video_url ('local:path')
            db.session.add(new_clip)
            db.session.flush()

            clip_dict = new_clip.to_dict()
            # Include local source info
            clip_dict['local_source'] = True
            clip_dict['source_file'] = saved_path
            clips_response.append(clip_dict)

        db.session.commit()

        metadata = {
            'title': custom_title,
            'description': '',
            'thumbnail': '',
            'duration': f'PT{int(duration_seconds)}S',
            'video_id': unique_prefix,
            'local': True,
            'filename': original_name
        }

        return jsonify({'metadata': metadata, 'clips': clips_response})

    except Exception as e:
        db.session.rollback()
        # Clean up saved file on error
        if os.path.exists(saved_path):
            try:
                os.remove(saved_path)
            except Exception:
                pass
        logger.error(f"Local video analysis error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@app.route('/api/upload', methods=['POST'])
@limiter.limit("5 per minute")
def start_upload():
    """
    Initiates job processing & YouTube upload for selected clips.
    Accepts custom per-clip privacy statuses ('public', 'unlisted', 'private').
    """
    data = request.json or {}
    clips_data = data.get('clips', [])
    access_token = data.get('access_token')

    if not clips_data or not access_token:
        return jsonify({'error': 'Clips and YouTube access_token are required.'}), 400

    try:
        job_id = str(uuid.uuid4())
        new_job = Job(id=job_id, status='pending')
        db.session.add(new_job)

        # Associate clips with job and update privacy statuses
        for clip_item in clips_data:
            clip_id = clip_item.get('id')
            privacy = clip_item.get('privacyStatus', 'public')
            
            db_clip = db.session.query(Clip).filter_by(id=clip_id).first()
            if db_clip:
                db_clip.job_id = job_id
                db_clip.privacy_status = privacy if privacy in ['public', 'unlisted', 'private'] else 'public'
                if clip_item.get('title'):
                    db_clip.title = str(clip_item.get('title')).strip()[:100]
                if clip_item.get('description'):
                    db_clip.description = str(clip_item.get('description')).strip()[:5000]
                db_clip.status = 'pending'

        db.session.commit()

        # Queue via RQ if Redis available, else Thread fallback
        if rq_queue:
            rq_queue.enqueue(process_job_task, job_id, access_token)
            logger.info(f"Job {job_id} enqueued to RQ Queue.")
        else:
            thread = Thread(target=process_job_task, args=(job_id, access_token))
            thread.daemon = True
            thread.start()
            logger.info(f"Job {job_id} launched via Thread fallback.")

        return jsonify({'job_id': job_id})

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error starting upload job: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/status/<job_id>')
@limiter.exempt
def get_job_status(job_id):
    """Query job & clips status from SQLite database (exempt from rate limits for polling)."""
    job = db.session.query(Job).filter_by(id=job_id).first()
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    return jsonify(job.to_dict())

@app.route('/api/download/<int:clip_id>')
@limiter.exempt
def download_clip(clip_id):
    """
    Download cut clip MP4 file directly.
    If not already cut, process clip on-demand.
    """
    clip = db.session.query(Clip).filter_by(id=clip_id).first()
    if not clip:
        return jsonify({'error': 'Clip record not found'}), 404

    clips_folder = os.path.join(app.root_path, 'clips')
    os.makedirs(clips_folder, exist_ok=True)
    expected_path = os.path.join(clips_folder, f'clip_{clip.id}.mp4')

    if clip.file_path and os.path.exists(clip.file_path) and os.path.getsize(clip.file_path) > 0:
        return send_file(clip.file_path, as_attachment=True, download_name=f'clip_{clip.id}.mp4')

    # Cut on-demand if file does not exist yet
    try:
        duration = max(1.0, clip.end_seconds - clip.start_seconds)
        if clip.video_url.startswith('local:'):
            source_path = clip.video_url[len('local:'):]
            if not os.path.exists(source_path):
                return jsonify({'error': 'Local source video file no longer exists on server.'}), 404
            cut_and_format_clip(source_path, clip.start_seconds, duration, expected_path)
        else:
            source_path = download_source_video(clip.video_url, clip.video_id, clips_folder)
            cut_and_format_clip(source_path, clip.start_seconds, duration, expected_path)

        clip.file_path = expected_path
        db.session.commit()

        return send_file(expected_path, as_attachment=True, download_name=f'clip_{clip.id}.mp4')
    except Exception as e:
        logger.error(f"Error generating download for clip {clip_id}: {e}")
        return jsonify({'error': f"Failed to prepare clip download: {str(e)}"}), 500

@app.route('/api/clip/<int:clip_id>/caption-style', methods=['PATCH'])
@limiter.exempt
def update_clip_caption_style(clip_id):
    """
    PATCH endpoint to update clip caption settings (style, font, color, language)
    and re-render captions on the clip file if present.
    """
    clip = db.session.query(Clip).filter_by(id=clip_id).first()
    if not clip:
        return jsonify({'error': 'Clip record not found'}), 404

    data = request.get_json() or {}
    if 'caption_style' in data:
        clip.caption_style = str(data['caption_style'])
    if 'caption_font' in data:
        clip.caption_font = str(data['caption_font'])
    if 'caption_color' in data:
        clip.caption_color = str(data['caption_color'])
    if 'caption_language' in data:
        clip.caption_language = str(data['caption_language'])
    if 'has_captions' in data:
        clip.has_captions = bool(data['has_captions'])

    db.session.commit()

    # Re-render captions if file exists
    clips_folder = os.path.join(app.root_path, 'clips')
    expected_path = os.path.join(clips_folder, f'clip_{clip.id}.mp4')
    raw_path = os.path.join(clips_folder, f'raw_clip_{clip.id}.mp4')

    if os.path.exists(expected_path) or os.path.exists(raw_path):
        try:
            from services.caption_service import process_clip_captions
            source_for_captions = raw_path if os.path.exists(raw_path) else expected_path
            temp_output = os.path.join(clips_folder, f'recap_{clip.id}.mp4')
            duration = max(1.0, clip.end_seconds - clip.start_seconds)

            process_clip_captions(
                clip_video_path=source_for_captions,
                output_video_path=temp_output,
                fallback_transcript=clip.description,
                clip_duration=duration,
                caption_style=clip.caption_style,
                caption_font=clip.caption_font,
                caption_color=clip.caption_color,
                caption_language=clip.caption_language,
                temp_dir=clips_folder
            )

            if os.path.exists(expected_path):
                os.remove(expected_path)
            os.rename(temp_output, expected_path)
            clip.file_path = expected_path
            db.session.commit()
        except Exception as e:
            logger.error(f"Failed to re-render captions for clip {clip_id}: {e}")
            return jsonify({'warning': 'Updated DB settings, but re-render failed', 'error': str(e), 'clip': clip.to_dict()}), 200

    return jsonify({'message': 'Caption style updated successfully', 'clip': clip.to_dict()})

@app.route('/api/admin/cleanup', methods=['POST'])
@limiter.exempt
def trigger_cleanup():
    """Manual endpoint to clean up DB records and clip files older than 24 hours."""
    try:
        clips_folder = os.path.join(app.root_path, 'clips')
        cleanup_old_data(db.session, clips_folder, hours=24)
        return jsonify({'message': '24-hour cleanup executed successfully.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    flask_env = os.getenv('FLASK_ENV', 'development')
    debug_mode = os.getenv('FLASK_DEBUG', '1').lower() in ['1', 'true', 'yes']
    port = int(os.getenv('FLASK_PORT', 5000))
    host = os.getenv('FLASK_HOST', '127.0.0.1')

    logger.info(f"Starting ClipFlow AI Flask server on {host}:{port} (Env: {flask_env}, Debug: {debug_mode})")
    app.run(host=host, port=port, debug=debug_mode)