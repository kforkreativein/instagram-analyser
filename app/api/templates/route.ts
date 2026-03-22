import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const DEFAULT_TEMPLATES = [
  {
    name: "Cold Outreach - Professional",
    category: "Outreach",
    body: `Hi [Name],

I came across your profile and was impressed by your work in [Topic]. Your approach to [specific detail] really stands out.

I help [niche] professionals elevate their content strategy and reach. I'd love to share some insights that could help you scale even further.

Would you be open to a quick chat? No pressure—just want to connect and see if I can add value.

Looking forward to hearing from you!`,
  },
  {
    name: "Cold Outreach - Casual",
    category: "Outreach",
    body: `Hey [Name]! 👋

Just saw your post about [Topic] and had to reach out. The way you broke down [specific detail] was 🔥

I work with creators in the [niche] space helping them grow and monetize. Would love to share some ideas that might help you too.

Down to chat? Let me know!`,
  },
  {
    name: "Follow-up Template",
    category: "Follow-up",
    body: `Hey [Name],

Just circling back on my last message! I know DMs can get buried.

Still interested in chatting about [Topic] and how we might be able to collaborate or support your growth.

Let me know if you're interested—totally cool if not! 😊`,
  },
  {
    name: "Value Proposition Pitch",
    category: "Pitch",
    body: `Hi [Name],

I noticed you're crushing it in the [niche] space. Your content on [Topic] is really engaging.

I specialize in helping creators like you [specific benefit, e.g., "double their engagement" or "land brand deals"]. I've worked with [social proof] and would love to do the same for you.

Would you be open to a 15-minute call to explore how we could work together?

Let me know!`,
  },
  {
    name: "Collaboration Request",
    category: "Collaboration",
    body: `Hey [Name]! 🤝

Love what you're doing with [Topic]. I think there's a great opportunity for us to collaborate.

I'm working on [your project/initiative] and think your audience would really resonate with it. Plus, I believe we could create something super valuable together.

Interested in exploring this? Let's hop on a quick call!`,
  },
];

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json([], { status: 200 });
    }

    let templates = await prisma.dmTemplate.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    // Auto-seed default templates if user has 0 templates
    if (templates.length === 0) {
      const seededTemplates = await Promise.all(
        DEFAULT_TEMPLATES.map((template) =>
          prisma.dmTemplate.create({
            data: {
              userId: session.user.id,
              name: template.name,
              category: template.category,
              body: template.body,
              isBuiltIn: true,
            },
          })
        )
      );
      templates = seededTemplates;
    }

    return NextResponse.json(templates);
  } catch (error) {
    console.error("[TEMPLATES_GET]", error);
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, category, body } = await req.json();
    
    if (!name || !body) {
      return NextResponse.json({ error: "Name and body are required" }, { status: 400 });
    }

    const template = await prisma.dmTemplate.create({
      data: {
        userId: session.user.id,
        name,
        category: category || null,
        body,
        isBuiltIn: false,
      },
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error("[TEMPLATES_POST]", error);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    );
  }
}
