import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json().catch(() => ({}))) as {
            title?: string;
            script?: string;
            hookType?: string;
            notionApiKey?: string;
            databaseId?: string;
        };

        const title = (body.title || "Untitled Script").trim();
        const script = (body.script || "").trim();
        const hookType = (body.hookType || "Standard").trim();
        const notionApiKey = (body.notionApiKey || "").trim();
        const databaseId = (body.databaseId || "").trim();

        if (!notionApiKey) {
            return NextResponse.json(
                { error: "Notion API key is required." },
                { status: 401 },
            );
        }

        if (!databaseId) {
            return NextResponse.json(
                { error: "Notion Database ID is required." },
                { status: 400 },
            );
        }

        const notionPayload = {
            parent: { database_id: databaseId },
            properties: {
                title: { title: [{ text: { content: title } }] },
            },
            children: [
                {
                    object: "block" as const,
                    type: "heading_2" as const,
                    heading_2: {
                        rich_text: [{ type: "text" as const, text: { content: "Hook Type" } }],
                    },
                },
                {
                    object: "block" as const,
                    type: "paragraph" as const,
                    paragraph: {
                        rich_text: [{ type: "text" as const, text: { content: hookType } }],
                    },
                },
                {
                    object: "block" as const,
                    type: "heading_2" as const,
                    heading_2: {
                        rich_text: [{ type: "text" as const, text: { content: "Final Script" } }],
                    },
                },
                {
                    object: "block" as const,
                    type: "paragraph" as const,
                    paragraph: {
                        rich_text: [{ type: "text" as const, text: { content: script } }],
                    },
                },
            ],
        };

        const response = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${notionApiKey}`,
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(notionPayload),
        });

        if (!response.ok) {
            const errData = (await response.json().catch(() => ({}))) as { message?: string };
            return NextResponse.json(
                { error: errData.message || `Notion API error (${response.status})` },
                { status: response.status },
            );
        }

        const data = (await response.json()) as { url?: string };
        return NextResponse.json({ success: true, url: data.url || "" });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Notion sync failed" },
            { status: 500 },
        );
    }
}
