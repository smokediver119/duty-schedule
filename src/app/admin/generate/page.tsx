"use client";

import { useMemo, useState } from "react";
import { doc, setDoc, writeBatch } from "firebase/firestore";
import { AuthGuard } from "@/components/AuthGuard";
import { NavBar } from "@/components/NavBar";
import { useAuth } from "@/hooks/useAuth";
import { useHolidays } from "@/hooks/useHolidays";
import { useUsers } from "@/hooks/useUsers";
import { db } from "@/lib/firebase";
import { logHistory } from "@/lib/history";
import {
  GenerateResult,
  RotationState,
  generateMonth,
} from "@/lib/dutyGenerator";

export default function GeneratePage() {
  const { users } = useUsers();
  const holidays = useHolidays();
  const { session } = useAuth();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 2); // 다음달
  const [rotation, setRotation] = useState<RotationState>({
    supervisor: 0,
    leader: 0,
    member: 0,
  });
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const holidaySet = useMemo(
    () => new Set(holidays.map((h) => h.date)),
    [holidays]
  );

  const nameOf = (id: string | null) =>
    id ? users.find((u) => u.id === id)?.name ?? "?" : "-";

  const preview = () => {
    setMsg("");
    try {
      const r = generateMonth({
        year,
        month,
        users,
        holidays: holidaySet,
        rotation,
      });
      setResult(r);
    } catch (e) {
      setMsg("❌ " + (e as Error).message);
    }
  };

  const commit = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      for (const d of result.duties) {
        batch.set(doc(db, "duties", d.id), d);
      }
      await batch.commit();
      await setDoc(doc(db, "settings", "rotation"), result.nextRotation);
      await logHistory("duty_generated", session?.userId ?? null, {
        year,
        month,
        count: result.duties.length,
      });
      setMsg(`✅ ${year}년 ${month}월 ${result.duties.length}일 저장 완료`);
      setResult(null);
    } catch (e) {
      setMsg("❌ " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthGuard adminOnly>
      <NavBar />
      <main className="pb-20 px-3 pt-3 max-w-3xl mx-auto space-y-4">
        <h1 className="text-xl font-bold">월력 자동 생성</h1>

        <section className="bg-white rounded-xl p-4 border space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label>
              연도
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(+e.target.value)}
                className="w-full border rounded px-2 py-1.5"
              />
            </label>
            <label>
              월
              <input
                type="number"
                min={1}
                max={12}
                value={month}
                onChange={(e) => setMonth(+e.target.value)}
                className="w-full border rounded px-2 py-1.5"
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["supervisor", "leader", "member"] as const).map((k) => (
              <label key={k} className="text-xs">
                {k} 시작 #
                <input
                  type="number"
                  min={0}
                  value={rotation[k]}
                  onChange={(e) =>
                    setRotation({ ...rotation, [k]: +e.target.value })
                  }
                  className="w-full border rounded px-2 py-1"
                />
              </label>
            ))}
          </div>
          <button
            onClick={preview}
            className="w-full bg-gray-800 text-white py-1.5 rounded"
          >
            미리보기 생성
          </button>
        </section>

        {msg && <div className="text-sm">{msg}</div>}

        {result && (
          <section className="bg-white rounded-xl border overflow-hidden">
            <div className="p-3 border-b flex justify-between items-center">
              <div className="font-semibold">
                미리보기 ({result.duties.length}일)
              </div>
              <button
                onClick={commit}
                disabled={saving}
                className="bg-brand text-white px-3 py-1.5 rounded text-sm"
              >
                {saving ? "저장 중..." : "이대로 저장"}
              </button>
            </div>
            <ul className="divide-y text-xs max-h-[60vh] overflow-auto">
              {result.duties.map((d) => (
                <li key={d.id} className="p-2">
                  <div className="font-semibold">
                    {d.date} ({d.weekday}){" "}
                    {d.type === "weekend_or_holiday" && "🎌"}
                  </div>
                  {d.assignments.map((a, i) => (
                    <div key={i} className="text-gray-600">
                      {a.shift !== "full" && (
                        <span className="mr-1">
                          [{a.shift === "day" ? "일직" : "숙직"}]
                        </span>
                      )}
                      책임관 {nameOf(a.supervisorId)} / 조장{" "}
                      {nameOf(a.leaderId)} / 조원 {nameOf(a.memberId)}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </AuthGuard>
  );
}
