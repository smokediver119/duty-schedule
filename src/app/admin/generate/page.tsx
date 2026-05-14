"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc, writeBatch } from "firebase/firestore";
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

  // 다음달로 초기화 (12월이면 다음 해 1월)
  const nextMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    1
  );
  const [year, setYear] = useState(nextMonth.getFullYear());
  const [month, setMonth] = useState(nextMonth.getMonth() + 1);

  const [rotation, setRotation] = useState<RotationState>({
    supervisor: 0,
    leader: 0,
    member: 0,
  });
  const [rotationLoaded, setRotationLoaded] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // 역할별 정렬된 활성 사용자
  const supervisors = useMemo(
    () =>
      users
        .filter((u) => u.active && u.role === "supervisor")
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [users]
  );
  const leaders = useMemo(
    () =>
      users
        .filter((u) => u.active && u.role === "leader")
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [users]
  );
  const members = useMemo(
    () =>
      users
        .filter((u) => u.active && u.role === "member")
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [users]
  );

  // Firestore에서 마지막 저장된 순번 자동 로드 (사용자 목록 로드 후 1회)
  useEffect(() => {
    if (rotationLoaded || !users.length) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "settings", "rotation"));
        if (snap.exists()) {
          setRotation(snap.data() as RotationState);
        }
      } finally {
        setRotationLoaded(true);
      }
    })();
  }, [users.length, rotationLoaded]);

  const holidaySet = useMemo(
    () => new Set(holidays.map((h) => h.date)),
    [holidays]
  );

  const nameOf = (id: string | null) =>
    id ? users.find((u) => u.id === id)?.name ?? "?" : "-";

  // rotation 값을 배열 범위 내로 보정 (modulo)
  const safeIdx = (role: keyof RotationState) => {
    const len =
      role === "supervisor"
        ? supervisors.length
        : role === "leader"
        ? leaders.length
        : members.length;
    if (!len) return 0;
    return rotation[role] % len;
  };

  const setRole = (role: keyof RotationState, idx: number) => {
    setRotation((prev) => ({ ...prev, [role]: idx }));
    setResult(null);
    setMsg("");
  };

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
      setRotation(result.nextRotation); // 다음 생성에 이어서 시작
    } catch (e) {
      setMsg("❌ " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const roleConfigs = [
    { key: "supervisor" as const, label: "책임관", arr: supervisors },
    { key: "leader" as const,    label: "조장",   arr: leaders },
    { key: "member" as const,    label: "조원",   arr: members },
  ];

  return (
    <AuthGuard adminOnly>
      <NavBar />
      <main className="pb-20 px-3 pt-3 max-w-3xl mx-auto space-y-4">
        <h1 className="text-xl font-bold">월력 자동 생성</h1>

        <section className="bg-white rounded-xl p-4 border space-y-4 text-sm">
          {/* 연도/월 */}
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="text-xs font-semibold text-gray-500">연도</span>
              <input
                type="number"
                value={year}
                onChange={(e) => { setYear(+e.target.value); setResult(null); }}
                className="w-full border rounded px-2 py-1.5 mt-0.5"
              />
            </label>
            <label>
              <span className="text-xs font-semibold text-gray-500">월</span>
              <input
                type="number"
                min={1}
                max={12}
                value={month}
                onChange={(e) => { setMonth(+e.target.value); setResult(null); }}
                className="w-full border rounded px-2 py-1.5 mt-0.5"
              />
            </label>
          </div>

          {/* 시작 순번 — 이름 드롭다운 */}
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-2">
              시작 순번
              {rotationLoaded && (
                <span className="ml-1.5 font-normal text-gray-400">
                  (이전 저장 순번 자동 로드됨)
                </span>
              )}
            </div>
            <div className="space-y-2">
              {roleConfigs.map(({ key, label, arr }) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-10 shrink-0 text-right">{label}</span>
                  {arr.length === 0 ? (
                    <span className="text-xs text-red-400">활성 {label} 없음</span>
                  ) : (
                    <select
                      value={safeIdx(key)}
                      onChange={(e) => setRole(key, +e.target.value)}
                      className="flex-1 border rounded px-2 py-1.5"
                    >
                      {arr.map((u, i) => (
                        <option key={u.id} value={i}>
                          {i + 1}번째: {u.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 순번 목록 (접이식) */}
          <div className="border rounded-lg overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setShowRoster((v) => !v)}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-gray-600 font-semibold hover:bg-gray-50 transition text-left"
            >
              <span className="text-[10px]">{showRoster ? "▲" : "▶"}</span>
              현재 순번 목록
            </button>
            {showRoster && (
              <div className="border-t px-3 py-2.5 bg-gray-50 space-y-2 text-gray-700 leading-relaxed">
                {roleConfigs.map(({ key, label, arr }) => (
                  <div key={key}>
                    <span className="font-semibold">{label}:</span>{" "}
                    {arr.length === 0 ? (
                      <span className="text-gray-400">없음</span>
                    ) : (
                      arr.map((u, i) => (
                        <span key={u.id}>
                          <span
                            className={
                              i === safeIdx(key)
                                ? "text-brand font-bold underline underline-offset-2"
                                : ""
                            }
                          >
                            {u.name}
                          </span>
                          {i < arr.length - 1 && (
                            <span className="text-gray-300 mx-0.5">→</span>
                          )}
                        </span>
                      ))
                    )}
                  </div>
                ))}
                <p className="text-[10px] text-gray-400 pt-1">
                  밑줄+굵게 표시된 이름이 이번 달 시작 순번입니다.
                </p>
              </div>
            )}
          </div>

          <button
            onClick={preview}
            className="w-full bg-gray-800 text-white py-2 rounded-lg font-semibold"
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
