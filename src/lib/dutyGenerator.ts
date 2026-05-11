import {
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
} from "date-fns";
import type { Duty, DutyAssignment, User } from "@/types";
import { isHolidayOrWeekend } from "./holidays";

export interface RotationState {
  supervisor: number;
  leader: number;
  member: number;
}

interface GenerateInput {
  year: number;
  month: number; // 1-12
  users: User[];
  holidays: Set<string>;
  rotation: RotationState;
}

export interface GenerateResult {
  duties: Duty[];
  nextRotation: RotationState;
}

export function generateMonth({
  year,
  month,
  users,
  holidays,
  rotation,
}: GenerateInput): GenerateResult {
  const supervisors = users
    .filter((u) => u.active && u.role === "supervisor")
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const leaders = users
    .filter((u) => u.active && u.role === "leader")
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const members = users
    .filter((u) => u.active && u.role === "member")
    .sort((a, b) => a.orderIndex - b.orderIndex);

  if (!supervisors.length || !leaders.length || !members.length) {
    throw new Error("각 역할(책임관/조장/조원)에 최소 1명씩 필요합니다.");
  }

  let sIdx = rotation.supervisor % supervisors.length;
  let lIdx = rotation.leader % leaders.length;
  let mIdx = rotation.member % members.length;

  const pickSlot = (): DutyAssignment => {
    const sup = supervisors[sIdx % supervisors.length].id;
    const lead = leaders[lIdx % leaders.length].id;
    const mem = members[mIdx % members.length].id;
    sIdx++;
    lIdx++;
    mIdx++;
    return {
      shift: "full",
      supervisorId: sup,
      leaderId: lead,
      memberId: mem,
    };
  };

  const first = startOfMonth(new Date(year, month - 1, 1));
  const last = endOfMonth(first);
  const days = eachDayOfInterval({ start: first, end: last });

  const duties: Duty[] = days.map((d) => {
    const iso = format(d, "yyyy-MM-dd");
    const holiday = isHolidayOrWeekend(iso, holidays);
    if (!holiday) {
      const slot = pickSlot();
      return {
        id: iso,
        date: iso,
        weekday: "월화수목금토일"[d.getDay() === 0 ? 6 : d.getDay() - 1],
        type: "weekday",
        assignments: [{ ...slot, shift: "full" }],
      };
    }
    const day = pickSlot();
    const night = pickSlot();
    return {
      id: iso,
      date: iso,
      weekday: "월화수목금토일"[d.getDay() === 0 ? 6 : d.getDay() - 1],
      type: "weekend_or_holiday",
      assignments: [
        { ...day, shift: "day" },
        { ...night, shift: "night" },
      ],
    };
  });

  return {
    duties,
    nextRotation: {
      supervisor: sIdx % supervisors.length,
      leader: lIdx % leaders.length,
      member: mIdx % members.length,
    },
  };
}
