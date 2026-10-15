import type { Reservation, ReservationInput, Resource, ResourceInput } from "./types";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Network error. Please check your connection.", 0);
  }

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String(data.error)
        : response.status === 409
          ? "This time slot overlaps an existing reservation."
          : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export const rrmsApi = {
  listResources: () => request<Resource[]>("/api/resources"),
  createResource: (input: ResourceInput) =>
    request<Resource>("/api/resources", { method: "POST", body: JSON.stringify(input) }),
  updateResource: (id: string, input: ResourceInput) =>
    request<Resource>(`/api/resources/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deactivateResource: (id: string) =>
    request<Resource>(`/api/resources/${id}`, { method: "DELETE" }),
  listReservations: (range?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (range?.from) query.set("from", range.from);
    if (range?.to) query.set("to", range.to);
    return request<Reservation[]>(`/api/reservations${query.size ? `?${query}` : ""}`);
  },
  createReservation: (input: ReservationInput) =>
    request<Reservation>("/api/reservations", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateReservation: (id: string, input: ReservationInput) =>
    request<Reservation>(`/api/reservations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  cancelReservation: (id: string) =>
    request<Reservation>(`/api/reservations/${id}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) }),
};
