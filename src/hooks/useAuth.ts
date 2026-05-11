"use client";

import { useEffect, useState } from "react";
import type { Session, User } from "@/types";
import { loadSession } from "@/lib/auth";
import { useUsers } from "./useUsers";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const { users } = useUsers();

  useEffect(() => {
    setSession(loadSession());
    setReady(true);
  }, []);

  const me: User | null =
    (session && users.find((u) => u.id === session.userId)) || null;

  return { session, me, users, ready };
}
