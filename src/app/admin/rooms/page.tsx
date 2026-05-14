"use client";

import { useState } from "react";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { AuthGuard } from "@/components/AuthGuard";
import { NavBar } from "@/components/NavBar";
import { useAuth } from "@/hooks/useAuth";
import { useReservations } from "@/hooks/useReservations";
import { db } from "@/lib/firebase";
import { logHistory } from "@/lib/history";
import type { RoomReservation } from "@/types";

const ROOM_LABELS = { auditorium: "강당", small_meeting: "소회의실" } as const;

const STATUS_LABELS = {
  pending:   "대기중",
  approved:  "승인됨",
  rejected:  "반려됨",
  cancelled: "취소됨",
} as const;

const STATUS_COLORS: Record<RoomReservation["status"], string> = {
  pending:   "bg-yellow-100 text-yellow-800",
  approved:  "bg-green-100 text-green-800",
  rejected:  "bg-gray-100 text-gray-500",
  cancelled: "bg-gray-100 text-gray-400",
};

export default function AdminRoomsPage() {
  const { session, users } = useAuth();
  const { reservations }   = useReservations();

  const [tab, setTab]             = useState<"pending" | "all">("pending");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote]   = useState("");

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "?";

  const pending   = reservations.filter((r) => r.status === "pending");
  const displayed =
    tab === "pending"
      ? pending
      : [...reservations].sort((a, b) => b.createdAt - a.createdAt);

  const approve = async (r: RoomReservation) => {
    const now = Date.now();
    await updateDoc(doc(db, "reservations", r.id), {
      status:    "approved",
      updatedAt: now,
    });
    await setDoc(
      doc(db, "userInbox", r.requesterId),
      { rooms_lastAt: now },
      { merge: true }
    );
    await logHistory("reservation_approved", session?.userId ?? null, {
      reservationId: r.id,
    });
  };

  const reject = async (r: RoomReservation) => {
    const now  = Date.now();
    const note = rejectNote.trim();
    await updateDoc(doc(db, "reservations", r.id), {
      status:    "rejected",
      updatedAt: now,
      ...(note ? { adminNote: note } : {}),
    });
    await setDoc(
      doc(db, "userInbox", r.requesterId),
      { rooms_lastAt: now },
      { merge: true }
    );
    await logHistory("reservation_rejected", session?.userId ?? null, {
      reservationId: r.id,
      note,
    });
    setRejectingId(null);
    setRejectNote("");
  };

  return (
    <AuthGuard adminOnly>
      <NavBar />
      <main className="pb-24 px-3 pt-3 max-w-md mx-auto space-y-3">
        <h1 className="text-xl font-extrabold">🏢 시설 예약 관리</h1>

        {/* 탭 */}
        <div className="flex gap-2">
          {(["pending", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative px-4 py-1.5 rounded-full text-sm font-semibold border transition ${
                tab === t
                  ? "bg-brand text-white border-brand"
                  : "bg-white text-gray-500 border-gray-200"
              }`}
            >
              {t === "pending" ? "대기중" : "전체"}
              {t === "pending" && pending.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                  {pending.length > 9 ? "9+" : pending.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 목록 */}
        {displayed.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-12 bg-white rounded-2xl border border-dashed">
            {tab === "pending" ? "대기중인 예약 없음" : "예약 없음"}
          </div>
        ) : (
          <ul className="space-y-2">
            {displayed.map((r) => (
              <li
                key={r.id}
                className="bg-white border border-gray-200 rounded-2xl p-3.5 text-sm shadow-sm space-y-2"
              >
                {/* 헤더 */}
                <div className="flex justify-between items-center">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                      r.room === "auditorium"
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {ROOM_LABELS[r.room]}
                  </span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[r.status]}`}
                  >
                    {STATUS_LABELS[r.status]}
                  </span>
                </div>

                {/* 내용 */}
                <div>
                  <div className="font-semibold text-gray-800">
                    {r.date}
                    {r.endDate && r.endDate !== r.date ? ` ~ ${r.endDate}` : ""}
                    <span className="text-gray-500 font-normal ml-2 text-xs">
                      {r.startTime} ~ {r.endTime}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">{r.purpose}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    신청자: {nameOf(r.requesterId)}
                  </div>
                </div>

                {r.adminNote && (
                  <div className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                    반려 사유: {r.adminNote}
                  </div>
                )}

                {/* 승인/반려 액션 */}
                {r.status === "pending" && (
                  <div className="space-y-2 pt-1">
                    {rejectingId === r.id ? (
                      <>
                        <input
                          type="text"
                          placeholder="반려 사유 (선택사항)"
                          value={rejectNote}
                          onChange={(e) => setRejectNote(e.target.value)}
                          className="w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-brand"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setRejectingId(null); setRejectNote(""); }}
                            className="flex-1 border py-2 rounded-lg text-xs font-semibold hover:bg-gray-50"
                          >
                            취소
                          </button>
                          <button
                            onClick={() => reject(r)}
                            className="flex-1 bg-red-500 text-white py-2 rounded-lg text-xs font-bold"
                          >
                            반려 확정
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setRejectingId(r.id); setRejectNote(""); }}
                          className="flex-1 border py-2 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-50"
                        >
                          반려
                        </button>
                        <button
                          onClick={() => approve(r)}
                          className="flex-1 bg-green-500 text-white py-2 rounded-lg text-xs font-bold"
                        >
                          승인
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </AuthGuard>
  );
}
