"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Project = {
  id: string;
  title: string;
  status: string;
  youtubeUrl: string;
  thumbnail?: string;
  createdAt: string;
  _count?: { clips: number };
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(d => { setProjects(d.projects || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const statusBadge: Record<string, string> = {
    processing: 'bg-indigo-50 text-indigo-600 border border-indigo-200',
    completed: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
    failed: 'bg-red-50 text-red-600 border border-red-200',
    pending: 'bg-amber-50 text-amber-600 border border-amber-200',
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Projects</h1>
          <p className="text-slate-400 text-sm mt-1">All your video analysis projects.</p>
        </div>
        <Link href="/dashboard/create" className="inline-flex items-center gap-2 bg-indigo-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-sm hover:bg-indigo-700 transition-colors">
          + New Project
        </Link>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white border border-slate-100 shadow-sm rounded-2xl h-48 animate-pulse" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-12 text-center">
          <div className="text-5xl mb-4">📁</div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">No projects yet</h2>
          <p className="text-slate-500 text-sm mb-6">Create your first project to get started.</p>
          <Link href="/dashboard/create" className="inline-flex items-center gap-2 bg-indigo-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm shadow-sm hover:bg-indigo-700 transition-colors">
            Create Project
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p) => (
            <Link key={p.id} href={`/dashboard/projects/${p.id}`} className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-300 hover:shadow-md transition-all group block shadow-sm">
              <div className="w-full h-36 bg-slate-100 overflow-hidden">
                {p.thumbnail ? (
                  <img src={p.thumbnail} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl">🎬</div>
                )}
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug flex-1">{p.title || "Untitled Project"}</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0 ${statusBadge[p.status] || 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                    {p.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-medium text-slate-400 mt-4">
                  <span>{p._count?.clips ?? 0} clips</span>
                  <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
