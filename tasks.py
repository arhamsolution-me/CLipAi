import os
import json
import logging
import requests
from datetime import datetime

logger = logging.getLogger(__name__)

def upload_clip_to_youtube(clip, access_token: str) -> dict:
    """
    Uploads clip file to YouTube Shorts via YouTube Data API v3.
    Sends standard 2-part multipart metadata/media payload.
    Respects clip.privacy_status ('public', 'unlisted', or 'private').
    Returns dict with success status and video_id / youtube_url or error message.
    """
    if not clip.file_path or not os.path.exists(clip.file_path):
        return {'success': False, 'error': f"Clip file missing at {clip.file_path}"}

    video_metadata = {
        'snippet': {
            'title': clip.title[:100],  # YouTube title limit is 100 chars
            'description': clip.description[:5000],
            'tags': clip.get_tags()[:20],
            'categoryId': '22'  # People & Blogs
        },
        'status': {
            'privacyStatus': clip.privacy_status if clip.privacy_status in ['public', 'unlisted', 'private'] else 'public',
            'selfDeclaredMadeForKids': False
        }
    }

    headers = {
        'Authorization': f'Bearer {access_token}',
        'Accept': 'application/json'
    }

    upload_url = 'https://www.googleapis.com/upload/youtube/v3/videos'
    params = {
        'part': 'snippet,status',
        'uploadType': 'multipart'
    }

    try:
        with open(clip.file_path, 'rb') as video_file:
            # YouTube API expects 2 parts: 'metadata' (JSON snippet+status) and 'media' (video)
            files = {
                'metadata': ('metadata.json', json.dumps(video_metadata), 'application/json'),
                'media': (f'clip_{clip.id}.mp4', video_file, 'video/mp4')
            }
            response = requests.post(upload_url, headers=headers, params=params, files=files)

        if response.status_code == 200:
            result = response.json()
            video_id = result.get('id')
            short_url = f'https://youtube.com/shorts/{video_id}'
            return {
                'success': True,
                'video_id': video_id,
                'url': short_url,
                'message': f'Uploaded successfully ({clip.privacy_status})'
            }
        else:
            err_details = response.text
            try:
                err_json = response.json()
                err_details = err_json.get('error', {}).get('message', response.text)
            except Exception:
                pass
            return {'success': False, 'error': f"YouTube API Error ({response.status_code}): {err_details}"}

    except Exception as e:
        logger.error(f"Exception uploading clip {clip.id} to YouTube: {e}")
        return {'success': False, 'error': f"Upload connection error: {str(e)}"}

def process_job_task(job_id: str, access_token: str, app_factory_func=None):
    """
    RQ / Background worker task to execute YouTube download, FFmpeg trimming, and YouTube upload.
    Automatically deletes local clip files upon successful YouTube upload.
    """
    from app import app, db
    from models import Job, Clip
    from services.video_service import download_clip_segment, cut_and_format_clip, cleanup_source_video

    with app.app_context():
        job = db.session.query(Job).filter_by(id=job_id).first()
        if not job:
            logger.error(f"Job {job_id} not found in DB.")
            return

        job.status = 'processing'
        job.updated_at = datetime.utcnow()
        db.session.commit()

        clips = db.session.query(Clip).filter_by(job_id=job_id).all()
        if not clips:
            logger.error(f"No clips associated with job {job_id}")
            job.status = 'failed'
            job.error_message = 'No clips associated with job'
            db.session.commit()
            return

        clips_folder = os.path.join(app.root_path, 'clips')

        # STEP 1, 2 & 3: For each clip — download its segment, cut, and upload
        any_success = False

        for clip in clips:
            output_clip_path = os.path.join(clips_folder, f'clip_{clip.id}.mp4')
            seg_path = None
            is_local_source = clip.video_url.startswith('local:')

            if is_local_source:
                # Sub-step 1 (Local): Use the already-saved local file directly
                local_source_path = clip.video_url[len('local:'):]
                if not os.path.exists(local_source_path):
                    error_msg = f"Local source file missing: {local_source_path}"
                    logger.error(f"Clip {clip.id}: {error_msg}")
                    clip.status = 'failed'
                    clip.error_message = error_msg
                    db.session.commit()
                    continue
                seg_path = local_source_path
                logger.info(f"Clip {clip.id}: Using local source file at {seg_path}")
            else:
                # Sub-step 1: Download only the needed segment (not the full video)
                clip.status = 'downloading'
                db.session.commit()

                try:
                    seg_path = download_clip_segment(
                        video_url=clip.video_url,
                        clip_id=str(clip.id),
                        start_seconds=clip.start_seconds,
                        end_seconds=clip.end_seconds,
                        clips_folder=clips_folder
                    )
                except Exception as download_err:
                    error_msg = f"Step 1 Failed (Download): {str(download_err)}"
                    logger.error(f"Clip {clip.id} download failed: {error_msg}")
                    clip.status = 'failed'
                    clip.error_message = error_msg
                    db.session.commit()
                    continue

            # Sub-step 2: FFmpeg crop to exact timestamps & reformat to 9:16
            clip.status = 'processing'
            db.session.commit()

            try:
                duration = max(1.0, clip.end_seconds - clip.start_seconds)
                if is_local_source:
                    # For local files, cut from the absolute start_seconds in the original file
                    seg_offset = clip.start_seconds
                else:
                    # The segment was downloaded starting from (start - buffer), so
                    # the clip starts at buffer offset (2s) within the segment file.
                    seg_offset = min(clip.start_seconds, 2.0)
                cut_and_format_clip(
                    source_video_path=seg_path,
                    start_seconds=seg_offset,
                    duration_seconds=duration,
                    output_clip_path=output_clip_path
                )
                clip.file_path = output_clip_path
                db.session.commit()
            except Exception as ffmpeg_err:
                error_msg = f"Step 2 Failed (FFmpeg): {str(ffmpeg_err)}"
                logger.error(f"Clip {clip.id} FFmpeg error: {error_msg}")
                clip.status = 'failed'
                clip.error_message = error_msg
                db.session.commit()
            finally:
                # Clean up segment file after FFmpeg, but NEVER delete the original local source
                if not is_local_source and seg_path and os.path.exists(seg_path):
                    try:
                        os.remove(seg_path)
                        logger.info(f"Cleaned up segment file: {seg_path}")
                    except Exception as e:
                        logger.warning(f"Could not remove segment file {seg_path}: {e}")

            if clip.status == 'failed':
                continue

            # Sub-step 3: Upload to YouTube
            clip.status = 'uploading'
            db.session.commit()

            upload_result = upload_clip_to_youtube(clip, access_token)
            if upload_result['success']:
                clip.status = 'completed'
                clip.youtube_url = upload_result.get('url')
                clip.error_message = None
                any_success = True

                # AUTOMATIC DELETION: Remove local clip file from disk after successful upload
                if clip.file_path and os.path.exists(clip.file_path):
                    try:
                        os.remove(clip.file_path)
                        logger.info(f"Successfully deleted local clip file after upload: {clip.file_path}")
                        clip.file_path = None
                    except Exception as del_err:
                        logger.warning(f"Could not delete clip file {clip.file_path}: {del_err}")
            else:
                error_msg = f"Step 3 Failed (Upload): {upload_result.get('error')}"
                clip.status = 'failed'
                clip.error_message = error_msg

            db.session.commit()

        job.status = 'completed' if any_success else 'failed'
        if not any_success:
            job.error_message = 'All clip processing/upload steps failed'
        job.updated_at = datetime.utcnow()
        db.session.commit()
        logger.info(f"Job {job_id} finished processing with status: {job.status}")
