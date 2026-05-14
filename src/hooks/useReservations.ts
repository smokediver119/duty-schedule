"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { RoomReservation } from "@/types";

export function useReservations() {
  const [reservations, setReservations] = useState<RoomReservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "reservations"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setReservations(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RoomReservation, "id">) }))
      );
      setLoading(false);
    });
  }, []);

  return { reservations, loading };
}
