"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";

const stats = [
  { label: "Total Projects", value: "0", icon: "📁", color: "bg-indigo-50 text-indigo-600", border: "border-indigo-100" },
  { label: "Clips Generated", value: "0", icon: "🎬", color: "bg-violet-50 text-violet-600", border: "border-violet-100" },
  { label: "Minutes Used", value: "0 / 30", icon: "⏱️", color: "bg-emerald-50 text-emerald-600", border: "border-emerald-100" },
  { label: "Plan", value: "Free", icon: "💳", color: "bg-amber-50 text-amber-600", border: "border-amber-100" },
];

export default function DashboardPage() {
  const { user } = useUser();
  const firstName = user?.firstName || "Creator";

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">
            Welcome back, {firstName} 👋
          </h1>
          <p className="text-slate-400 mt-1 text-sm">Here's what's happening with your clips today.</p>
        </div>
        <Link
          href="/dashboard/create"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-200 hover:opacity-90 transition-opacity text-sm"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Create Project
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className={`bg-white border ${stat.border} rounded-2xl p-5 flex flex-col gap-3 shadow-sm`}>
            <div className={`w-10 h-10 rounded-xl ${stat.color} flex items-center justify-center text-xl`}>
              {stat.icon}
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      <div className="bg-white border border-slate-100 rounded-2xl p-12 flex flex-col items-center text-center gap-5 shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-3xl">
          🎬
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">No projects yet</h2>
          <p className="text-slate-400 text-sm max-w-sm">Paste a YouTube link and let AI find the best viral moments from your video automatically.</p>
        </div>
        <Link
          href="/dashboard/create"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-semibold px-6 py-3 rounded-xl shadow-lg shadow-indigo-200 hover:opacity-90 transition-opacity"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Create Your First Clip
        </Link>
      </div>
    </div>
  );
}
