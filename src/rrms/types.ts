export const RESOURCE_TYPES = [
  "MEETING_ROOM",
  "LAPTOP",
  "PROJECTOR",
  "VEHICLE",
  "OTHER",
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type Resource = {
  id: string;
  name: string;
  type: ResourceType;
  location: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
};

export type ResourceInput = {
  name: string;
  type: ResourceType;
  location?: string;
  description?: string;
  isActive?: boolean;
};

export type ReservationStatus = "CONFIRMED" | "CANCELLED" | "COMPLETED";

export type Reservation = {
  id: string;
  resourceId: string;
  startTime: string;
  endTime: string;
  purpose: string;
  status: ReservationStatus;
  createdAt: string;
  resource: Pick<Resource, "id" | "name" | "location">;
  user: { id: string; name: string; email: string };
};

export type ReservationInput = {
  resourceId: string;
  userName: string;
  userEmail: string;
  startTime: string;
  endTime: string;
  purpose: string;
};
