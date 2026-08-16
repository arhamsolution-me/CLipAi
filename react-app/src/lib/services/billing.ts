import Stripe from 'stripe';

// ─── Stripe client ───────────────────────────────────────────────────────────
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-06-30.basil' })
  : null;

// ─── Plan definitions ────────────────────────────────────────────────────────
export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    processingMinutes: 30,
    clipsPerVideo: 5,
    hdExport: false,
    customBranding: false,
    hasWatermark: true,
    priority: 'LOW',
    storageRetentionDays: 7,
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 9,
    priceId: process.env.STRIPE_STARTER_PRICE_ID,
    processingMinutes: 120,
    clipsPerVideo: 15,
    hdExport: true,
    customBranding: false,
    hasWatermark: false,
    priority: 'NORMAL',
    storageRetentionDays: 30,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 29,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    processingMinutes: 300,
    clipsPerVideo: 50,
    hdExport: true,
    customBranding: true,
    hasWatermark: false,
    priority: 'HIGH',
    storageRetentionDays: 90,
  },
  business: {
    id: 'business',
    name: 'Business',
    price: 99,
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID,
    processingMinutes: 9999,
    clipsPerVideo: 999,
    hdExport: true,
    customBranding: true,
    hasWatermark: false,
    priority: 'PRIORITY',
    storageRetentionDays: 365,
  },
} as const;

export type PlanId = keyof typeof PLANS;

// ─── Entitlement checks ──────────────────────────────────────────────────────
export function getPlan(planId: string) {
  return PLANS[planId as PlanId] ?? PLANS.free;
}

export function canGenerateClips(planId: string, currentUsage: number, requested: number): boolean {
  const plan = getPlan(planId);
  return currentUsage + requested <= plan.clipsPerVideo;
}

export function canExportHD(planId: string): boolean {
  return getPlan(planId).hdExport;
}

export function hasWatermark(planId: string): boolean {
  return getPlan(planId).hasWatermark;
}

export function canUseCustomBranding(planId: string): boolean {
  return getPlan(planId).customBranding;
}

export function hasEnoughMinutes(planId: string, usedMinutes: number, requestedMinutes: number): boolean {
  const plan = getPlan(planId);
  return usedMinutes + requestedMinutes <= plan.processingMinutes;
}

// ─── Create Stripe checkout session ─────────────────────────────────────────
export async function createCheckoutSession(priceId: string, userId: string, userEmail: string) {
  if (!stripe) throw new Error('Stripe not configured');
  return await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: userEmail,
    metadata: { userId },
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  });
}

// ─── Create customer portal session ─────────────────────────────────────────
export async function createPortalSession(stripeCustomerId: string) {
  if (!stripe) throw new Error('Stripe not configured');
  return await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  });
}
