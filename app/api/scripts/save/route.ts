import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

const scriptsPath = path.join(process.cwd(), "scripts-database.json");

async function readScripts(): Promise<any[]> {
    try {
        const raw = await fs.readFile(scriptsPath, "utf8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed.scripts) ? parsed.scripts : [];
    } catch {
        return [];
    }
}

async function writeScripts(scripts: any[]): Promise<void> {
    await fs.writeFile(scriptsPath, JSON.stringify({ scripts }, null, 2), "utf8");
}

// POST: replace entire scripts array (legacy bulk save)
export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const payload = (await request.json().catch(() => ({}))) as any;
        const scripts = Array.isArray(payload.scripts) ? payload.scripts : [];
        await writeScripts(scripts);
        return NextResponse.json({ success: true, count: scripts.length });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Write failed" },
            { status: 500 },
        );
    }
}

// PUT: upsert a single script by id
export async function PUT(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const script = (await request.json().catch(() => null)) as any;
        if (!script || !script.id) {
            return NextResponse.json({ error: "Script id is required" }, { status: 400 });
        }

        const scripts = await readScripts();
        const existingIdx = scripts.findIndex((s: any) => s.id === script.id);

        if (existingIdx !== -1) {
            scripts[existingIdx] = { ...scripts[existingIdx], ...script, updatedAt: new Date().toISOString() };
        } else {
            // Stamp userId on new scripts
            scripts.push({ ...script, userId: session.user.id, createdAt: script.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
        }

        await writeScripts(scripts);
        return NextResponse.json({ success: true, script: existingIdx !== -1 ? scripts[existingIdx] : scripts[scripts.length - 1] });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Save failed" },
            { status: 500 },
        );
    }
}
