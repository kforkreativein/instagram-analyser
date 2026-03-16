import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scriptsPath = path.join(process.cwd(), "scripts-database.json");

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await fs.access(scriptsPath);
    } catch {
        return NextResponse.json({ data: { scripts: [] } });
    }

    try {
        const fileData = await fs.readFile(scriptsPath, "utf8");
        const parsed = JSON.parse(fileData) as any;

        const allScripts = Array.isArray(parsed.scripts) ? parsed.scripts : [];
        // Filter to only return scripts belonging to this user
        const scripts = allScripts.filter(
          (s: any) => !s.userId || s.userId === session.user.id
        );

        return NextResponse.json({ data: { scripts } });
    } catch {
        return NextResponse.json({ data: { scripts: [] } });
    }
}
