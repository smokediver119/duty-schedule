import type { Session } from "@/types";

const KEY = "duty.session";
export const ADMIN_PASSWORD = "73313";

export function saveSession(s: Omit<Session, "createdAt">) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify({ ...s, createdAt: Date.now() }));
}

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    return s;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
