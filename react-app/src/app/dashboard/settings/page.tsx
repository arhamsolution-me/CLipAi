"use client";

import { useUser } from "@clerk/nextjs";
import { useState } from "react";

export default function SettingsPage() {
  const { user } = useUser();
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your account preferences.</p>
      </div>

      {/* Profile */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-800">Profile</h2>
        <div className="flex items-center gap-4">
          {user?.imageUrl ? (
            <img src={user.imageUrl} alt="Avatar" className="w-14 h-14 rounded-full border border-slate-100 shadow-sm" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-xl font-bold text-white shadow-sm">
              {user?.firstName?.[0] || '?'}
            </div>
          )}
          <div>
            <p className="font-bold text-slate-900">{user?.fullName || "—"}</p>
            <p className="text-sm font-medium text-slate-500">{user?.emailAddresses[0]?.emailAddress}</p>
          </div>
        </div>
        <p className="text-xs font-medium text-slate-400">Profile info is managed via Clerk. Click the avatar in the top-right to update your name or profile picture.</p>
      </div>

      {/* Default clip settings */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-800">Default Clip Settings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Default Clips Per Video</label>
            <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-medium">
              {[3, 5, 6, 8, 10].map(n => <option key={n} value={n}>{n} clips</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Output Format</label>
            <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-medium">
              <option>9:16 (TikTok / Reels)</option>
              <option>1:1 (Square)</option>
              <option>16:9 (YouTube)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Caption Style</label>
            <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-medium">
              <option>TikTok Pop (Bold Yellow)</option>
              <option>Minimal White</option>
              <option>Viral Highlight</option>
              <option>None</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Export Quality</label>
            <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all font-medium">
              <option>720p (Standard)</option>
              <option>1080p (HD - Pro+)</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="bg-indigo-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-sm"
        >
          {saved ? <><span>✓</span> Saved!</> : 'Save Preferences'}
        </button>
      </div>

      {/* Danger zone */}
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 space-y-4 shadow-sm">
        <h2 className="text-base font-bold text-red-600">Danger Zone</h2>
        <p className="text-sm font-medium text-red-400/80">Permanently delete your account and all associated data. This action cannot be undone.</p>
        <button className="bg-white border border-red-200 text-red-600 text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-red-50 transition-colors shadow-sm">
          Delete Account
        </button>
      </div>
    </div>
  );
}
