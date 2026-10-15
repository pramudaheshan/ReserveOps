
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma7";
import { resourceSchema } from "@/lib/validations";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body: unknown = await request.json();
    const parsed = resourceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid resource data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await prisma.resource.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json(
        { error: "Resource not found" },
        { status: 404 },
      );
    }

    const resource = await prisma.resource.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json(resource);
  } catch (error) {
    console.error("Update resource failed:", error);
    return NextResponse.json(
      { error: "Failed to update resource" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { id } = await context.params;

    const resource = await prisma.resource.findUnique({ where: { id } });

    if (!resource) {
      return NextResponse.json(
        { error: "Resource not found" },
        { status: 404 },
      );
    }

    // Soft-delete: preserve reservation history.
    const updated = await prisma.resource.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Deactivate resource failed:", error);
    return NextResponse.json(
      { error: "Failed to deactivate resource" },
      { status: 500 },
    );
  }
}
