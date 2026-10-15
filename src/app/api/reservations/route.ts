
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma7";
import { reservationSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET() {
    try {
        const reservations = await prisma.reservation.findMany({
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
