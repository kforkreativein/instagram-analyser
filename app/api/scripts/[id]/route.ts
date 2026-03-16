import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const scriptId = params.id;

    // Delete the script only if it belongs to this user
    await prisma.script.delete({
      where: { 
        id: scriptId,
        userId: session.user.id 
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete Script Error:", error);
    return NextResponse.json({ error: "Failed to delete script" }, { status: 500 });
  }
}
