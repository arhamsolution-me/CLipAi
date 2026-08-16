"use client";

import { useUser } from "@clerk/nextjs";
import { PLANS } from "@/lib/services/billing";

const plans = Object.values(PLANS);

export default function BillingPage() {
  const { user } = useUser();
  const currentPlan = "free"; // will be fetched from DB in future

  const handleUpgrade = async (planId: string) => {
    if (planId === 'free') return;
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert('Stripe is not configured yet. Add STRIPE_SECRET_KEY to your .env.local to enable billing.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Billing & Plans</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your subscription and usage.</p>
      </div>

      {/* Current plan */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide font-bold mb-1">Current Plan</p>
            <p className="text-xl font-bold text-slate-900 capitalize">{currentPlan}</p>
            <p className="text-sm text-slate-500 mt-1 font-medium">{user?.emailAddresses[0]?.emailAddress}</p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-3 text-center">
            <p className="text-2xl font-bold text-indigo-700">0 / 30</p>
            <p className="text-xs text-indigo-500 mt-0.5 font-semibold">minutes used</p>
          </div>
        </div>
      </div>

      {/* Plans grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isHighlighted = plan.id === 'pro';
          return (
            <div key={plan.id} className={`rounded-2xl p-6 flex flex-col gap-4 border bg-white ${
              isHighlighted
                ? 'border-indigo-300 shadow-md shadow-indigo-100 relative'
                : 'border-slate-200 shadow-sm'
            }`}>
              {isHighlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r from-indigo-500 to-violet-600 text-white px-3 py-1 rounded-full w-fit">
                  Popular
                </span>
              )}
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-extrabold text-slate-900">${plan.price}</span>
                  {plan.price > 0 && <span className="text-xs font-semibold text-slate-500">/mo</span>}
                </div>
              </div>

              <ul className="space-y-2.5 flex-1 text-xs text-slate-600 font-medium">
                <li className="flex items-center gap-2"><span className="text-emerald-500 font-bold">✓</span>{plan.processingMinutes === 9999 ? 'Unlimited' : plan.processingMinutes} min/mo</li>
                <li className="flex items-center gap-2"><span className="text-emerald-500 font-bold">✓</span>{plan.clipsPerVideo === 999 ? 'Unlimited' : plan.clipsPerVideo} clips/video</li>
                <li className="flex items-center gap-2"><span className={plan.hdExport ? 'text-emerald-500 font-bold' : 'text-slate-300'}>{plan.hdExport ? '✓' : '✗'}</span> HD Export</li>
                <li className="flex items-center gap-2"><span className={!plan.hasWatermark ? 'text-emerald-500 font-bold' : 'text-slate-300'}>{!plan.hasWatermark ? '✓' : '✗'}</span> No Watermark</li>
                <li className="flex items-center gap-2"><span className={plan.customBranding ? 'text-emerald-500 font-bold' : 'text-slate-300'}>{plan.customBranding ? '✓' : '✗'}</span> Custom Branding</li>
              </ul>

              <button
                onClick={() => handleUpgrade(plan.id)}
                disabled={isCurrent}
                className={`w-full text-sm font-bold py-2.5 rounded-xl transition-all ${
                  isCurrent
                    ? 'bg-slate-100 text-slate-400 cursor-default'
                    : isHighlighted
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-200'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm'
                }`}
              >
                {isCurrent ? 'Current Plan' : plan.price === 0 ? 'Downgrade' : 'Upgrade'}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs font-medium text-slate-400 text-center">
        Stripe integration active when STRIPE_SECRET_KEY is set in .env.local · Payments are handled securely by Stripe.
      </p>
    </div>
  );
}
