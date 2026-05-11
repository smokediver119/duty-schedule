"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Duty } from "@/types";

export function useDuties(year: number, month: number) {
  const [duties, setDuties] = useState<Duty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const prefix = `${year}-${String(month).padStart(2, "0")}-`;
    const q = query(
      collection(db, "duties"),
      where("date", ">=", `${prefix}01`),
      where("date", "<=", `${prefix}31`),
      orderBy("date")
    );
    const unsub = onSnapshot(q, (snap) => {
      setDuties(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Duty, "id">) }))
      );
      setLoading(false);
    });
    return () => unsub();
  }, [year, month]);

  return { duties, loading };
}
