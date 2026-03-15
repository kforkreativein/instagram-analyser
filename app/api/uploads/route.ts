import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_PATH = path.join(process.cwd(), "database.json");

export async function GET() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const db = JSON.parse(raw) as Record<string, unknown>;
    const uploads = Array.isArray(db.localUploads) ? db.localUploads : [];
    return NextResponse.json({ uploads });
  } catch {
    return NextResponse.json({ uploads: [] });
  }
}
