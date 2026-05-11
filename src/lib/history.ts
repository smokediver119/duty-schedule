import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { HistoryEvent } from "@/types";

export async function logHistory(
  event: HistoryEvent,
  actorId: string | null,
  payload: Record<string, unknown>
) {
  await addDoc(collection(db, "history"), {
    event,
    actorId,
    payload,
    timestamp: Date.now(),
    serverTime: serverTimestamp(),
  });
}
