import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const resolvedParams = await props.params;
    const projectId = resolvedParams.id;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        clips: {
          orderBy: { clipIdNum: 'asc' }
        }
      }
    });

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (project.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    return NextResponse.json({ project });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
