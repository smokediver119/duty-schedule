"use client";

import { FormEvent, useState } from "react";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { AuthGuard } from "@/components/AuthGuard";
import { NavBar } from "@/components/NavBar";
import { useAuth } from "@/hooks/useAuth";
import { useHolidays } from "@/hooks/useHolidays";
import { db } from "@/lib/firebase";
import { logHistory } from "@/lib/history";

export default function HolidaysPage() {
  const holidays = useHolidays();
  const { session } = useAuth();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!date || !name) return;
    await setDoc(doc(db, "holidays", date), { date, name });
    await logHistory("holiday_added", session?.userId ?? null, { date, name });
    setDate("");
    setName("");
  };

  const remove = async (id: string) => {
    await deleteDoc(doc(db, "holidays", id));
    await logHistory("holiday_removed", session?.userId ?? null, { date: id });
  };

  return (
    <AuthGuard adminOnly>
      <NavBar />
      <main className="pb-20 px-3 pt-3 max-w-3xl mx-auto space-y-4">
        <h1 className="text-xl font-bold">공휴일 관리</h1>

        <form
          onSubmit={add}
          className="bg-white rounded-xl p-4 border space-y-2 text-sm"
        >
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border rounded px-2 py-1.5"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="공휴일 명 (예: 어린이날)"
            className="w-full border rounded px-2 py-1.5"
          />
          <button className="w-full bg-brand text-white py-1.5 rounded">
            추가
          </button>
        </form>

        <section className="bg-white rounded-xl p-4 border">
          <div className="font-semibold mb-2">
            등록된 공휴일 ({holidays.length})
          </div>
          {holidays.length === 0 ? (
            <div className="text-sm text-gray-400">없음</div>
          ) : (
            <ul className="divide-y text-sm">
              {holidays.map((h) => (
                <li key={h.id} className="py-2 flex justify-between">
                  <span>
                    <b>{h.date}</b> · {h.name}
                  </span>
                  <button
                    onClick={() => remove(h.id)}
                    className="text-xs border px-2 py-1 rounded text-red-600"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AuthGuard>
  );
}
