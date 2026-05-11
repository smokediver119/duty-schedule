"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Holiday } from "@/types";

export function useHolidays() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  useEffect(() => {
    const q = query(collection(db, "holidays"), orderBy("date"));
    const unsub = onSnapshot(q, (snap) => {
      setHolidays(
        snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<Holiday, "id">) })
        )
      );
    });
    return () => unsub();
  }, []);

  return holidays;
}
