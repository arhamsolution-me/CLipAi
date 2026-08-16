"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

function formatSecondsToTime(secs: number) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function ClipCard({ clip, projectThumbnail }: { clip: any, projectThumbnail: string }) {
    const [aspectRatio, setAspectRatio] = useState('9:16');
    const [hasCaptions, setHasCaptions] = useState(true);
    const [isDownloading, setIsDownloading] = useState(false);

    const durationSecs = clip.endSeconds - clip.startSeconds;
    const tags = (() => { try { return JSON.parse(clip.suggestedTags); } catch { return []; } })();

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            const res = await fetch(`/api/download/${clip.id}?aspect=${aspectRatio}&captions=${hasCaptions}`);
            if (!res.ok) throw new Error('Download failed on server');
            
            const data = await res.json();
            if (!data.url) throw new Error('No download URL returned');
            
            // Trigger direct download via browser
            const a = document.createElement('a');
            a.href = data.url;
            a.download = `clip_${clip.clipIdNum}_${aspectRatio.replace(':', 'x')}.mp4`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (e: any) {
            alert('Download failed: ' + e.message);
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col group hover:shadow-md hover:border-indigo-300 transition-all shadow-sm">
            <div className="relative w-full aspect-video bg-slate-100 overflow-hidden">
                <img src={projectThumbnail} alt="Thumbnail" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-md text-[11px] font-semibold text-white">
                    {formatSecondsToTime(durationSecs)}
                </div>
                <div className="absolute top-2 left-2 bg-indigo-600/90 px-2 py-0.5 rounded-md text-[10px] font-bold text-white uppercase tracking-wide">
                    Clip {clip.clipIdNum}
                </div>
            </div>
            
            <div className="p-5 flex flex-col flex-1 gap-4">
                <h3 className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">{clip.title}</h3>
                
                {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {tags.slice(0,3).map((tag: string) => (
                            <span key={tag} className="text-[10px] bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded-full font-medium">{tag}</span>
                        ))}
                    </div>
                )}

                {/* Configuration Controls */}
                <div className="grid grid-cols-2 gap-3 mt-auto bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Format</label>
                        <select 
                            value={aspectRatio} 
                            onChange={(e) => setAspectRatio(e.target.value)}
                            className="w-full text-xs font-medium bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400"
                        >
                            <option value="9:16">9:16 (Shorts)</option>
                            <option value="16:9">16:9 (YouTube)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Captions</label>
                        <select 
                            value={hasCaptions ? "true" : "false"} 
                            onChange={(e) => setHasCaptions(e.target.value === "true")}
                            className="w-full text-xs font-medium bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400"
                        >
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleDownload} disabled={isDownloading}
                        className="flex-1 bg-indigo-600 text-white text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 hover:bg-indigo-700 transition-colors disabled:opacity-60 shadow-sm"
                    >
                        {isDownloading ? (
                            <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Rendering...</>
                        ) : (
                            <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> Render & Download</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ProjectDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const [project, setProject] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!params.id) return;
        fetch(`/api/projects/${params.id}`)
            .then(r => r.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                setProject(data.project);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [params.id]);

    if (loading) {
        return (
            <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
                <div className="h-8 bg-slate-200 rounded w-1/3"></div>
                <div className="h-48 bg-slate-200 rounded-2xl"></div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="h-64 bg-slate-200 rounded-2xl"></div>
                    <div className="h-64 bg-slate-200 rounded-2xl"></div>
                    <div className="h-64 bg-slate-200 rounded-2xl"></div>
                </div>
            </div>
        );
    }

    if (error || !project) {
        return (
            <div className="max-w-5xl mx-auto text-center py-20">
                <div className="text-4xl mb-4">⚠️</div>
                <h2 className="text-xl font-bold text-slate-800">Project Not Found</h2>
                <p className="text-slate-500 mt-2">{error}</p>
                <Link href="/dashboard/projects" className="text-indigo-600 font-medium mt-4 inline-block">← Back to Projects</Link>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button onClick={() => router.push('/dashboard/projects')} className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors shadow-sm">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 line-clamp-1">{project.title || "Untitled Project"}</h1>
                    <p className="text-slate-400 text-sm mt-0.5">Created on {new Date(project.createdAt).toLocaleDateString()}</p>
                </div>
            </div>

            {/* Clips Grid */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-800">Generated Clips</h2>
                    <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{project.clips?.length || 0} clips ready</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {!project.clips || project.clips.length === 0 ? (
                        <div className="col-span-full bg-white border border-slate-100 rounded-2xl p-12 text-center shadow-sm">
                            <span className="text-4xl">⏳</span>
                            <h3 className="text-lg font-bold text-slate-800 mt-4">Clips are processing</h3>
                            <p className="text-slate-500 text-sm mt-1">Check back in a few minutes.</p>
                        </div>
                    ) : (
                        project.clips.map((clip: any) => (
                            <ClipCard key={clip.id} clip={clip} projectThumbnail={project.thumbnail} />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
