"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { User } from "@/types";

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("orderIndex"));
    const unsub = onSnapshot(q, (snap) => {
      setUsers(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<User, "id">) }))
      );
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { users, loading };
}
