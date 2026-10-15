import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionCookie, type Role } from "@/lib/auth";
import { prisma } from "@/lib/prisma7";

const loginSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
});

export async function POST(request: Request) {
  try {
    const parsed = loginSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid name and email." }, { status: 400 });
    const email = parsed.data.email.toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { name: true, role: true } });
    const configuredAdmins = (process.env.ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    const role: Role = existingUser?.role === "ADMIN" || configuredAdmins.includes(email) ? "ADMIN" : "USER";
    const user = { name: existingUser?.name ?? parsed.data.name, email, role };
    const response = NextResponse.json({ user });
    response.cookies.set(sessionCookie(user));
    return response;
  } catch (error) {
    console.error("Login failed:", error);
    return NextResponse.json({ error: "Unable to sign in right now." }, { status: 500 });
  }
}
