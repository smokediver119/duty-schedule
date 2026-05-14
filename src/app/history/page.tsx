"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { AuthGuard } from "@/components/AuthGuard";
import { NavBar } from "@/components/NavBar";
import { db } from "@/lib/firebase";
import { useUsers } from "@/hooks/useUsers";
import { useAuth } from "@/hooks/useAuth";
import { useRequests } from "@/hooks/useRequests";
import type { HistoryEvent, HistoryLog } from "@/types";

const EVENT_LABEL: Record<HistoryEvent, string> = {
  duty_generated: "📅 월력 생성",
  duty_manual_edit: "✏️ 당직표 수동 수정",
  request_created: "🔁 요청 생성",
  request_accepted: "✅ 요청 수락",
  request_rejected: "❌ 요청 거절",
  request_cancelled: "🚫 요청 취소",
  request_approved: "👍 관리자 승인",
  request_auto_cancelled: "⚠️ 자동 취소",
  holiday_added: "🎌 공휴일 추가",
  holiday_removed: "🗑️ 공휴일 삭제",
  user_added: "👤 인원 추가",
  user_updated: "👤 인원 변경",
  user_deactivated: "👤 인원 비활성",
  reservation_created:  "🏢 예약 신청",
  reservation_approved: "✅ 예약 승인",
  reservation_rejected: "❌ 예약 반려",
  reservation_cancelled: "🚫 예약 취소",
};

function parseSlot(slot: string): { date: string; shift: string } {
  const idx = slot.lastIndexOf("/");
  return { date: slot.slice(0, idx), shift: slot.slice(idx + 1) };
}

function shiftLabel(shift: string): string {
  if (shift === "day") return " 일직";
  if (shift === "night") return " 숙직";
  return "";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function slotMonth(slot: string): string {
  return slot.slice(0, 7); // "2026-05"
}

export default function HistoryPage() {
  const [logs, setLogs] = useState<HistoryLog[]>([]);
  const { users } = useUsers();
  const { session } = useAuth();
  const { requests } = useRequests();
  const isAdmin = session?.role === "admin";

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => {
    const q = query(
      collection(db, "history"),
      orderBy("timestamp", "desc"),
      limit(500)
    );
    const unsub = onSnapshot(q, (snap) =>
      setLogs(
        snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<HistoryLog, "id">) })
        )
      )
    );
    return () => unsub();
  }, []);

  const nameOf = (id: string | null | undefined) => {
    if (!id) return "?";
    return users.find((u) => u.id === id)?.name ?? "?";
  };

  // 근무자용: request_approved 이벤트만, requesterId/targetId 보강
  const swapLogs = useMemo(() => {
    const requestMap = new Map(requests.map((r) => [r.id, r]));
    return logs
      .filter((l) => l.event === "request_approved")
      .map((l) => {
        const p = l.payload as Record<string, string>;
        let requesterId: string | null = p.requesterId ?? null;
        let targetId: string | null = p.targetId ?? null;
        // 구버전 이력: requestId로 역조회
        if ((!requesterId || !targetId) && p.requestId) {
          const req = requestMap.get(p.requestId);
          if (req) {
            requesterId = req.requesterId ?? null;
            targetId = req.targetId ?? null;
          }
        }
        return { ...l, requesterId, targetId };
      })
      .filter((l) => l.payload.a && l.payload.b);
  }, [logs, requests]);

  // 월 목록 (교체이력 기준)
  const months = useMemo(() => {
    const set = new Set<string>();
    swapLogs.forEach((l) => {
      const a = (l.payload as Record<string, string>).a;
      if (a) set.add(slotMonth(a));
    });
    // 현재 월도 항상 포함
    const now = new Date();
    set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    return Array.from(set).sort().reverse();
  }, [swapLogs]);

  const filteredSwaps = useMemo(
    () =>
      swapLogs.filter((l) => {
        const a = (l.payload as Record<string, string>).a;
        return a && slotMonth(a) === selectedMonth;
      }),
    [swapLogs, selectedMonth]
  );

  const monthLabel = (m: string) => {
    const [y, mo] = m.split("-");
    return `${y}년 ${parseInt(mo)}월`;
  };

  return (
    <AuthGuard adminOnly>
      <NavBar />
      <main className="pb-24 px-3 pt-3 max-w-2xl mx-auto">
        <h1 className="text-xl font-bold mb-3">이력</h1>

        {/* 관리자: 전체 이력 */}
        {isAdmin && (
          <>
            {logs.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-8">기록 없음</div>
            ) : (
              <ul className="bg-white border rounded-xl divide-y text-sm">
                {logs.map((l) => (
                  <li key={l.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {EVENT_LABEL[l.event] ?? l.event}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(l.timestamp).toLocaleString("ko")}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {nameOf(l.actorId)}
                    </div>
                    {l.payload && Object.keys(l.payload).length > 0 && (
                      <pre className="text-[11px] text-gray-500 mt-1 bg-gray-50 p-1.5 rounded overflow-auto">
                        {JSON.stringify(l.payload, null, 0)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* 근무자: 교체 이력만 */}
        {!isAdmin && (
          <>
            {/* 월 선택 */}
            <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
              {months.map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(m)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold border transition ${
                    selectedMonth === m
                      ? "bg-brand text-white border-brand"
                      : "bg-white text-gray-600 border-gray-200"
                  }`}
                >
                  {monthLabel(m)}
                </button>
              ))}
            </div>

            {filteredSwaps.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-8">
                {monthLabel(selectedMonth)}에 승인된 교체 없음
              </div>
            ) : (
              <ul className="bg-white border rounded-xl divide-y text-sm">
                {filteredSwaps.map((l) => {
                  const p = l.payload as Record<string, string>;
                  const a = parseSlot(p.a);
                  const b = parseSlot(p.b);
                  return (
                    <li key={l.id} className="px-4 py-3 flex items-center gap-2">
                      <span>
                        {formatDate(a.date)}
                        {shiftLabel(a.shift)}{" "}
                        <span className="font-semibold">{nameOf(l.requesterId)}</span>
                      </span>
                      <span className="text-gray-400 shrink-0">↔</span>
                      <span>
                        {formatDate(b.date)}
                        {shiftLabel(b.shift)}{" "}
                        <span className="font-semibold">{nameOf(l.targetId)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </AuthGuard>
  );
}
