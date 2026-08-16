"use client";

import Link from "next/link";

const features = [
  { icon: "🤖", title: "AI Moment Detection", desc: "Groq Llama 3 analyzes your transcript and identifies the highest-value 60-second segments automatically." },
  { icon: "📱", title: "9:16 Auto-Format", desc: "Every clip is automatically converted to vertical short-form format ready for TikTok, Reels, and Shorts." },
  { icon: "⚡", title: "Instant Processing", desc: "Powered by Groq's ultra-fast inference. Get your clips analyzed in seconds, not minutes." },
  { icon: "🎬", title: "Smart Trimming", desc: "AI finds natural sentence boundaries so clips never cut off mid-thought or mid-word." },
  { icon: "🏷️", title: "Auto Metadata", desc: "Get AI-generated titles, descriptions, and viral hashtags for every single clip automatically." },
  { icon: "⬇️", title: "One-Click Export", desc: "Download your finished clips directly as MP4 files with no watermarks on paid plans." },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    per: "forever",
    features: ["30 processing minutes/mo", "Up to 5 clips per video", "Standard 720p export", "Platform watermark", "Basic support"],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$29",
    per: "per month",
    features: ["300 processing minutes/mo", "Unlimited clips per video", "1080p HD export", "No watermark", "Custom branding", "Priority processing", "Priority support"],
    cta: "Start Pro",
    highlight: true,
  },
  {
    name: "Business",
    price: "$99",
    per: "per month",
    features: ["Unlimited processing", "Team workspace", "API access", "Advanced analytics", "Custom integrations", "Dedicated support"],
    cta: "Contact Sales",
    highlight: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-slate-200 bg-white/80 backdrop-blur-xl shadow-sm">
        <div className="max-w-6xl mx-auto h-full flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-white text-sm shadow-md">G</div>
            <span className="text-lg font-bold text-slate-800 tracking-tight">ClipAI</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-500">
            <a href="#features" className="hover:text-indigo-600 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-indigo-600 transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors px-4 py-2">Sign In</Link>
            <Link href="/sign-up" className="bg-slate-900 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-800 transition-colors shadow-sm">
              Get Started Free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-24 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-100 blur-[120px] rounded-full" />
        </div>
        <div className="max-w-3xl mx-auto relative">
          <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-1.5 text-sm text-slate-600 font-medium mb-8 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Powered by Groq AI – Llama 3
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6 text-slate-900">
            Turn Long Videos into<br />
            <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              Viral Short Clips
            </span>
          </h1>
          <p className="text-xl text-slate-500 mb-10 max-w-xl mx-auto leading-relaxed">
            Paste a YouTube URL. Our AI automatically finds the best moments, formats them for TikTok/Reels/Shorts, and lets you download in one click.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up" className="inline-flex items-center gap-2 bg-indigo-600 text-white font-semibold px-8 py-4 rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-colors text-lg">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              Start for Free
            </Link>
            <a href="#features" className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 font-semibold px-8 py-4 rounded-xl hover:bg-slate-50 transition-colors shadow-sm text-lg">
              See How It Works
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-4 bg-white border-y border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-slate-900">Everything You Need</h2>
            <p className="text-slate-500 text-lg">A complete AI pipeline from YouTube URL to downloadable short-form clip.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="bg-slate-50 border border-slate-100 rounded-2xl p-8 hover:border-indigo-100 hover:shadow-md transition-all">
                <div className="text-3xl mb-5">{f.icon}</div>
                <h3 className="font-bold text-slate-900 mb-2 text-lg">{f.title}</h3>
                <p className="text-slate-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-slate-900">Simple Pricing</h2>
            <p className="text-slate-500 text-lg">Start free, upgrade when you need more.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div key={plan.name} className={`rounded-3xl p-8 flex flex-col gap-6 border bg-white ${
                plan.highlight
                  ? "border-indigo-200 shadow-xl shadow-indigo-100 relative"
                  : "border-slate-200 shadow-sm"
              }`}>
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-[11px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full">
                    Most Popular
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-4xl font-extrabold text-slate-900">{plan.price}</span>
                    <span className="text-sm font-medium text-slate-500">/{plan.per}</span>
                  </div>
                </div>
                <ul className="space-y-3.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm font-medium text-slate-600">
                      <svg className="w-5 h-5 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/sign-up"
                  className={`w-full text-center font-bold py-3.5 rounded-xl text-sm transition-all ${
                    plan.highlight
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700"
                      : "bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 text-center bg-indigo-600 text-white">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-bold mb-6">Ready to go viral?</h2>
          <p className="text-indigo-100 text-lg mb-10">Join creators repurposing their long-form content into short-form hits with AI.</p>
          <Link href="/sign-up" className="inline-flex items-center gap-2 bg-white text-indigo-600 font-bold px-8 py-4 rounded-xl shadow-xl hover:bg-indigo-50 transition-colors text-lg">
            Start Creating for Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-slate-200 text-center text-sm font-medium text-slate-500 bg-white">
        <p>© 2026 ClipAI. All rights reserved.</p>
      </footer>
    </div>
  );
}
