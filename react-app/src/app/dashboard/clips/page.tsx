"use client";

import { useEffect, useState } from "react";

type Clip = {
  id: string;
  title: string;
  status: string;
  startSeconds: number;
  endSeconds: number;
  suggestedTags: string;
  storageUrl?: string;
  createdAt: string;
};

export default function ClipsPage() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/clips')
      .then(r => r.json())
      .then(d => { setClips(d.clips || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleDownload = async (clip: Clip) => {
    setDownloadingId(clip.id);
    try {
      const res = await fetch(`/api/download/${clip.id}`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${clip.title || 'clip'}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Download failed: ' + e.message);
    } finally {
      setDownloadingId(null);
    }
  };

  const statusBadge: Record<string, string> = {
    analyzed: 'bg-indigo-50 text-indigo-600 border border-indigo-200',
    rendering: 'bg-amber-50 text-amber-600 border border-amber-200',
    completed: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
    failed: 'bg-red-50 text-red-600 border border-red-200',
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">My Clips</h1>
        <p className="text-slate-400 text-sm mt-1">All your generated AI clips.</p>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white border border-slate-100 shadow-sm rounded-2xl h-52 animate-pulse" />
          ))}
        </div>
      ) : clips.length === 0 ? (
        <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-12 text-center">
          <div className="text-5xl mb-4">🎬</div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">No clips yet</h2>
          <p className="text-slate-500 text-sm">Create a project to generate your first clips.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clips.map((clip) => {
            const duration = clip.endSeconds - clip.startSeconds;
            const tags = (() => { try { return JSON.parse(clip.suggestedTags); } catch { return []; } })();
            const isDownloading = downloadingId === clip.id;

            return (
              <div key={clip.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col hover:border-indigo-300 hover:shadow-md transition-all shadow-sm">
                <div className="w-full aspect-[9/5] bg-slate-50 flex items-center justify-center border-b border-slate-100 relative">
                    <div className="absolute inset-0 bg-indigo-50/50 mix-blend-multiply pointer-events-none" />
                  <span className="text-4xl opacity-50 relative z-10">🎞️</span>
                </div>
                <div className="p-5 flex flex-col flex-1 gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-800 line-clamp-2 flex-1 leading-snug">{clip.title}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0 ${statusBadge[clip.status] || 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                      {clip.status}
                    </span>
                  </div>

                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.slice(0, 3).map((tag: string) => (
                        <span key={tag} className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-2.5 py-0.5 rounded-full font-medium">{tag}</span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs font-medium text-slate-400 mt-auto">
                    <span>⏱ {formatTime(duration)}</span>
                    <span>{new Date(clip.createdAt).toLocaleDateString()}</span>
                  </div>

                  <button
                    onClick={() => handleDownload(clip)}
                    disabled={isDownloading}
                    className="w-full bg-indigo-600 text-white text-xs font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1.5 hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-wait shadow-sm"
                  >
                    {isDownloading ? (
                      <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Downloading...</>
                    ) : (
                      <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> Download MP4</>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
