"use client";

import { createContext, useContext } from "react";

export type ClientSession = {
  name: string;
  email: string;
  role: "USER" | "ADMIN";
};

export const SessionContext = createContext<ClientSession | null>(null);

export function useSession() {
  return useContext(SessionContext);
}
