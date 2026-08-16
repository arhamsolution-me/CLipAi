import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createCheckoutSession, PLANS } from '@/lib/services/billing';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get clerk user email
    const { planId } = await req.json();
    const plan = PLANS[planId as keyof typeof PLANS];

    if (!plan || planId === 'free') {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    if (!(plan as any).priceId) {
      // Stripe not configured — return a demo message
      return NextResponse.json({ url: null, message: 'Stripe not configured. Add STRIPE_SECRET_KEY and price IDs to .env.local.' });
    }

    const session = await createCheckoutSession(
      (plan as any).priceId,
      userId,
      '' // email will come from clerk session in production
    );

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error('Checkout error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
