"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

const loadingTexts = [
    "Downloading transcript...",
    "Analyzing with Groq AI...",
    "Scoring viral moments...",
    "Trimming highlights..."
];

export default function CreateProjectPage() {
    const [url, setUrl] = useState("");
    const [numClips, setNumClips] = useState(6);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState(loadingTexts[0]);
    const [loadingStep, setLoadingStep] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const loadingInterval = useRef<NodeJS.Timeout | null>(null);
    const router = useRouter();

    useEffect(() => {
        if (isLoading) {
            let textIdx = 0;
            loadingInterval.current = setInterval(() => {
                textIdx = (textIdx + 1) % loadingTexts.length;
                setLoadingText(loadingTexts[textIdx]);
                setLoadingStep(textIdx);
            }, 3000);
        } else {
            if (loadingInterval.current) clearInterval(loadingInterval.current);
        }
        return () => { if (loadingInterval.current) clearInterval(loadingInterval.current); };
    }, [isLoading]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url.trim()) return;
        setIsLoading(true); setError(null); setLoadingStep(0);
        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url.trim(), num_clips: numClips })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to process video.');
            
            // Redirect to the new Project Details page!
            if (result.clips && result.clips.length > 0 && result.clips[0].projectId) {
                router.push(`/dashboard/projects/${result.clips[0].projectId}`);
            } else {
                throw new Error('Project created but no ID was returned.');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred.');
            setIsLoading(false);
        }
    };

    const steps = ["Downloading transcript", "Analyzing with AI", "Scoring moments", "Building clips"];

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Create New Project</h1>
                <p className="text-slate-400 text-sm mt-1">Paste a YouTube URL and AI will find the best viral moments.</p>
            </div>

            {/* Input card */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 md:p-8 shadow-sm">
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">YouTube URL</label>
                        <div className="relative flex items-center">
                            <svg className="absolute left-3.5 w-5 h-5 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                            </svg>
                            <input
                                type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                                required disabled={isLoading}
                                placeholder="https://www.youtube.com/watch?v=..."
                                className="w-full bg-slate-50 text-slate-800 placeholder-slate-400 rounded-xl py-3.5 pl-11 pr-4 border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all text-sm disabled:opacity-50"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Number of Clips: <span className="text-indigo-600 font-bold">{numClips}</span>
                        </label>
                        <input type="range" min="1" max="10" value={numClips}
                            onChange={(e) => setNumClips(Number(e.target.value))}
                            disabled={isLoading} className="w-full accent-indigo-500"
                        />
                        <div className="flex justify-between text-xs text-slate-400 mt-1"><span>1</span><span>10</span></div>
                    </div>

                    <button
                        type="submit" disabled={isLoading || !url.trim()}
                        className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-semibold py-3 rounded-xl shadow-lg shadow-indigo-200 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Analyzing...</>
                        ) : (
                            <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>Generate Clips with AI</>
                        )}
                    </button>
                </form>
            </div>

            {/* Loading pipeline */}
            {isLoading && (
                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                    <p className="text-sm font-medium text-slate-500 mb-4">Processing your video...</p>
                    <div className="space-y-3">
                        {steps.map((step, i) => (
                            <div key={step} className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                    i < loadingStep ? 'bg-green-500 border-green-500' :
                                    i === loadingStep ? 'border-indigo-400 animate-spin' : 'border-slate-200'
                                }`}>
                                    {i < loadingStep && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <span className={`text-sm ${i <= loadingStep ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>{step}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-indigo-500 mt-4 animate-pulse font-medium">{loadingText}</p>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-5 py-4 rounded-xl flex items-start gap-3">
                    <span className="text-xl flex-shrink-0">⚠️</span>
                    <span className="text-sm">{error}</span>
                </div>
            )}
        </div>
    );
}
