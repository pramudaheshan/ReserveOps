"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Boxes, CalendarCheck, LayoutDashboard } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SessionContext, type ClientSession } from "./session-context";

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/resources", label: "Resources", icon: Boxes },
  { href: "/reservations", label: "Reservations", icon: CalendarCheck },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<ClientSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [login, setLogin] = useState({ name: "", email: "" });
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/auth/me").then(async (response) => {
      if (response.ok) setSession((await response.json()).user);
    }).finally(() => setLoading(false));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(login) });
    if (!response.ok) { setError("Enter a valid name and email."); return; }
    setSession((await response.json()).user);
    window.dispatchEvent(new Event("reserveops-auth-changed"));
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession(null);
    window.dispatchEvent(new Event("reserveops-auth-changed"));
  }
  if (loading) return <div className="min-h-screen bg-background" />;
  return (
    <SessionContext.Provider value={session}>
    <div className="min-h-screen bg-background md:flex">
      <aside className="border-b border-sidebar-border bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-5 py-4 md:py-6">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-sidebar-primary font-display font-bold text-sidebar-primary-foreground">R</div>
          <span className="font-display font-semibold">ReserveOps</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return <Link key={href} href={href} className={cn("flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground", active && "bg-sidebar-accent font-medium text-sidebar-foreground")}><Icon className="h-4 w-4" />{label}</Link>;
          })}
        </nav>
        {session && <div className="mx-3 mb-4 hidden rounded-md bg-sidebar-accent px-3 py-2 text-xs md:block"><div className="font-medium">{session.name}</div><div className="text-sidebar-foreground/70">{session.role}</div><button type="button" onClick={() => void logout()} className="mt-2 text-sidebar-primary hover:underline">Sign out</button></div>}
      </aside>
      <main className="flex-1 px-4 py-6 md:px-10 md:py-10">{session ? children : <form onSubmit={submit} className="mx-auto mt-12 max-w-md rounded-xl border border-border bg-card p-6 shadow-sm"><h1 className="font-display text-2xl font-semibold">Sign in to ReserveOps</h1><p className="mt-2 text-sm text-muted-foreground">Your permissions are assigned to your account.</p><div className="mt-6 grid gap-4"><label className="text-sm font-medium">Name<input value={login.name} onChange={(e) => setLogin({ ...login, name: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2" /></label><label className="text-sm font-medium">Email<input type="email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2" /></label>{error && <p className="text-sm text-destructive">{error}</p>}<button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Continue</button></div></form>}</main>
    </div>
    </SessionContext.Provider>
  );
}
