import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const maxDuration = 30;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const vaultPath = path.join(process.cwd(), "vault.json");

export async function GET() {
    try {
        await fs.access(vaultPath);
    } catch {
        // File doesn't exist — return default object
        return NextResponse.json({ data: { items: [], folders: ["Uncategorized"] } });
    }

    try {
        const fileData = await fs.readFile(vaultPath, "utf8");
        const parsed = JSON.parse(fileData) as any;

        const data = {
            items: Array.isArray(parsed.items) ? parsed.items : [],
            folders: Array.isArray(parsed.folders) ? parsed.folders : ["Uncategorized"]
        };

        if (!data.folders.includes("Uncategorized")) {
            data.folders.unshift("Uncategorized");
        }

        return NextResponse.json({ data });
    } catch {
        // Corrupted file — return default object gracefully
        return NextResponse.json({ data: { items: [], folders: ["Uncategorized"] } });
    }
}
