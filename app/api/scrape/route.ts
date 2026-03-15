import { NextRequest, NextResponse } from "next/server";
import { GET as instagramGet, POST as instagramPost, dynamic, runtime } from "../instagram/route";

export { dynamic, runtime };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const platform = typeof body.platform === "string" ? body.platform.toLowerCase() : "instagram";

  if (platform === "tiktok") {
    return NextResponse.json({ error: "TikTok scraping is not configured yet. Please try an Instagram link." }, { status: 400 });
  }

  const mergedBody = {
    ...body,
    resultsType: "reels",
  };

  const forwarded = new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(mergedBody),
  });

  return instagramPost(forwarded);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  url.searchParams.set("resultsType", "reels");

  const forwarded = new NextRequest(url.toString(), {
    method: "GET",
    headers: req.headers,
  });

  return instagramGet(forwarded);
}
