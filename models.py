from datetime import datetime, timedelta
import json
import os
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Job(db.Model):
    __tablename__ = 'jobs'

    id = db.Column(db.String(36), primary_key=True)
    status = db.Column(db.String(20), default='pending')  # pending, processing, completed, failed
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    error_message = db.Column(db.Text, nullable=True)

    clips = db.relationship('Clip', backref='job', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'job_id': self.id,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'error_message': self.error_message,
            'results': [clip.to_dict() for clip in self.clips]
        }

class Clip(db.Model):
    __tablename__ = 'clips'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    clip_id_num = db.Column(db.Integer, nullable=False)  # 1, 2, 3 per video analysis
    job_id = db.Column(db.String(36), db.ForeignKey('jobs.id'), nullable=True)
    video_id = db.Column(db.String(50), nullable=False)
    video_url = db.Column(db.String(255), nullable=False)
    start_time = db.Column(db.String(20), nullable=False)  # MM:SS or H:MM:SS
    end_time = db.Column(db.String(20), nullable=False)
    start_seconds = db.Column(db.Float, nullable=False)
    end_seconds = db.Column(db.Float, nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=False)
    suggested_tags = db.Column(db.Text, nullable=False)  # JSON serialized list
    reasoning = db.Column(db.Text, nullable=True)
    file_path = db.Column(db.String(500), nullable=True)
    privacy_status = db.Column(db.String(20), default='public')  # public, unlisted, private
    status = db.Column(db.String(20), default='analyzed')  # analyzed, downloading, processing, uploading, completed, failed
    error_message = db.Column(db.Text, nullable=True)
    youtube_url = db.Column(db.String(255), nullable=True)
    transcript_fallback = db.Column(db.Boolean, default=False)
    
    # Phase 1 — Animated Captions fields
    has_captions = db.Column(db.Boolean, default=True)
    caption_style = db.Column(db.String(50), default='tiktok_pop')  # tiktok_pop, bounce, highlight_word
    caption_font = db.Column(db.String(100), default='Arial Black')
    caption_color = db.Column(db.String(20), default='#FFFF00')  # Yellow highlight color hex
    caption_language = db.Column(db.String(10), default='auto')  # auto, en, es, fr, ar, ur, de, etc.

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def get_tags(self):
        try:
            return json.loads(self.suggested_tags) if self.suggested_tags else []
        except Exception:
            return []

    def set_tags(self, tags_list):
        self.suggested_tags = json.dumps(tags_list)

    def to_dict(self):
        # Determine progress percentage for UI based on status
        progress_map = {
            'analyzed': 0,
            'downloading': 25,
            'processing': 50,
            'uploading': 75,
            'completed': 100,
            'failed': 100
        }
        return {
            'id': self.id,
            'clip_id_num': self.clip_id_num,
            'job_id': self.job_id,
            'video_id': self.video_id,
            'video_url': self.video_url,
            'startTime': self.start_time,
            'endTime': self.end_time,
            'start_seconds': self.start_seconds,
            'end_seconds': self.end_seconds,
            'title': self.title,
            'description': self.description,
            'suggestedTags': self.get_tags(),
            'reasoning': self.reasoning,
            'privacyStatus': self.privacy_status,
            'status': self.status,
            'error': self.error_message,
            'youtube_url': self.youtube_url,
            'transcript_fallback': self.transcript_fallback,
            'has_captions': self.has_captions if self.has_captions is not None else True,
            'caption_style': self.caption_style or 'tiktok_pop',
            'caption_font': self.caption_font or 'Arial Black',
            'caption_color': self.caption_color or '#FFFF00',
            'caption_language': self.caption_language or 'auto',
            'progress': progress_map.get(self.status, 0)
        }

def cleanup_old_data(db_session, clips_dir, hours=24):
    """Delete clip files and DB records older than `hours` hours"""
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    try:
        old_clips = db_session.query(Clip).filter(Clip.created_at < cutoff).all()
        for clip in old_clips:
            if clip.file_path and os.path.exists(clip.file_path):
                try:
                    os.remove(clip.file_path)
                except Exception as e:
                    print(f"Error removing clip file {clip.file_path}: {e}")
            db_session.delete(clip)

        old_jobs = db_session.query(Job).filter(Job.created_at < cutoff).all()
        for job in old_jobs:
            db_session.delete(job)

        db_session.commit()
    except Exception as e:
        db_session.rollback()
        print(f"Error during database cleanup: {e}")
