import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/projects — list current user's projects
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { clips: true } } },
    });

    return NextResponse.json({ projects });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/projects — create a new project shell
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { youtubeUrl, title } = await req.json();
    if (!youtubeUrl) return NextResponse.json({ error: 'youtubeUrl required' }, { status: 400 });

    const videoIdMatch = youtubeUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    const videoId = videoIdMatch ? videoIdMatch[1] : '';

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

    const project = await prisma.project.create({
      data: {
        userId,
        title: title || 'New Project',
        youtubeUrl,
        videoId,
        status: 'pending',
      },
    });

    // Create a tracking job
    await prisma.job.create({
      data: {
        type: 'analyze_video',
        status: 'queued',
        projectId: project.id,
        progress: 0,
      },
    });

    return NextResponse.json({ project });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
