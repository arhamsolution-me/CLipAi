import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { brandName, brandColor, watermarkText, position, opacity } = await req.json();

    // Upsert the user into the local database first to satisfy the foreign key constraint
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: `user_${userId}@placeholder.com`,
        name: 'SaaS User',
      },
    });

    const brandKit = await prisma.brandKit.upsert({
      where: { userId },
      update: { brandColor, watermarkText: watermarkText || brandName, position, opacity },
      create: { userId, brandColor, watermarkText: watermarkText || brandName, position, opacity },
    });

    return NextResponse.json({ brandKit });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const brandKit = await prisma.brandKit.findUnique({ where: { userId } });
    return NextResponse.json({ brandKit });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
