import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma7";
import { getSession } from "@/lib/auth";
import { reservationSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const { id } = await context.params;
    const reservation = await prisma.reservation.findUnique({ where: { id }, include: { user: true } });
    if (!reservation) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    if (session.role !== "ADMIN" && session.email.toLowerCase() !== reservation.user.email.toLowerCase()) {
      return NextResponse.json({ error: "You may only modify your own reservations" }, { status: 403 });
    }

    const body: unknown = await request.json().catch(() => null);
    if (body && typeof body === "object" && "status" in body && body.status === "CANCELLED") {
      if (reservation.status === "CANCELLED") return NextResponse.json(reservation);
      const cancelled = await prisma.reservation.update({ where: { id }, data: { status: "CANCELLED" }, include: { resource: true, user: { select: { id: true, name: true, email: true } } } });
      return NextResponse.json(cancelled);
    }

    if (reservation.status !== "CONFIRMED") {
      return NextResponse.json({ error: "Only confirmed reservations can be modified" }, { status: 400 });
    }
    const parsed = reservationSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid reservation data", details: parsed.error.flatten() }, { status: 400 });
    if (parsed.data.startTime <= new Date()) return NextResponse.json({ error: "Reservations must start in the future" }, { status: 400 });
    if (session.role !== "ADMIN" && session.email.toLowerCase() !== parsed.data.userEmail.toLowerCase()) {
      return NextResponse.json({ error: "You may only modify reservations for your signed-in account" }, { status: 403 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const resource = await tx.resource.findUnique({ where: { id: parsed.data.resourceId } });
      if (!resource || !resource.isActive) throw new Error("RESOURCE_UNAVAILABLE");
      const conflict = await tx.reservation.findFirst({
        where: {
          id: { not: id },
          resourceId: parsed.data.resourceId,
          status: "CONFIRMED",
          startTime: { lt: parsed.data.endTime },
          endTime: { gt: parsed.data.startTime },
        },
        select: { id: true },
      });
      if (conflict) throw new Error("RESERVATION_CONFLICT");
      const user = await tx.user.upsert({
        where: { email: parsed.data.userEmail },
        update: { name: parsed.data.userName },
        create: { name: parsed.data.userName, email: parsed.data.userEmail },
      });
      return tx.reservation.update({
        where: { id },
        data: { resourceId: parsed.data.resourceId, userId: user.id, startTime: parsed.data.startTime, endTime: parsed.data.endTime, purpose: parsed.data.purpose },
        include: { resource: true, user: { select: { id: true, name: true, email: true } } },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "RESOURCE_UNAVAILABLE") return NextResponse.json({ error: "Resource not found or inactive" }, { status: 404 });
    if (error instanceof Error && error.message === "RESERVATION_CONFLICT") return NextResponse.json({ error: "This resource is already reserved for that time" }, { status: 409 });
    console.error("Update reservation failed:", error);
    return NextResponse.json({ error: "Failed to update reservation" }, { status: 500 });
  }
}
