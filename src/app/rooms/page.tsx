"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { AuthGuard } from "@/components/AuthGuard";
import { NavBar } from "@/components/NavBar";
import { RoomCalendar } from "@/components/RoomCalendar";
import { useAuth } from "@/hooks/useAuth";
import { useReservations } from "@/hooks/useReservations";
import { useRoomUnread } from "@/hooks/useRoomUnread";
import { db } from "@/lib/firebase";
import { logHistory } from "@/lib/history";
import type { RoomId, RoomReservation } from "@/types";

const ROOM_LABELS: Record<RoomId, string> = {
  auditorium:    "강당",
  small_meeting: "소회의실",
};

const STATUS_LABELS: Record<RoomReservation["status"], string> = {
  pending:   "대기중",
  approved:  "승인됨",
  rejected:  "반려됨",
  cancelled: "취소됨",
};

const STATUS_COLORS: Record<RoomReservation["status"], string> = {
  pending:   "bg-yellow-100 text-yellow-800",
  approved:  "bg-green-100 text-green-800",
  rejected:  "bg-gray-100 text-gray-500",
  cancelled: "bg-gray-100 text-gray-400",
};

// 08:00 ~ 22:00, 30분 단위
const TIME_OPTIONS = Array.from({ length: 29 }, (_, i) => {
  const h = 8 + Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

function hasConflict(
  newStart: string,
  newEnd: string,
  newStartTime: string,
  newEndTime: string,
  room: RoomId,
  existing: RoomReservation[],
  excludeId?: string
): boolean {
  return existing.some((r) => {
    if (r.room !== room) return false;
    if (r.status === "rejected" || r.status === "cancelled") return false;
    if (excludeId && r.id === excludeId) return false;
    const eStart = r.date;
    const eEnd   = r.endDate ?? r.date;
    // 날짜 범위가 겹치지 않으면 충돌 없음
    if (newEnd < eStart || newStart > eEnd) return false;
    // 날짜 범위가 겹쳐도 시간이 겹치지 않으면 충돌 없음
    return newStartTime < r.endTime && newEndTime > r.startTime;
  });
}

export default function RoomsPage() {
  const { session, users } = useAuth();
  const { reservations }   = useReservations();
  const { markRead }       = useRoomUnread();
  const myId    = session?.userId ?? "";
  const isAdmin = session?.role === "admin";

  const now   = new Date();
  const today = format0(now);
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showForm, setShowForm]       = useState(false);

  // Form state
  const [room, setRoom]               = useState<RoomId>("auditorium");
  const [formDate, setFormDate]       = useState(today);
  const [multiDay, setMultiDay]       = useState(false);
  const [formEndDate, setFormEndDate] = useState(today);
  const [startTime, setStartTime]     = useState("09:00");
  const [endTime, setEndTime]         = useState("10:00");
  const [purpose, setPurpose]         = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [formMsg, setFormMsg]         = useState("");

  useEffect(() => { if (myId) markRead(); }, [myId]); // eslint-disable-line

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "?";

  const prevMonth = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  };

  // 선택한 날짜의 예약
  const dayReservations = useMemo(() => {
    if (!selectedDay) return [];
    return reservations.filter((r) => {
      if (r.status === "rejected" || r.status === "cancelled") return false;
      const end = r.endDate ?? r.date;
      return r.date <= selectedDay && selectedDay <= end;
    });
  }, [selectedDay, reservations]);

  // 내 예약 (진행 예정)
  const myReservations = useMemo(
    () =>
      reservations
        .filter(
          (r) =>
            r.requesterId === myId &&
            r.status !== "cancelled" &&
            r.status !== "rejected" &&
            (r.endDate ?? r.date) >= today
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [reservations, myId, today]
  );

  // 충돌 여부
  const conflict = useMemo(() => {
    if (!showForm) return false;
    const effEnd = multiDay ? formEndDate : formDate;
    return hasConflict(formDate, effEnd, startTime, endTime, room, reservations);
  }, [showForm, room, formDate, formEndDate, multiDay, startTime, endTime, reservations]);

  // endTime이 startTime보다 앞이면 자동 보정
  useEffect(() => {
    if (endTime <= startTime) {
      const idx = TIME_OPTIONS.indexOf(startTime);
      setEndTime(TIME_OPTIONS[Math.min(idx + 1, TIME_OPTIONS.length - 1)]);
    }
  }, [startTime]); // eslint-disable-line

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (conflict || !purpose.trim()) return;
    setSubmitting(true);
    setFormMsg("");
    try {
      const ts   = Date.now();
      const effEnd = multiDay && formEndDate > formDate ? formEndDate : undefined;
      const data: Omit<RoomReservation, "id"> = {
        room,
        date: formDate,
        ...(effEnd ? { endDate: effEnd } : {}),
        startTime,
        endTime,
        purpose: purpose.trim(),
        requesterId: myId,
        status: isAdmin ? "approved" : "pending",
        createdAt: ts,
        updatedAt: ts,
      };
      const ref = await addDoc(collection(db, "reservations"), data);
      await logHistory("reservation_created", myId, {
        reservationId: ref.id,
        room,
        date: formDate,
      });
      setFormMsg(isAdmin ? "✅ 예약 완료" : "✅ 신청 완료 (관리자 승인 대기)");
      setPurpose("");
      setMultiDay(false);
      setTimeout(() => {
        setShowForm(false);
        setFormMsg("");
      }, 1500);
    } catch (err) {
      setFormMsg("❌ " + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelReservation = async (id: string, label = "예약을 취소하시겠습니까?") => {
    if (!confirm(label)) return;
    await updateDoc(doc(db, "reservations", id), {
      status: "cancelled",
      updatedAt: Date.now(),
    });
    await logHistory("reservation_cancelled", myId, { reservationId: id });
  };

  // 관리자: 전체 예약 중 진행 예정인 것 (승인됨 + 대기중)
  const allUpcoming = useMemo(
    () =>
      reservations
        .filter(
          (r) =>
            r.status !== "cancelled" &&
            r.status !== "rejected" &&
            (r.endDate ?? r.date) >= today
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [reservations, today]
  );

  return (
    <AuthGuard>
      <NavBar />
      <main className="pb-24 px-3 pt-3 max-w-md mx-auto space-y-3">
        {/* 월 이동 */}
        <div className="flex items-center justify-between">
          <button
            onClick={prevMonth}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600 text-lg leading-none"
          >
            ◀
          </button>
          <h1 className="text-lg font-extrabold">{year}년 {month}월</h1>
          <button
            onClick={nextMonth}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600 text-lg leading-none"
          >
            ▶
          </button>
        </div>

        {/* 월력 */}
        <RoomCalendar
          year={year}
          month={month}
          reservations={reservations}
          today={today}
          onDayClick={setSelectedDay}
        />

        {/* 예약 목록 — 관리자: 전체, 근무자: 내 것 */}
        {(isAdmin ? allUpcoming : myReservations).length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-bold text-gray-700">
              {isAdmin ? "전체 예약" : "내 예약"}
            </h2>
            <ul className="space-y-2">
              {(isAdmin ? allUpcoming : myReservations).map((r) => (
                <li
                  key={r.id}
                  className="bg-white border border-gray-200 rounded-2xl p-3.5 text-sm shadow-sm space-y-1.5"
                >
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
                  <div className="font-semibold text-gray-800">
                    {r.date}
                    {r.endDate && r.endDate !== r.date ? ` ~ ${r.endDate}` : ""}
                    <span className="text-gray-500 font-normal ml-2 text-xs">
                      {r.startTime} ~ {r.endTime}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600">{r.purpose}</div>
                  {isAdmin && (
                    <div className="text-xs text-gray-400">신청자: {nameOf(r.requesterId)}</div>
                  )}
                  {r.adminNote && (
                    <div className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                      반려 사유: {r.adminNote}
                    </div>
                  )}
                  {/* 근무자: 대기중 신청 취소 */}
                  {!isAdmin && r.status === "pending" && (
                    <button
                      onClick={() => cancelReservation(r.id)}
                      className="w-full mt-1 border py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-50"
                    >
                      신청 취소
                    </button>
                  )}
                  {/* 관리자: 승인된 예약 취소 */}
                  {isAdmin && r.status === "approved" && (
                    <button
                      onClick={() => cancelReservation(r.id, "승인된 예약을 취소하시겠습니까?")}
                      className="w-full mt-1 border border-red-200 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50"
                    >
                      승인 취소
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 예약 신청 버튼 */}
        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-brand text-white py-3 rounded-xl font-bold shadow-lg shadow-brand/20 hover:bg-brand-dark active:scale-[0.98] transition"
        >
          + 예약 신청
        </button>
      </main>

      {/* 날짜 상세 모달 */}
      {selectedDay && (
        <div
          className="fixed inset-0 bg-black/50 z-30 flex items-end sm:items-center justify-center"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-sm p-5 space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h3 className="font-extrabold text-base">{selectedDay} 예약 현황</h3>
              <button
                onClick={() => setSelectedDay(null)}
                className="text-gray-400 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            {dayReservations.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-4">예약 없음</p>
            ) : (
              <ul className="space-y-2">
                {dayReservations.map((r) => (
                  <li key={r.id} className="border rounded-xl p-3 text-sm space-y-1">
                    <div className="flex justify-between">
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
                    <div className="font-semibold text-gray-800">
                      {r.startTime} ~ {r.endTime}
                    </div>
                    <div className="text-xs text-gray-600">{r.purpose}</div>
                    <div className="text-xs text-gray-400">{nameOf(r.requesterId)}</div>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={() => {
                setFormDate(selectedDay);
                setFormEndDate(selectedDay);
                setMultiDay(false);
                setSelectedDay(null);
                setShowForm(true);
              }}
              className="w-full mt-1 bg-brand text-white py-2.5 rounded-xl font-bold text-sm active:scale-[0.98] transition"
            >
              + 예약 신청
            </button>
          </div>
        </div>
      )}

      {/* 예약 신청 폼 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-30 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-extrabold text-base">예약 신청</h3>
                <button
                  onClick={() => { setShowForm(false); setFormMsg(""); }}
                  className="text-gray-400 text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* 시설 */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">시설</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["auditorium", "small_meeting"] as RoomId[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRoom(r)}
                        className={`py-2.5 rounded-xl text-sm font-semibold border transition active:scale-[0.98] ${
                          room === r
                            ? r === "auditorium"
                              ? "bg-indigo-500 text-white border-indigo-500"
                              : "bg-emerald-500 text-white border-emerald-500"
                            : "bg-white text-gray-600 border-gray-200"
                        }`}
                      >
                        {ROOM_LABELS[r]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 날짜 */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">날짜</p>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => {
                      setFormDate(e.target.value);
                      if (!multiDay) setFormEndDate(e.target.value);
                    }}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand"
                    required
                  />
                  <label className="flex items-center gap-2 mt-2 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={multiDay}
                      onChange={(e) => {
                        setMultiDay(e.target.checked);
                        if (!e.target.checked) setFormEndDate(formDate);
                      }}
                    />
                    복수일 예약 (종료 날짜 별도 지정)
                  </label>
                  {multiDay && (
                    <input
                      type="date"
                      value={formEndDate}
                      min={formDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand mt-2"
                      required
                    />
                  )}
                </div>

                {/* 시간 */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">시작 시간</p>
                    <select
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand"
                    >
                      {TIME_OPTIONS.slice(0, -1).map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">종료 시간</p>
                    <select
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand"
                    >
                      {TIME_OPTIONS.filter((t) => t > startTime).map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 목적 */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">사용 목적</p>
                  <input
                    type="text"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="예: 교육, 회의, 행사..."
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand"
                    required
                  />
                </div>

                {/* 충돌 경고 */}
                {conflict && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700 font-semibold">
                    ⚠️ 해당 기간에 이미 예약이 있습니다
                  </div>
                )}

                {formMsg && (
                  <p
                    className={`text-sm text-center font-semibold ${
                      formMsg.startsWith("✅") ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {formMsg}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting || conflict || !purpose.trim()}
                  className="w-full bg-brand text-white py-3 rounded-xl font-bold disabled:opacity-40 active:scale-[0.98] transition"
                >
                  {submitting ? "신청 중..." : isAdmin ? "예약 (즉시 승인)" : "신청"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}

function format0(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
