import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const scriptsPath = path.join(process.cwd(), "scripts-database.json");

export async function POST(request: NextRequest) {
    try {
        const { id } = (await request.json().catch(() => ({}))) as { id: string };

        if (!id) {
            return NextResponse.json({ error: "Script ID is required" }, { status: 400 });
        }

        // 1. Read existing scripts
        let fileContent;
        try {
            fileContent = await fs.readFile(scriptsPath, "utf8");
        } catch (err) {
            return NextResponse.json({ error: "Database file not found" }, { status: 404 });
        }

        const data = JSON.parse(fileContent);
        const scripts = Array.isArray(data.scripts) ? data.scripts : [];

        // 2. Filter out the script with the matching ID
        const updatedScripts = scripts.filter((s: any) => s.id !== id);

        if (scripts.length === updatedScripts.length) {
            return NextResponse.json({ message: "Script not found, nothing deleted" }, { status: 200 });
        }

        // 3. Write back to the file
        await fs.writeFile(scriptsPath, JSON.stringify({ scripts: updatedScripts }, null, 2), "utf8");

        return NextResponse.json({ success: true, message: "Script deleted successfully" });
    } catch (error) {
        console.error("Delete Script Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Delete failed" },
            { status: 500 },
        );
    }
}
