
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma7";
import { reservationSchema } from "@/lib/validations";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        const url = new URL(request.url);
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const startTime = from ? new Date(from) : undefined;
        const endTime = to ? new Date(to) : undefined;
        if ((from && Number.isNaN(startTime?.getTime())) || (to && Number.isNaN(endTime?.getTime()))) {
            return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
        }
        const reservations = await prisma.reservation.findMany({
            where: {
                ...(startTime || endTime
                    ? {
                        ...(endTime ? { startTime: { lt: endTime } } : {}),
                        ...(startTime ? { endTime: { gt: startTime } } : {}),
                    }
                    : {}),
            },
            include: {
                resource: true,
                user: {
                    select: { id: true, name: true, email: true },
                },
            },
            orderBy: { startTime: "asc" },
        });

        return NextResponse.json(reservations);
    } catch (error) {
        console.error("Load reservations failed:", error);
        return NextResponse.json(
            { error: "Failed to load reservations" },
            { status: 500 },
        );
    }
}

export async function POST(request: Request) {
    try {
        const body: unknown = await request.json();
        const parsed = reservationSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                {
                    error: "Invalid reservation data",
                    details: parsed.error.flatten(),
                },
                { status: 400 },
            );
        }

        const {
            resourceId,
            userName,
            userEmail,
            startTime,
            endTime,
            purpose,
        } = parsed.data;
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        if (session.role !== "ADMIN" && session.email.toLowerCase() !== userEmail.toLowerCase()) {
            return NextResponse.json({ error: "You may only create reservations for your signed-in account" }, { status: 403 });
        }
        if (startTime <= new Date()) {
            return NextResponse.json({ error: "Reservations must start in the future" }, { status: 400 });
        }

        // Retry serialization conflicts caused by concurrent requests.
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const reservation = await prisma.$transaction(
                    async (tx) => {
                        const resource = await tx.resource.findUnique({
                            where: { id: resourceId },
                        });

                        if (!resource || !resource.isActive) {
                            throw new Error("RESOURCE_UNAVAILABLE");
                        }

                        const conflict = await tx.reservation.findFirst({
                            where: {
                                resourceId,
                                status: "CONFIRMED",
                                startTime: { lt: endTime },
                                endTime: { gt: startTime },
                            },
                            select: { id: true },
                        });

                        if (conflict) {
                            throw new Error("RESERVATION_CONFLICT");
                        }

                        const user = await tx.user.upsert({
                            where: { email: userEmail },
                            update: { name: userName },
                            create: {
                                name: userName,
                                email: userEmail,
                            },
                        });

                        return tx.reservation.create({
                            data: {
                                resourceId,
                                userId: user.id,
                                startTime,
                                endTime,
                                purpose,
                                status: "CONFIRMED",
                            },
                            include: {
                                resource: true,
                                user: {
                                    select: { id: true, name: true, email: true },
                                },
                            },
                        });
                    },
                    {
                        isolationLevel:
                            Prisma.TransactionIsolationLevel.Serializable,
                    },
                );

                return NextResponse.json(reservation, { status: 201 });
            } catch (error) {
                if (error instanceof Error) {
                    if (error.message === "RESOURCE_UNAVAILABLE") {
                        return NextResponse.json(
                            { error: "Resource not found or inactive" },
                            { status: 404 },
                        );
                    }

                    if (error.message === "RESERVATION_CONFLICT") {
                        return NextResponse.json(
                            { error: "This resource is already reserved for that time" },
                            { status: 409 },
                        );
                    }
                }

                // Handle PostgreSQL exclusion constraint violations
                if (
                    error instanceof Prisma.PrismaClientKnownRequestError &&
                    error.code === "P2004" &&
                    JSON.stringify(error.meta).includes(
                        "reservation_no_overlapping_confirmed_bookings",
                    )
                ) {
                    return NextResponse.json(
                        { error: "This resource is already reserved for that time" },
                        { status: 409 },
                    );
                }

                // Retry serialization conflicts
                if (
                    error instanceof Prisma.PrismaClientKnownRequestError &&
                    error.code === "P2034" &&
                    attempt < 2
                ) {
                    continue;
                }

                throw error;
            }
        }

        return NextResponse.json(
            { error: "Reservation could not be completed. Please retry." },
            { status: 409 },
        );
    } catch (error) {
        console.error("Create reservation failed:", error);
        return NextResponse.json(
            { error: "Failed to create reservation" },
            { status: 500 },
        );
    }
}
