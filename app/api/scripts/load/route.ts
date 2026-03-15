import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scriptsPath = path.join(process.cwd(), "scripts-database.json");

export async function GET() {
    try {
        await fs.access(scriptsPath);
    } catch {
        // File doesn't exist — return default object
        return NextResponse.json({ data: { scripts: [] } });
    }

    try {
        const fileData = await fs.readFile(scriptsPath, "utf8");
        const parsed = JSON.parse(fileData) as any;

        const data = {
            scripts: Array.isArray(parsed.scripts) ? parsed.scripts : []
        };

        return NextResponse.json({ data });
    } catch {
        // Corrupted file — return default object gracefully
        return NextResponse.json({ data: { scripts: [] } });
    }
}
