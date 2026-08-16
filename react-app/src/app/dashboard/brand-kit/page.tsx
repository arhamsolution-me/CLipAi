"use client";

import { useState } from "react";

export default function BrandKitPage() {
  const [brandName, setBrandName] = useState("");
  const [brandColor, setBrandColor] = useState("#6366f1");
  const [watermarkText, setWatermarkText] = useState("");
  const [position, setPosition] = useState("bottom-right");
  const [opacity, setOpacity] = useState(0.8);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    const res = await fetch('/api/brand-kit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandName, brandColor, watermarkText, position, opacity }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Brand Kit</h1>
        <p className="text-slate-500 text-sm mt-1">Customize how your brand appears on exported clips.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm font-medium text-amber-700 flex items-center gap-2 shadow-sm">
        <span>💳</span> Custom branding is available on <strong className="text-amber-800">Pro</strong> and above plans.
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Watermark Text</h2>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Brand Name / Handle</label>
          <input
            value={brandName}
            onChange={e => setBrandName(e.target.value)}
            placeholder="@yourhandle"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder-slate-400 transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Watermark Text</label>
          <input
            value={watermarkText}
            onChange={e => setWatermarkText(e.target.value)}
            placeholder="ClipAI · @brand"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder-slate-400 transition-all"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Brand Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={brandColor}
                onChange={e => setBrandColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-slate-200 bg-white cursor-pointer shadow-sm p-0.5"
              />
              <span className="text-sm font-bold text-slate-700 font-mono">{brandColor}</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Position</label>
            <select
              value={position}
              onChange={e => setPosition(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
            >
              <option value="bottom-right">Bottom Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="top-right">Top Right</option>
              <option value="top-left">Top Left</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Opacity: <span className="text-indigo-600 font-bold">{Math.round(opacity * 100)}%</span></label>
          <input
            type="range"
            min="0.2"
            max="1"
            step="0.05"
            value={opacity}
            onChange={e => setOpacity(Number(e.target.value))}
            className="w-full accent-indigo-600"
          />
        </div>

        {/* Preview */}
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-2">Preview</label>
          <div className="w-full h-32 bg-slate-100 rounded-xl border border-slate-200 relative overflow-hidden flex items-center justify-center shadow-inner">
            <span className="text-slate-400 text-sm font-medium">Video Preview Area</span>
            <span
              className="absolute text-xs font-bold px-2 py-1 rounded shadow-sm"
              style={{
                color: brandColor,
                opacity,
                bottom: position.includes('bottom') ? '8px' : undefined,
                top: position.includes('top') ? '8px' : undefined,
                right: position.includes('right') ? '8px' : undefined,
                left: position.includes('left') ? '8px' : undefined,
                backgroundColor: 'rgba(255,255,255,0.9)',
                border: '1px solid rgba(0,0,0,0.1)'
              }}
            >
              {watermarkText || brandName || "@yourhandle"}
            </span>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="bg-indigo-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-sm"
        >
          {saved ? <><span>✓</span> Saved!</> : 'Save Brand Kit'}
        </button>
      </div>
    </div>
  );
}
