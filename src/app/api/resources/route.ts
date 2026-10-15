import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma7";
import { resourceSchema } from "@/lib/validations";
import { Prisma } from "@/generated/prisma/client";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const resources = await prisma.resource.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(resources);
  } catch {
    return NextResponse.json(
      { error: "Failed to load resources" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
    }
    const body: unknown = await request.json();
    const parsed = resourceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid resource data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const resource = await prisma.resource.create({
      data: {
        name: parsed.data.name,
        type: parsed.data.type,
        location: parsed.data.location || null,
        description: parsed.data.description || null,
        ...(parsed.data.isActive !== undefined
          ? { isActive: parsed.data.isActive }
          : {}),
      },
    });

    return NextResponse.json(resource, { status: 201 });
  } catch (error) {
    console.error("Create resource failed:", error);

    return NextResponse.json(
      { error: "Failed to create resource" },
      { status: 500 },
    );
  }
}
