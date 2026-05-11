"use client";

import {
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  startOfMonth,
} from "date-fns";
import { useMemo } from "react";
import type { Duty, Holiday, User } from "@/types";

interface Props {
  year: number;
  month: number;
  duties: Duty[];
  holidays: Holiday[];
  users: User[];
  currentUserId?: string | null;
  today?: string;
  onDayClick?: (date: string) => void;
}

export function Calendar({
  year,
  month,
  duties,
  holidays,
  users,
  currentUserId,
  today,
  onDayClick,
}: Props) {
  const first = startOfMonth(new Date(year, month - 1, 1));
  const last = endOfMonth(first);
  const days = eachDayOfInterval({ start: first, end: last });
  const firstWeekday = getDay(first); // 0=Sun

  const userMap = useMemo(() => {
    const m = new Map<string, User>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  const dutyMap = useMemo(() => {
    const m = new Map<string, Duty>();
    duties.forEach((d) => m.set(d.date, d));
    return m;
  }, [duties]);

  const holidaySet = useMemo(
    () => new Set(holidays.map((h) => h.date)),
    [holidays]
  );
  const holidayNameMap = useMemo(() => {
    const m = new Map<string, string>();
    holidays.forEach((h) => m.set(h.date, h.name));
    return m;
  }, [holidays]);

  const shortName = (id: string | null) => {
    if (!id) return "-";
    const u = userMap.get(id);
    return u ? u.name : "?";
  };

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm text-xs">
      <div className="grid grid-cols-7 bg-gray-50 text-center font-bold border-b border-gray-200">
        {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
          <div
            key={w}
            className={`py-2 text-[13px] ${
              i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-600"
            }`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`pad-${i}`} className="aspect-[3/4] bg-gray-50/50" />
        ))}
        {days.map((d) => {
          const iso = format(d, "yyyy-MM-dd");
          const duty = dutyMap.get(iso);
          const dow = getDay(d);
          const isHoliday = holidaySet.has(iso);
          const isSat = dow === 6;
          const isSun = dow === 0;
          const bg = isHoliday
            ? "bg-red-50"
            : isSun
            ? "bg-red-50"
            : isSat
            ? "bg-blue-50"
            : "bg-white";

          const isMyDuty = duty?.assignments.some((a) =>
            [a.supervisorId, a.leaderId, a.memberId].includes(
              currentUserId ?? ""
            )
          );
          const isToday = iso === today;

          return (
            <button
              key={iso}
              onClick={() => onDayClick?.(iso)}
              className={`min-h-[108px] ${isMyDuty ? "border-2 border-orange-400" : "border-t border-l border-gray-100"} p-1.5 text-left hover:bg-amber-50/60 transition relative ${bg} ${
                isMyDuty ? "bg-orange-50" : ""
              }`}
            >
              <div className="flex items-center gap-1">
                <div
                  className={`font-bold w-6 h-6 flex items-center justify-center rounded-full text-xs ${
                    isToday
                      ? "bg-brand text-white"
                      : isHoliday || isSun
                      ? "text-red-600"
                      : isSat
                      ? "text-blue-600"
                      : "text-gray-700"
                  }`}
                >
                  {d.getDate()}
                </div>
                {isHoliday && (
                  <span className="text-[10px] text-red-500 font-semibold truncate">
                    {holidayNameMap.get(iso)}
                  </span>
                )}
              </div>
              {duty ? (
                duty.assignments.map((a, idx) => {
                  const shiftBadge =
                    a.shift === "day"
                      ? "bg-amber-100 text-amber-700"
                      : a.shift === "night"
                      ? "bg-indigo-100 text-indigo-700"
                      : "";
                  const changed = (field: string) =>
                    duty.recentChanges?.includes(`${idx}_${field}`) ?? false;
                  return (
                    <div key={idx} className="mt-1 leading-tight">
                      {duty.type === "weekend_or_holiday" && (
                        <div
                          className={`inline-block text-[10px] font-bold px-1 rounded ${shiftBadge}`}
                        >
                          {a.shift === "day" ? "일직" : "숙직"}
                        </div>
                      )}
                      <div className={`truncate text-[12px] ${changed("supervisorId") ? "text-blue-600 font-semibold" : ""}`}>
                        {shortName(a.supervisorId)}
                      </div>
                      <div className={`truncate text-[12px] ${changed("leaderId") ? "text-blue-600 font-semibold" : ""}`}>
                        {shortName(a.leaderId)}
                      </div>
                      <div className={`truncate text-[12px] ${changed("memberId") ? "text-blue-600 font-semibold" : ""}`}>
                        {shortName(a.memberId)}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-gray-300 mt-1">-</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
