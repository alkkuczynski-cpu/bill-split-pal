import { safeStorage } from "@/lib/storage";

export interface SessionIdentity {
  role: "host" | "guest";
  displayName: string;
  sessionId: string;
  personId?: string;
  revolutUsername?: string;
}

const KEY = "splitpal_identity";

export function saveIdentity(identity: SessionIdentity): void {
  safeStorage.setItem(KEY, JSON.stringify(identity));
}

export function getIdentity(): SessionIdentity | null {
  const raw = safeStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearIdentity(): void {
  safeStorage.removeItem(KEY);
}
