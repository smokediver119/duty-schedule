"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { format } from "date-fns";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { Calendar } from "@/components/Calendar";
import { NavBar } from "@/components/NavBar";
import { useAuth } from "@/hooks/useAuth";
import { useDuties } from "@/hooks/useDuties";
import { useHolidays } from "@/hooks/useHolidays";
import { db } from "@/lib/firebase";
import { logHistory } from "@/lib/history";
import type { DutyAssignment, DutyShift } from "@/types";

export default function CalendarPage() {
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const todayLabel = `오늘 ${now.getMonth() + 1}월 ${now.getDate()}일 (${DOW[now.getDay()]})`;
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<DutyAssignment[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [editMsg, setEditMsg] = useState("");

  const { session, me, users } = useAuth();
  const { duties, loading } = useDuties(year, month);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const { duties: nextMonthDuties } = useDuties(nextYear, nextMonth);
  const holidays = useHolidays();
  const isAdmin = session?.role === "admin";

  type MyDuty = { date: string; shift: DutyShift; role: "supervisor" | "leader" | "member" };
  const roleOf = (a: DutyAssignment, uid: string): MyDuty["role"] | null =>
    a.supervisorId === uid ? "supervisor" :
    a.leaderId === uid ? "leader" :
    a.memberId === uid ? "member" : null;

  const myDutiesInMonth = useMemo<MyDuty[]>(() => {
    if (!me) return [];
    const out: MyDuty[] = [];
    for (const d of duties) {
      for (const a of d.assignments) {
        const r = roleOf(a, me.id);
        if (r) out.push({ date: d.date, shift: a.shift, role: r });
      }
    }
    return out;
  }, [duties, me]);

  const myNextDuty = useMemo<MyDuty | null>(() => {
    if (!me) return null;
    const collect = (ds: typeof duties): MyDuty[] => {
      const out: MyDuty[] = [];
      for (const d of ds) {
        for (const a of d.assignments) {
          const r = roleOf(a, me.id);
          if (r) out.push({ date: d.date, shift: a.shift, role: r });
        }
      }
      return out;
    };
    const all = [...collect(duties), ...collect(nextMonthDuties)].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    return all.find((d) => d.date >= todayStr) ?? null;
  }, [duties, nextMonthDuties, me, todayStr]);

  const monthStats = useMemo(() => {
    const d = myDutiesInMonth.filter((x) => x.shift === "day").length;
    const n = myDutiesInMonth.filter((x) => x.shift === "night").length;
    const f = myDutiesInMonth.filter((x) => x.shift === "full").length;
    return { total: myDutiesInMonth.length, day: d, night: n, full: f };
  }, [myDutiesInMonth]);

  const daysUntil = (iso: string) => {
    const a = new Date(iso + "T00:00:00");
    const b = new Date(todayStr + "T00:00:00");
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  };
  const daysUntilLabel = (iso: string) => {
    const n = daysUntil(iso);
    if (n === 0) return "오늘";
    if (n === 1) return "내일";
    if (n === 2) return "모레";
    return `${n}일 후`;
  };
  const shiftKo = (s: DutyShift) =>
    s === "full" ? "근무" : s === "day" ? "일직" : "숙직";
  const roleKo = (r: MyDuty["role"]) =>
    r === "supervisor" ? "책임관" : r === "leader" ? "조장" : "조원";
  const formatMD = (iso: string) => {
    const [, m, day] = iso.split("-");
    const dt = new Date(iso + "T00:00:00");
    return `${Number(m)}월 ${Number(day)}일 (${DOW[dt.getDay()]})`;
  };

  const selectedDuty = useMemo(
    () => duties.find((d) => d.date === selectedDate) ?? null,
    [duties, selectedDate]
  );

  useEffect(() => {
    if (!selectedDuty) {
      setEditMode(false);
      setDraft(null);
      setEditMsg("");
    }
  }, [selectedDuty]);

  const prev = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else setMonth(month - 1);
  };
  const next = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else setMonth(month + 1);
  };

  const nameOf = (id: string | null | undefined) =>
    id ? users.find((u) => u.id === id)?.name ?? "?" : "-";

  const activeUsers = users.filter((u) => u.active);
  const supervisorPool = activeUsers.filter((u) => u.role === "supervisor");
  const leaderPool = activeUsers.filter((u) => u.role === "leader");
  const memberPool = activeUsers.filter((u) => u.role === "member");

  const startEdit = () => {
    if (!selectedDuty) return;
    setDraft(selectedDuty.assignments.map((a) => ({ ...a })));
    setEditMode(true);
    setEditMsg("");
  };

  const cancelEdit = () => {
    setEditMode(false);
    setDraft(null);
    setEditMsg("");
  };

  const updateSlot = (
    idx: number,
    key: "supervisorId" | "leaderId" | "memberId",
    value: string
  ) => {
    if (!draft) return;
    const copy = draft.map((a) => ({ ...a }));
    copy[idx] = { ...copy[idx], [key]: value || null };
    setDraft(copy);
  };

  const saveEdit = async () => {
    if (!selectedDuty || !draft) return;
    setSaving(true);
    setEditMsg("");
    try {
      await updateDoc(doc(db, "duties", selectedDuty.date), {
        assignments: draft,
      });
      await logHistory("duty_manual_edit", session?.userId ?? null, {
        date: selectedDuty.date,
        assignments: draft,
      });
      setEditMode(false);
      setDraft(null);
      setEditMsg("저장 완료");
    } catch (e) {
      setEditMsg("❌ " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const shiftTitle = (s: DutyAssignment["shift"]) =>
    s === "day"
      ? "일직 (09:00~18:00)"
      : s === "night"
      ? "숙직 (18:00~익일 09:00)"
      : "근무";

  return (
    <AuthGuard>
      <NavBar />
      <main className="pb-24 px-3 pt-3 max-w-3xl mx-auto">
        <div className="print-title">광진소방서 {year}년 {month}월 당직표</div>
        {me && (
          <section className="no-print mb-3 rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-amber-50 p-4 shadow-sm">
            {myNextDuty ? (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-gray-500 tracking-widest">
                    내 다음 당직
                  </div>
                  <div className="mt-0.5 text-base font-extrabold text-gray-800 truncate">
                    🔥 {daysUntilLabel(myNextDuty.date)} · {formatMD(myNextDuty.date)}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-600">
                    {shiftKo(myNextDuty.shift)} · {roleKo(myNextDuty.role)}
                  </div>
                </div>
                <button
                  onClick={() => {
                    const [y, m] = myNextDuty.date.split("-");
                    setYear(Number(y));
                    setMonth(Number(m));
                    setSelectedDate(myNextDuty.date);
                  }}
                  className="shrink-0 self-center text-xs px-3 py-1.5 rounded-lg bg-white/80 border border-rose-200 text-brand font-semibold hover:bg-white"
                >
                  자세히
                </button>
              </div>
            ) : (
              <div>
                <div className="text-[11px] font-bold text-gray-500 tracking-widest">
                  내 다음 당직
                </div>
                <div className="mt-0.5 text-sm text-gray-600">
                  예정된 당직이 없습니다
                </div>
              </div>
            )}
            <div className="mt-2 pt-2 border-t border-rose-100/70 text-xs text-gray-600">
              📊 {month}월: 총{" "}
              <b className="text-gray-800">{monthStats.total}</b>회
              {monthStats.full > 0 && <span> · 평일 {monthStats.full}</span>}
              {monthStats.day > 0 && <span> · 일직 {monthStats.day}</span>}
              {monthStats.night > 0 && <span> · 숙직 {monthStats.night}</span>}
            </div>
          </section>
        )}
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={prev}
            className="px-3 py-2 rounded-xl bg-white border shadow-sm hover:bg-gray-50"
          >
            ◀
          </button>
          <div className="text-center">
            <div className="font-extrabold text-lg">{year}년 {month}월</div>
            <div className="text-[11px] text-gray-400">{todayLabel}</div>
          </div>
          <button
            onClick={next}
            className="px-3 py-2 rounded-xl bg-white border shadow-sm hover:bg-gray-50"
          >
            ▶
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-400">불러오는 중...</div>
        ) : (
          <Calendar
            year={year}
            month={month}
            duties={duties}
            holidays={holidays}
            users={users}
            currentUserId={session?.userId}
            today={todayStr}
            onDayClick={(d) => setSelectedDate(d)}
          />
        )}

        {duties.length === 0 && !loading && (
          <div className="mt-6 text-center text-sm text-gray-500">
            이 달 당직표가 비어있습니다.{" "}
            {isAdmin && (
              <Link href="/admin/generate" className="text-brand underline">
                월력 생성하러 가기
              </Link>
            )}
          </div>
        )}
      </main>

      {selectedDuty && (
        <div
          className="fixed inset-0 bg-black/50 z-20 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSelectedDate(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-extrabold text-lg">
                  {selectedDuty.date}
                </div>
                <div className="text-xs text-gray-500">
                  {selectedDuty.weekday}
                  {selectedDuty.type === "weekend_or_holiday" && " · 주말/공휴일"}
                  {(() => {
                    const h = holidays.find((x) => x.date === selectedDuty.date);
                    return h ? <span className="text-red-500 font-semibold"> · {h.name}</span> : null;
                  })()}
                </div>
              </div>
              <button
                onClick={() => setSelectedDate(null)}
                className="text-gray-400 text-xl w-8 h-8 rounded-full hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            {!editMode &&
              selectedDuty.assignments.map((a, idx) => {
                // 현재 사용자의 역할에 맞는 대상자 id
                const myRole = me?.role;
                const targetPersonId =
                  myRole === "supervisor"
                    ? a.supervisorId
                    : myRole === "leader"
                    ? a.leaderId
                    : myRole === "member"
                    ? a.memberId
                    : null;
                const requestUrl =
                  `/request?target=${selectedDuty.date}` +
                  `&targetShift=${a.shift}` +
                  (targetPersonId ? `&targetPersonId=${targetPersonId}` : "");
                const changed = (field: string) =>
                  selectedDuty.recentChanges?.includes(`${idx}_${field}`) ?? false;
                return (
                  <div
                    key={idx}
                    className="border border-gray-200 rounded-xl p-3 mb-2 text-sm space-y-1.5 bg-gradient-to-br from-gray-50 to-white"
                  >
                    {selectedDuty.type === "weekend_or_holiday" && (
                      <div className="font-bold text-brand">{shiftTitle(a.shift)}</div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">당직 책임관</span>
                      <span className={`font-semibold ${changed("supervisorId") ? "text-blue-600" : ""}`}>
                        {nameOf(a.supervisorId)}
                        {changed("supervisorId") && <span className="ml-1 text-[10px] bg-blue-100 text-blue-600 px-1 rounded">변경</span>}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">조장</span>
                      <span className={`font-semibold ${changed("leaderId") ? "text-blue-600" : ""}`}>
                        {nameOf(a.leaderId)}
                        {changed("leaderId") && <span className="ml-1 text-[10px] bg-blue-100 text-blue-600 px-1 rounded">변경</span>}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">조원</span>
                      <span className={`font-semibold ${changed("memberId") ? "text-blue-600" : ""}`}>
                        {nameOf(a.memberId)}
                        {changed("memberId") && <span className="ml-1 text-[10px] bg-blue-100 text-blue-600 px-1 rounded">변경</span>}
                      </span>
                    </div>
                    {me && !isAdmin && (
                      <Link
                        href={requestUrl}
                        className="mt-2 block text-center bg-brand/10 text-brand hover:bg-brand hover:text-white border border-brand/30 py-1.5 rounded-lg text-xs font-semibold transition"
                      >
                        이 날짜로 변경 요청
                        {selectedDuty.type === "weekend_or_holiday"
                          ? ` (${a.shift === "day" ? "일직" : "숙직"})`
                          : ""}
                      </Link>
                    )}
                  </div>
                );
              })}

            {editMode && draft && (
              <>
                {draft.map((a, idx) => (
                  <div
                    key={idx}
                    className="border border-amber-200 rounded-xl p-3 mb-2 text-sm space-y-2 bg-amber-50/60"
                  >
                    {selectedDuty.type === "weekend_or_holiday" && (
                      <div className="font-bold text-amber-700">
                        {shiftTitle(a.shift)}
                      </div>
                    )}
                    <label className="block text-xs">
                      <span className="text-gray-500">당직 책임관</span>
                      <select
                        value={a.supervisorId ?? ""}
                        onChange={(e) =>
                          updateSlot(idx, "supervisorId", e.target.value)
                        }
                        className="w-full border rounded-lg px-2 py-1.5 mt-0.5 bg-white"
                      >
                        <option value="">(없음)</option>
                        {supervisorPool.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} · {u.dept}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs">
                      <span className="text-gray-500">조장</span>
                      <select
                        value={a.leaderId ?? ""}
                        onChange={(e) =>
                          updateSlot(idx, "leaderId", e.target.value)
                        }
                        className="w-full border rounded-lg px-2 py-1.5 mt-0.5 bg-white"
                      >
                        <option value="">(없음)</option>
                        {leaderPool.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} · {u.dept}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs">
                      <span className="text-gray-500">조원</span>
                      <select
                        value={a.memberId ?? ""}
                        onChange={(e) =>
                          updateSlot(idx, "memberId", e.target.value)
                        }
                        className="w-full border rounded-lg px-2 py-1.5 mt-0.5 bg-white"
                      >
                        <option value="">(없음)</option>
                        {memberPool.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} · {u.dept}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}

                {editMsg && (
                  <div className="text-xs text-red-600 mb-2">{editMsg}</div>
                )}

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="flex-1 bg-brand text-white py-2.5 rounded-xl font-bold active:scale-[0.98] disabled:opacity-60"
                  >
                    {saving ? "저장 중..." : "저장"}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="flex-1 border py-2.5 rounded-xl font-semibold"
                  >
                    취소
                  </button>
                </div>
              </>
            )}

            {!editMode && isAdmin && (
              <button
                onClick={startEdit}
                className="w-full mt-2 border border-gray-800 py-2.5 rounded-xl font-bold active:scale-[0.98] transition"
              >
                ✎ 직접 지정
              </button>
            )}
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
