"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { DutyRequest } from "@/types";

export function useRequests() {
  const [requests, setRequests] = useState<DutyRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "requests"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setRequests(
        snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<DutyRequest, "id">) })
        )
      );
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { requests, loading };
}
