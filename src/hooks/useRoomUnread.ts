"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./useAuth";

export function useRoomUnread() {
  const { session } = useAuth();
  const myId = session?.userId ?? "";

  const [inboxTs, setInboxTs] = useState(0);
  const [readTs, setReadTs]   = useState(0);

  useEffect(() => {
    if (!myId) return;
    return onSnapshot(doc(db, "userInbox", myId), (snap) => {
      if (snap.exists()) setInboxTs((snap.data().rooms_lastAt as number) ?? 0);
    });
  }, [myId]);

  useEffect(() => {
    if (!myId) return;
    return onSnapshot(doc(db, "userRead", myId), (snap) => {
      if (snap.exists()) setReadTs((snap.data().rooms as number) ?? 0);
    });
  }, [myId]);

  const hasUnread = inboxTs > readTs;

  const markRead = async () => {
    if (!myId) return;
    await setDoc(doc(db, "userRead", myId), { rooms: Date.now() }, { merge: true });
  };

  return { hasUnread, markRead };
}
