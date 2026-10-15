import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export type Role = "USER" | "ADMIN";

export type Session = {
  email: string;
  name: string;
  role: Role;
};

const cookieName = "reserveops_session";
const secret = process.env.AUTH_SECRET || "reserveops-development-secret";

export function isAdmin(session: Session | null | undefined) {
  return session?.role === "ADMIN";
}

export function canManageResources(session: Session | null | undefined) {
  return isAdmin(session);
}

export function canCancelReservation(session: Session | null | undefined, ownerEmail: string) {
  return Boolean(session && (isAdmin(session) || session.email.toLowerCase() === ownerEmail.toLowerCase()));
}

function sign(value: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function encode(session: Session) {
  const value = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${value}.${sign(value)}`;
}

function decode(value: string): Session | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    return session.email && session.name && (session.role === "USER" || session.role === "ADMIN") ? session : null;
  } catch {
    return null;
  }
}

export async function getSession() {
  return decode((await cookies()).get(cookieName)?.value ?? "");
}

export function sessionCookie(session: Session) {
  return { name: cookieName, value: encode(session), httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 };
}

export function clearSessionCookie() {
  return { name: cookieName, value: "", httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 };
}
