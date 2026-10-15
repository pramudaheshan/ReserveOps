"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Activity, ArrowRight, CalendarCheck, CalendarClock, ChevronLeft, ChevronRight, CircleSlash, Clock3, Filter, MapPin, Pencil, Plus, Power, RefreshCw, Search, Trophy, Boxes } from "lucide-react";
import { rrmsApi, ApiError } from "./api";
import Link from "next/link";
import type { Reservation, ReservationInput, Resource, ResourceInput, ResourceType } from "./types";
import { RESOURCE_TYPES } from "./types";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingState, Modal, PageHeader, Select, Textarea } from "./ui";
import { cn } from "@/lib/utils";
import { useSession } from "./session-context";

type View = "dashboard" | "resources" | "reservations";
const today = () => new Date().toISOString().slice(0, 10);
const localDateTime = (value: string) => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
};
const toIso = (value: string) => new Date(value).toISOString();
const displayDate = (value: string) => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const localDateKey = (value: string) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const statusTone = (status: Reservation["status"]) => status === "CONFIRMED" ? "success" : status === "CANCELLED" ? "muted" : "warning";

function useData() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextResources, nextReservations] = await Promise.all([rrmsApi.listResources(), rrmsApi.listReservations()]);
      setResources(nextResources);
      setReservations(nextReservations);
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    const handleAuthChanged = () => { void refresh(); };
    window.addEventListener("reserveops-auth-changed", handleAuthChanged);
    return () => { window.clearTimeout(timer); window.removeEventListener("reserveops-auth-changed", handleAuthChanged); };
  }, [refresh]);
  return { resources, reservations, loading, error, refresh, setResources, setReservations };
}

function ResourceForm({ initial, onCancel, onSaved }: { initial?: Resource; onCancel: () => void; onSaved: () => void }) {
  const [value, setValue] = useState<ResourceInput>({ name: initial?.name ?? "", type: initial?.type ?? "MEETING_ROOM", location: initial?.location ?? "", description: initial?.description ?? "", isActive: initial?.isActive ?? true });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ResourceInput>(key: K, next: ResourceInput[K]) => setValue((current) => ({ ...current, [key]: next }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (value.name.trim().length < 2) { setError("Name must be at least 2 characters."); return; }
    if (!value.location?.trim()) { setError("Location is required."); return; }
    setSaving(true); setError("");
    try {
      const input = { ...value, name: value.name.trim(), location: value.location.trim(), description: value.description?.trim() || undefined };
      if (initial) await rrmsApi.updateResource(initial.id, input); else await rrmsApi.createResource(input);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save resource.");
    } finally { setSaving(false); }
  }
  return <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate><Field label="Name"><Input value={value.name} onChange={(e) => set("name", e.target.value)} placeholder="Boardroom A" /></Field><Field label="Type"><Select value={value.type} onChange={(e) => set("type", e.target.value as ResourceType)}>{RESOURCE_TYPES.map((type) => <option key={type} value={type}>{type.replace("_", " ")}</option>)}</Select></Field><Field label="Location" className="sm:col-span-2"><Input value={value.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="HQ · Floor 4" /></Field><Field label="Description" className="sm:col-span-2"><Textarea value={value.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field><label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={value.isActive ?? true} onChange={(e) => set("isActive", e.target.checked)} className="h-4 w-4 accent-primary" />Active (available for booking)</label>{error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}<div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" loading={saving}>{initial ? "Save changes" : "Create resource"}</Button></div></form>;
}

function ReservationForm({ resources, onCancel, onSaved, initial }: { resources: Resource[]; onCancel: () => void; onSaved: () => void; initial?: Partial<ReservationInput> & { id?: string } }) {
  const session = useSession();
  const isAdmin = session?.role === "ADMIN";
  const [value, setValue] = useState({ resourceId: initial?.resourceId ?? "", startTime: initial?.startTime ? localDateTime(initial.startTime) : `${today()}T09:00`, endTime: initial?.endTime ? localDateTime(initial.endTime) : `${today()}T10:00`, userName: initial?.userName ?? session?.name ?? "", userEmail: initial?.userEmail ?? session?.email ?? "", purpose: initial?.purpose ?? "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const active = resources.filter((resource) => resource.isActive);
  const set = (key: keyof typeof value, next: string) => setValue((current) => ({ ...current, [key]: next }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!value.resourceId || !value.userName.trim() || !value.userEmail.includes("@") || !value.purpose.trim()) { setError("Complete all fields with a valid name, email, and purpose."); return; }
    if (!value.startTime || !value.endTime || value.endTime <= value.startTime) { setError("End time must be after start time."); return; }
    if (value.startTime.slice(0, 10) < today()) { setError("Reservation date cannot be in the past."); return; }
    setSaving(true); setError("");
    try {
      const input = { resourceId: value.resourceId, userName: value.userName.trim(), userEmail: value.userEmail.trim(), purpose: value.purpose.trim(), startTime: toIso(value.startTime), endTime: toIso(value.endTime) };
      if (initial?.id) await rrmsApi.updateReservation(initial.id, input); else await rrmsApi.createReservation(input);
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 409 ? "That resource is already reserved for this time." : cause instanceof Error ? cause.message : "Could not create reservation.");
    } finally { setSaving(false); }
  }
  return <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate><Field label="Resource" className="sm:col-span-2"><Select value={value.resourceId} onChange={(e) => set("resourceId", e.target.value)}><option value="">Select a resource…</option>{active.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}{resource.location ? ` — ${resource.location}` : ""}</option>)}</Select></Field><Field label="Start"><Input type="datetime-local" value={value.startTime} onChange={(e) => set("startTime", e.target.value)} /></Field><Field label="End"><Input type="datetime-local" value={value.endTime} onChange={(e) => set("endTime", e.target.value)} /></Field><Field label={isAdmin ? "Booker name" : "Your name"}><Input value={value.userName} readOnly={!isAdmin} onChange={(e) => set("userName", e.target.value)} className={!isAdmin ? "bg-muted" : undefined} /></Field><Field label="Email"><Input type="email" value={value.userEmail} readOnly={!isAdmin} onChange={(e) => set("userEmail", e.target.value)} className={!isAdmin ? "bg-muted" : undefined} /></Field><Field label="Purpose" className="sm:col-span-2"><Textarea value={value.purpose} onChange={(e) => set("purpose", e.target.value)} /></Field>{!isAdmin && <p className="text-xs text-muted-foreground sm:col-span-2">Booking as {session?.name} ({session?.email})</p>}{error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}<div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" loading={saving}>Book resource</Button></div></form>;
}

function Dashboard({ resources, reservations, loading, error, refresh }: ReturnType<typeof useData>) {
  const [range, setRange] = useState<"TODAY" | "WEEK" | "ALL">("WEEK");
  const [resourceId, setResourceId] = useState("ALL");
  const [query, setQuery] = useState("");

  if (loading) return <LoadingState label="Loading dashboard…" />;
  if (error) return <ErrorState error={error} onRetry={() => void refresh()} />;

  const live = reservations.filter((item) => item.status === "CONFIRMED");
  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  const filtered = live
    .filter((item) => {
      const start = new Date(item.startTime);
      const inRange = range === "ALL" || (range === "TODAY" ? localDateKey(item.startTime) === today() : start >= now && start <= endOfWeek);
      const matchesResource = resourceId === "ALL" || item.resourceId === resourceId;
      const text = `${item.resource.name} ${item.user.name} ${item.purpose}`.toLowerCase();
      return inRange && matchesResource && text.includes(query.toLowerCase());
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const upcoming = live.filter((item) => new Date(item.startTime) >= now).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const activeResources = resources.filter((resource) => resource.isActive);
  const chartDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    const key = localDateKey(date.toISOString());
    return {
      key,
      label: date.toLocaleDateString([], { weekday: "short" }),
      count: live.filter((item) => localDateKey(item.startTime) === key).length,
    };
  });
  const chartMax = Math.max(1, ...chartDays.map((day) => day.count));
  const occupiedNow = activeResources.filter((resource) => live.some((item) => item.resourceId === resource.id && new Date(item.startTime) <= now && new Date(item.endTime) > now));
  const availableNow = Math.max(0, activeResources.length - occupiedNow.length);
  const nextReservation = upcoming[0];
  const weekBookings = live.filter((item) => {
    const start = new Date(item.startTime);
    return start >= now && start <= endOfWeek;
  });
  const averageDuration = weekBookings.length
    ? Math.round(weekBookings.reduce((total, item) => total + (new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 3_600_000, 0) / weekBookings.length * 10) / 10
    : 0;
  const resourceCounts = weekBookings.reduce<Record<string, number>>((counts, item) => {
    counts[item.resourceId] = (counts[item.resourceId] ?? 0) + 1;
    return counts;
  }, {});
  const busiestResource = activeResources
    .map((resource) => ({ resource, count: resourceCounts[resource.id] ?? 0 }))
    .sort((a, b) => b.count - a.count)[0];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Resource utilisation at a glance."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" />Refresh</Button>
            <Link href="/reservations" className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4" />New reservation</Link>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Active resources", value: activeResources.length, sub: `${resources.length} total`, icon: Boxes, href: "/resources" },
          { label: "Bookings today", value: live.filter((item) => localDateKey(item.startTime) === today()).length, sub: "confirmed reservations", icon: CalendarCheck, href: "/reservations" },
          { label: "Upcoming", value: upcoming.length, sub: "from now onward", icon: CalendarClock, href: "/reservations" },
          { label: "Cancelled", value: reservations.filter((item) => item.status === "CANCELLED").length, sub: "all time", icon: CircleSlash, href: "/reservations" },
        ].map(({ label, value, sub, icon: Icon, href }) => (
          <Link key={label} href={href} className="group">
            <Card className="p-4 transition-shadow group-hover:shadow-md">
              <div className="flex items-start justify-between"><span className="text-sm text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary" /></div>
              <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground"><span>{sub}</span><ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" /></div>
            </Card>
          </Link>
        ))}
      </div>
      <Card className="mt-3">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div><h2 className="font-display text-sm font-semibold">Booking trend</h2><p className="text-xs text-muted-foreground">Confirmed reservations for the next 7 days</p></div>
          <Link href="/reservations" className="text-xs font-medium text-primary hover:underline">View schedule</Link>
        </div>
        <div className="flex h-28 items-end gap-3 px-5 pb-3 pt-3">
          {chartDays.map((day) => <div key={day.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1"><span className="text-[10px] font-medium text-muted-foreground">{day.count || ""}</span><div className="w-full max-w-14 rounded-t bg-primary/80 transition-all" style={{ height: `${Math.max(8, (day.count / chartMax) * 100)}%` }} /><span className="text-[10px] text-muted-foreground">{day.label}</span></div>)}
        </div>
      </Card>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Activity className="h-4 w-4" /></div>
          <div><div className="text-xs text-muted-foreground">This week</div><div className="font-display text-lg font-semibold">{weekBookings.length} confirmed</div></div>
        </Card>
        <Card className="flex items-center gap-3 p-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-success/10 text-success"><Clock3 className="h-4 w-4" /></div>
          <div><div className="text-xs text-muted-foreground">Average booking</div><div className="font-display text-lg font-semibold">{averageDuration ? `${averageDuration} hrs` : "No bookings"}</div></div>
        </Card>
        <Card className="flex items-center gap-3 p-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-warning/15 text-warning-foreground"><Trophy className="h-4 w-4" /></div>
          <div className="min-w-0"><div className="text-xs text-muted-foreground">Most requested</div><div className="truncate font-display text-lg font-semibold">{busiestResource?.count ? busiestResource.resource.name : "No bookings"}</div></div>
        </Card>
      </div>
      <Card className="mt-3 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Filter className="h-3.5 w-3.5 text-primary" />Filters</div>
          <div className="flex rounded-md border border-border bg-muted/40 p-0.5">
            {([{ value: "TODAY", label: "Today" }, { value: "WEEK", label: "Next 7 days" }, { value: "ALL", label: "All upcoming" }] as const).map((item) => (
              <button key={item.value} type="button" onClick={() => setRange(item.value)} className={cn("rounded px-2.5 py-1 text-xs", range === item.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{item.label}</button>
            ))}
          </div>
          <Select value={resourceId} onChange={(event) => setResourceId(event.target.value)} className="h-8 w-44 py-1 text-xs"><option value="ALL">All resources</option>{activeResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</Select>
          <div className="relative min-w-44 flex-1"><Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search bookings…" className="h-8 pl-8 py-1 text-xs" /></div>
        </div>
      </Card>
      <div className="mt-3 grid gap-3 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><h2 className="font-display font-semibold">Filtered schedule</h2><p className="text-xs text-muted-foreground">{filtered.length} matching confirmed booking{filtered.length === 1 ? "" : "s"}</p></div><Link href="/reservations" className="text-sm font-medium text-primary hover:underline">Open schedule</Link></div>
          {filtered.length === 0 ? <EmptyState title="No bookings match these filters" hint="Try a wider date range or clear the search." /> : <ul className="divide-y divide-border">{filtered.slice(0, 4).map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"><div><div className="font-medium">{item.resource.name}</div><div className="text-xs text-muted-foreground">{item.user.name} · {item.purpose}</div></div><div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{displayDate(item.startTime)}–{new Date(item.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><Badge tone="success">CONFIRMED</Badge></div></li>)}</ul>}
        </Card>
        <Card>
          <div className="border-b border-border px-4 py-3"><h2 className="font-display font-semibold">Availability snapshot</h2><p className="text-xs text-muted-foreground">Live status of active resources</p></div>
          <div className="grid grid-cols-2 gap-2 p-4">
            <div className="rounded-lg bg-success/10 p-3"><div className="text-xs text-muted-foreground">Available now</div><div className="mt-1 font-display text-2xl font-semibold text-success">{availableNow}</div></div>
            <div className="rounded-lg bg-warning/15 p-3"><div className="text-xs text-muted-foreground">In use now</div><div className="mt-1 font-display text-2xl font-semibold text-warning-foreground">{occupiedNow.length}</div></div>
          </div>
          <div className="border-t border-border px-4 py-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Resource activity</h3><Link href="/resources" className="text-xs font-medium text-primary hover:underline">Manage</Link></div><ul className="grid grid-cols-2 gap-x-4 gap-y-2">{activeResources.slice(0, 6).map((resource) => { const count = upcoming.filter((item) => item.resourceId === resource.id).length; const width = upcoming.length ? Math.min(100, (count / Math.max(1, upcoming.length)) * 100 * 2) : 0; return <li key={resource.id}><div className="flex justify-between gap-2 text-xs"><span className="truncate font-medium">{resource.name}</span><span className="text-muted-foreground">{count}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${width}%` }} /></div></li>; })}</ul></div>
          {nextReservation && <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Next booking: <span className="font-medium text-foreground">{nextReservation.resource.name}</span> at {new Date(nextReservation.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>}
        </Card>
      </div>
    </>
  );
}

function ResourcesPage({ resources, loading, error, refresh, setResources }: ReturnType<typeof useData>) {
  const session = useSession();
  const canManageResources = session?.role === "ADMIN";
  const [query, setQuery] = useState(""); const [type, setType] = useState("ALL"); const [status, setStatus] = useState("ALL"); const [editing, setEditing] = useState<Resource | "new" | null>(null); const [actionError, setActionError] = useState("");
  const filtered = useMemo(() => resources.filter((resource) => (type === "ALL" || resource.type === type) && (status === "ALL" || (status === "ACTIVE") === resource.isActive) && `${resource.name} ${resource.location ?? ""} ${resource.description ?? ""}`.toLowerCase().includes(query.toLowerCase())), [resources, query, status, type]);
  async function toggle(resource: Resource) { setActionError(""); try { const updated = resource.isActive ? await rrmsApi.deactivateResource(resource.id) : await rrmsApi.updateResource(resource.id, { name: resource.name, type: resource.type, location: resource.location ?? undefined, description: resource.description ?? undefined, isActive: true }); setResources((current) => current.map((item) => item.id === updated.id ? updated : item)); } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Could not update resource."); } }
  return <><PageHeader title="Resource catalogue" subtitle="Rooms, equipment, and vehicles available for booking." action={canManageResources ? <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" />New resource</Button> : undefined} /><Card className="mb-4 flex flex-wrap gap-3 p-3"><div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, location…" className="pl-9" /></div><Select value={type} onChange={(e) => setType(e.target.value)} className="w-48"><option value="ALL">All types</option>{RESOURCE_TYPES.map((item) => <option key={item}>{item}</option>)}</Select><Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36"><option value="ALL">Any status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></Card>{actionError && <p className="mb-4 text-sm text-destructive">{actionError}</p>}{loading ? <LoadingState /> : error ? <Card><ErrorState error={error} onRetry={() => void refresh()} /></Card> : filtered.length === 0 ? <Card><EmptyState title={resources.length ? "No matching resources" : "No resources yet"} hint="Create a resource to make it available for booking." /></Card> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((resource) => <Card key={resource.id} className={cn("flex flex-col p-5", !resource.isActive && "opacity-60")}><div className="flex items-start justify-between gap-2"><div><Badge tone="info">{resource.type}</Badge><h3 className="mt-2 font-display font-semibold">{resource.name}</h3></div><Badge tone={resource.isActive ? "success" : "muted"}>{resource.isActive ? "Active" : "Inactive"}</Badge></div>{resource.description && <p className="mt-2 text-sm text-muted-foreground">{resource.description}</p>}<div className="mt-4 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{resource.location ?? "No location"}</div>{canManageResources && <div className="mt-4 flex gap-1 border-t border-border pt-3"><Button variant="ghost" onClick={() => setEditing(resource)}><Pencil className="h-4 w-4" />Edit</Button><Button variant={resource.isActive ? "danger" : "ghost"} onClick={() => void toggle(resource)}><Power className="h-4 w-4" />{resource.isActive ? "Deactivate" : "Activate"}</Button></div>}</Card>)}</div>}<Modal open={editing !== null} title={editing === "new" ? "New resource" : "Edit resource"} onClose={() => setEditing(null)}>{editing && canManageResources && <ResourceForm initial={editing === "new" ? undefined : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); void refresh(); }} />}</Modal></>;
}

function Timeline({ resources, reservations, onSlot, onReservation }: { resources: Resource[]; reservations: Reservation[]; onSlot: (resourceId: string, startTime: string, endTime: string) => void; onReservation: (reservation: Reservation) => void }) {
  const [weekStart, setWeekStart] = useState(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - date.getDay());
    return date;
  });
  const active = resources.filter((resource) => resource.isActive);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return { date, key: localDateKey(date.toISOString()), label: date.toLocaleDateString([], { weekday: "short" }), number: date.getDate() };
  });
  const weekReservations = reservations.filter((item) => item.status === "CONFIRMED" && days.some((day) => day.key === localDateKey(item.startTime)));
  const shiftWeek = (weeks: number) => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + weeks * 7);
    setWeekStart(next);
  };
  const goToCurrentWeek = () => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - date.getDay());
    setWeekStart(date);
  };
  return <Card className="overflow-hidden">
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card p-3">
      <Button variant="outline" onClick={goToCurrentWeek}>This week</Button>
      <Button variant="ghost" className="p-2" aria-label="Previous week" onClick={() => shiftWeek(-1)}><ChevronLeft className="h-4 w-4" /></Button>
      <Button variant="ghost" className="p-2" aria-label="Next week" onClick={() => shiftWeek(1)}><ChevronRight className="h-4 w-4" /></Button>
      <span className="text-sm font-semibold">{days[0].date.toLocaleDateString([], { month: "short", day: "numeric" })} – {days[6].date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
      <span className="ml-auto rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{weekReservations.length} bookings this week</span>
      <span className="w-full text-xs text-muted-foreground">Click an empty day to book from 09:00–10:00, or click a booking to edit.</span>
    </div>
    {active.length === 0 ? <EmptyState title="No active resources" /> : <div className="overflow-x-auto"><div className="min-w-[980px]">
      <div className="flex border-b border-border bg-muted/60 text-xs text-muted-foreground">
        <div className="w-52 shrink-0 px-4 py-3 font-semibold uppercase tracking-wide">Resource</div>
        <div className="grid flex-1 grid-cols-7">{days.map((day) => <div key={day.key} className={cn("border-l border-border px-2 py-2 text-center", day.key === today() && "bg-primary/10 text-primary")}><div className="font-semibold uppercase">{day.label}</div><div className="mt-0.5 text-base font-bold">{day.number}</div></div>)}</div>
      </div>
      {active.map((resource) => <div key={resource.id} className="flex min-h-28 border-b border-border last:border-0">
        <div className="w-52 shrink-0 bg-muted/20 px-4 py-3"><div className="truncate text-sm font-semibold">{resource.name}</div><div className="truncate text-xs text-muted-foreground">{resource.location}</div></div>
        <div className="grid flex-1 grid-cols-7">
          {days.map((day) => {
            const dayItems = weekReservations.filter((item) => item.resourceId === resource.id && localDateKey(item.startTime) === day.key);
            const disabled = day.key < today();
            return <div key={day.key} className={cn("min-w-0 border-l border-border p-1", day.key === today() && "bg-primary/[0.03]")}>
              <div role="button" tabIndex={disabled ? -1 : 0} aria-label={`Book ${resource.name} on ${day.key}`} onClick={() => !disabled && onSlot(resource.id, `${day.key}T09:00`, `${day.key}T10:00`)} onKeyDown={(event) => { if (!disabled && (event.key === "Enter" || event.key === " ")) onSlot(resource.id, `${day.key}T09:00`, `${day.key}T10:00`); }} className="min-h-24 w-full rounded-md border border-dashed border-transparent text-left transition hover:border-primary/40 hover:bg-primary/5">
                <span className="grid gap-1">
                  {dayItems.map((item) => <button key={item.id} type="button" title={`${item.user.name} · ${item.purpose}`} onClick={(event) => { event.stopPropagation(); onReservation(item); }} className="block w-full rounded border border-primary/30 bg-primary px-2 py-1.5 text-left text-xs text-primary-foreground shadow-sm transition hover:shadow-md"><span className="block truncate font-semibold">{item.user.name}</span><span className="block truncate">{new Date(item.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Edit</span></button>)}
                </span>
              </div>
            </div>;
          })}
        </div>
      </div>)}
    </div></div>}
  </Card>;
}

function ReservationsPage({ resources, reservations, loading, error, refresh }: ReturnType<typeof useData>) {
  const session = useSession();
  const [open, setOpen] = useState(false); const [view, setView] = useState<"timeline" | "table">("timeline"); const [query, setQuery] = useState(""); const [status, setStatus] = useState("ALL"); const [prefill, setPrefill] = useState<(Partial<ReservationInput> & { id?: string })>();
  const rows = useMemo(() => reservations.filter((item) => (status === "ALL" || item.status === status) && `${item.user.name} ${item.user.email} ${item.purpose} ${item.resource.name}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.startTime.localeCompare(a.startTime)), [reservations, query, status]);
  const openEditor = (item?: Reservation) => {
    setPrefill(item ? { id: item.id, resourceId: item.resourceId, startTime: item.startTime, endTime: item.endTime, userName: item.user.name, userEmail: item.user.email, purpose: item.purpose } : undefined);
    setOpen(true);
  };
  return <><PageHeader title="Reservations" subtitle="All bookings across resources." action={<div className="flex gap-2"><div className="flex rounded-md border border-border bg-card p-0.5">{(["timeline", "table"] as const).map((item) => <button key={item} type="button" onClick={() => setView(item)} className={cn("rounded px-3 py-1.5 text-sm font-medium capitalize", view === item ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{item}</button>)}</div><Button onClick={() => openEditor()}><Plus className="h-4 w-4" />New reservation</Button></div>} />{view === "timeline" ? loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={() => void refresh()} /> : <Timeline resources={resources} reservations={reservations} onSlot={(resourceId, startTime, endTime) => { setPrefill({ resourceId, startTime: toIso(startTime), endTime: toIso(endTime) }); setOpen(true); }} onReservation={openEditor} /> : <><Card className="mb-4 flex flex-wrap gap-3 p-3"><div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search person, purpose, resource…" className="pl-9" /></div><Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40"><option value="ALL">All statuses</option><option value="CONFIRMED">Confirmed</option><option value="CANCELLED">Cancelled</option><option value="COMPLETED">Completed</option></Select></Card><Card className="overflow-hidden">{loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={() => void refresh()} /> : rows.length === 0 ? <EmptyState title="No matching reservations" /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Resource</th><th className="px-4 py-3">When</th><th className="px-4 py-3">Booked by</th><th className="px-4 py-3">Purpose</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-border">{rows.map((item) => <tr key={item.id}><td className="px-4 py-3 font-medium">{item.resource.name}</td><td className="whitespace-nowrap px-4 py-3">{displayDate(item.startTime)}<div className="text-xs text-muted-foreground">to {new Date(item.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div></td><td className="px-4 py-3">{item.user.name}<div className="text-xs text-muted-foreground">{item.user.email}</div></td><td className="px-4 py-3 text-muted-foreground">{item.purpose}</td><td className="px-4 py-3"><Badge tone={statusTone(item.status)}>{item.status}</Badge></td><td className="px-4 py-3">{item.status === "CONFIRMED" && (session?.role === "ADMIN" || session?.email.toLowerCase() === item.user.email.toLowerCase()) && <div className="flex gap-1"><Button variant="ghost" onClick={() => openEditor(item)}><Pencil className="h-4 w-4" />Edit</Button><Button variant="danger" onClick={async () => { if (!window.confirm("Cancel this reservation?")) return; try { await rrmsApi.cancelReservation(item.id); await refresh(); } catch (cause) { window.alert(cause instanceof Error ? cause.message : "Could not cancel reservation."); } }}>Cancel</Button></div>}</td></tr>)}</tbody></table></div>}</Card></>}<Modal open={open} title={prefill?.id ? "Edit reservation" : "New reservation"} onClose={() => setOpen(false)}><ReservationForm resources={resources} initial={prefill} onCancel={() => setOpen(false)} onSaved={() => { setOpen(false); void refresh(); }} /></Modal></>;
}

export function RrmsApp({ view }: { view: View }) {
  const data = useData();
  return view === "dashboard" ? <Dashboard {...data} /> : view === "resources" ? <ResourcesPage {...data} /> : <ReservationsPage {...data} />;
}
