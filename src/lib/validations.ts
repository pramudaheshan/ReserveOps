
import { z } from "zod";

export const resourceSchema = z.object({
  name: z.string().trim().min(2).max(100),
  type: z.enum([
    "MEETING_ROOM",
    "LAPTOP",
    "PROJECTOR",
    "VEHICLE",
    "OTHER",
  ]),
  location: z.string().trim().max(150).optional(),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional(),
});

export const reservationSchema = z
  .object({
    resourceId: z.string().min(1),
    userName: z.string().trim().min(2).max(100),
    userEmail: z.string().trim().email().max(254),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    purpose: z.string().trim().min(3).max(300),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  });
