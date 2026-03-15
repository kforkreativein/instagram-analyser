import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const vaultPath = path.join(process.cwd(), "vault.json");

export async function POST(request: NextRequest) {
    try {
        const payload = (await request.json().catch(() => ({}))) as any;

        // Ensure structure: { items: [], folders: [] }
        const safePayload = {
            items: Array.isArray(payload.items) ? payload.items : [],
            folders: Array.isArray(payload.folders) ? payload.folders : ["Uncategorized"]
        };

        if (!safePayload.folders.includes("Uncategorized")) {
            safePayload.folders.unshift("Uncategorized");
        }

        await fs.writeFile(vaultPath, JSON.stringify(safePayload, null, 2), "utf8");
        return NextResponse.json({ success: true, count: safePayload.items.length });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Write failed" },
            { status: 500 },
        );
    }
}
