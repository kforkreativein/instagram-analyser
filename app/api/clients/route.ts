import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const DB_PATH = path.join(process.cwd(), "database.json");

function readDB() {
  const data = fs.readFileSync(DB_PATH, "utf8");
  return JSON.parse(data);
}

function writeDB(data: any) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export async function GET() {
  try {
    const db = readDB();
    return NextResponse.json(db.clients || []);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = readDB();
    const body = await req.json();

    const newClient = {
      id: crypto.randomUUID(),
      name: body.name || "Unnamed Client",
      niche: body.niche || "",
      platform: body.platform || "Instagram",
      language: body.language || "English",
      duration: body.duration || "60s",
      targetAudience: body.targetAudience || "",
      tonePersona: body.tonePersona || body.tone || "",
      vocabularyLevel: body.vocabularyLevel || body.vocabulary || "",
      preferredTopics: body.preferredTopics || body.topics || "",
      avoidTopics: body.avoidTopics || "",
      ctaStyle: body.ctaStyle || "",
      customInstructions: body.customInstructions || "",
      preferredHooks: body.preferredHooks || [],
      examples: body.examples || body.winningScripts || [],
      trackedVideos: body.trackedVideos || [],
      styleDNA: body.styleDNA || {},
      createdAt: new Date().toISOString()
    };

    if (!db.clients) db.clients = [];
    db.clients.push(newClient);
    writeDB(db);

    return NextResponse.json(newClient);
  } catch (error) {
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const db = readDB();
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: "Client ID required" }, { status: 400 });

    const clientIndex = db.clients.findIndex((c: any) => c.id === id);
    if (clientIndex === -1) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    db.clients[clientIndex] = { ...db.clients[clientIndex], ...updates, updatedAt: new Date().toISOString() };
    writeDB(db);

    return NextResponse.json(db.clients[clientIndex]);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Client ID required" }, { status: 400 });

    const db = readDB();
    db.clients = db.clients.filter((c: any) => c.id !== id);
    writeDB(db);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete client" }, { status: 500 });
  }
}
