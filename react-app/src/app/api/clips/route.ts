import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/clips — list all clips owned by the current user
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const clips = await prisma.clip.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ clips });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
