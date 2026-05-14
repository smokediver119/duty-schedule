"use client";

import {
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  startOfMonth,
} from "date-fns";
import { useMemo } from "react";
import type { RoomId, RoomReservation } from "@/types";

const ROOM_COLOR: Record<RoomId, { bar: string; label: string }> = {
  auditorium:    { bar: "bg-indigo-500",  label: "강당" },
  small_meeting: { bar: "bg-emerald-500", label: "소회의실" },
};

interface BarSegment {
  id: string;
  room: RoomId;
  startCol: number;
  endCol: number;
  isActualStart: boolean;
  isActualEnd: boolean;
  isPending: boolean;
  purpose: string;
}

const BAR_LANE_HEIGHT = 20;

function assignLanes(segs: BarSegment[]): Array<BarSegment & { lane: number }> {
  const sorted = [...segs].sort((a, b) => a.startCol - b.startCol);
  const laneEndCols: number[] = [];
  return sorted.map((seg) => {
    let laneIdx = laneEndCols.findIndex((endCol) => endCol < seg.startCol);
    if (laneIdx === -1) {
      laneIdx = laneEndCols.length;
      laneEndCols.push(seg.endCol);
    } else {
      laneEndCols[laneIdx] = seg.endCol;
    }
    return { ...seg, lane: laneIdx };
  });
}

interface Props {
  year: number;
  month: number;
  reservations: RoomReservation[];
  today?: string;
  onDayClick?: (date: string) => void;
}

export function RoomCalendar({ year, month, reservations, today, onDayClick }: Props) {
  const first        = startOfMonth(new Date(year, month - 1));
  const last         = endOfMonth(first);
  const days         = eachDayOfInterval({ start: first, end: last });
  const firstWeekday = getDay(first);

  // Build weeks: 7-element arrays (YYYY-MM-DD or "")
  const weeks = useMemo(() => {
    const cells: string[] = [
      ...Array(firstWeekday).fill(""),
      ...days.map((d) => format(d, "yyyy-MM-dd")),
    ];
    while (cells.length % 7 !== 0) cells.push("");
    const result: string[][] = [];
    for (let i = 0; i < cells.length; i += 7) result.push(cells.slice(i, i + 7));
    return result;
  }, [year, month]); // eslint-disable-line

  // Active reservations only
  const active = useMemo(
    () => reservations.filter((r) => r.status !== "rejected" && r.status !== "cancelled"),
    [reservations]
  );

  // Bar segments per week, per room
  const weekBars = useMemo(() => {
    return weeks.map((week) => {
      const validDates = week.filter((d) => d !== "");
      if (validDates.length === 0) {
        return { auditorium: [] as BarSegment[], small_meeting: [] as BarSegment[] };
      }
      const weekStart = validDates[0];
      const weekEnd   = validDates[validDates.length - 1];

      const bars: { auditorium: BarSegment[]; small_meeting: BarSegment[] } = {
        auditorium: [],
        small_meeting: [],
      };

      for (const r of active) {
        const rStart = r.date;
        const rEnd   = r.endDate ?? r.date;
        if (rEnd < weekStart || rStart > weekEnd) continue;

        const clampedStart = rStart < weekStart ? weekStart : rStart;
        const clampedEnd   = rEnd   > weekEnd   ? weekEnd   : rEnd;

        const startCol = week.indexOf(clampedStart);
        const endCol   = week.indexOf(clampedEnd);
        if (startCol < 0 || endCol < 0) continue;

        bars[r.room].push({
          id: r.id + "_" + weekStart,
          room: r.room,
          startCol,
          endCol,
          isActualStart: clampedStart === rStart,
          isActualEnd:   clampedEnd   === rEnd,
          isPending:     r.status === "pending",
          purpose:       r.purpose,
        });
      }
      return bars;
    });
  }, [weeks, active]);

  const DOW = ["일", "월", "화", "수", "목", "금", "토"];

  const renderBars = (segs: BarSegment[], room: RoomId) => {
    if (segs.length === 0) return null;
    const withLanes = assignLanes(segs);
    const numLanes  = Math.max(...withLanes.map((s) => s.lane)) + 1;
    const color     = ROOM_COLOR[room].bar;
    return (
      <div className="relative mx-1" style={{ height: `${numLanes * BAR_LANE_HEIGHT}px` }}>
        {withLanes.map((seg) => {
          const leftPct  = `${seg.startCol * (100 / 7)}%`;
          const widthPct = `${(seg.endCol - seg.startCol + 1) * (100 / 7)}%`;
          const topPx    = seg.lane * BAR_LANE_HEIGHT + 2;
          const roundL   = seg.isActualStart ? "rounded-l-full pl-1.5" : "";
          const roundR   = seg.isActualEnd   ? "rounded-r-full"        : "";
          const opacity  = seg.isPending ? "opacity-50" : "";
          return (
            <div
              key={seg.id}
              className={`absolute ${color} ${roundL} ${roundR} ${opacity} flex items-center overflow-hidden`}
              style={{
                top:    `${topPx}px`,
                height: "16px",
                left:   `calc(${leftPct} + ${seg.isActualStart ? "2px" : "0px"})`,
                width:  `calc(${widthPct} - ${seg.isActualStart ? "2px" : "0px"} - ${seg.isActualEnd ? "2px" : "0px"})`,
              }}
              title={seg.purpose}
            >
              {seg.isActualStart && (
                <span className="text-white text-[9px] font-semibold truncate leading-none">
                  {seg.purpose}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 bg-gray-50 border-b">
        {DOW.map((d, i) => (
          <div
            key={d}
            className={`py-2 text-center text-[12px] font-bold ${
              i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-600"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wIdx) => {
        const bars     = weekBars[wIdx];
        const hasAudit = bars.auditorium.length > 0;
        const hasSmall = bars.small_meeting.length > 0;

        return (
          <div key={wIdx} className="border-b last:border-b-0">
            {/* Date numbers */}
            <div className="grid grid-cols-7">
              {week.map((dateStr, dIdx) => {
                if (!dateStr)
                  return <div key={dIdx} className="h-[60px] bg-gray-50/40" />;
                const d   = new Date(dateStr + "T00:00:00");
                const dow = getDay(d);
                const isToday = dateStr === today;
                return (
                  <button
                    key={dIdx}
                    onClick={() => onDayClick?.(dateStr)}
                    className={`h-[60px] flex items-center justify-center text-[12px] transition hover:bg-amber-50 ${
                      dow === 0 ? "bg-red-50/40" : dow === 6 ? "bg-blue-50/40" : ""
                    }`}
                  >
                    <span
                      className={`w-6 h-6 flex items-center justify-center rounded-full font-semibold ${
                        isToday
                          ? "bg-brand text-white"
                          : dow === 0
                          ? "text-red-600"
                          : dow === 6
                          ? "text-blue-600"
                          : "text-gray-700"
                      }`}
                    >
                      {d.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Event bars */}
            {(hasAudit || hasSmall) && (
              <div className="relative pb-1 pt-0.5">
                {/* 요일 배경색 컬럼 연장 */}
                <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
                  {Array(7).fill(null).map((_, i) => (
                    <div
                      key={i}
                      className={
                        i === 0 ? "bg-red-50/40" :
                        i === 6 ? "bg-blue-50/40" : ""
                      }
                    />
                  ))}
                </div>
                <div className="relative space-y-0.5">
                  {hasAudit && renderBars(bars.auditorium, "auditorium")}
                  {hasSmall && renderBars(bars.small_meeting, "small_meeting")}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex gap-4 px-3 py-2 border-t bg-gray-50/60 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded-sm bg-indigo-500 shrink-0" />
          강당
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
          소회의실
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2.5 rounded-sm bg-gray-400 opacity-50 shrink-0" />
          대기중
        </span>
      </div>
    </div>
  );
}
