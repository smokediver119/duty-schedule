import * as XLSX from "xlsx";
import type { User, Duty, DutyAssignment } from "@/types";

export interface ParsedSlot {
  name: string;
  userId: string | null;
  isUnmatched: boolean;
}

export interface ParsedAssignmentRow {
  shift: DutyAssignment["shift"];
  supervisor: ParsedSlot;
  leader: ParsedSlot;
  member: ParsedSlot;
}

export interface ParsedDuty {
  date: string;
  weekday: string;
  type: "weekday" | "weekend_or_holiday";
  rows: ParsedAssignmentRow[];
  recentChanges: string[]; // ["0_supervisorId", "1_leaderId", ...]
}

export interface ExcelParseResult {
  year: number;
  month: number;
  duties: ParsedDuty[];
  unmatchedNames: string[];
  changeCount: number;
}

export function parseExcelBuffer(
  buf: ArrayBuffer,
  users: User[],
  existingDuties: Duty[]
): ExcelParseResult {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | null)[]>(ws, {
    header: 1,
    defval: null,
  }) as (string | null)[][];

  // Detect year/month from title cell (e.g. "2026년 5월 (상황)...")
  let year = new Date().getFullYear();
  let month = new Date().getMonth() + 1;
  outer: for (const row of rows) {
    for (const cell of row) {
      if (!cell) continue;
      const m = String(cell).match(/(\d{4})년\s*(\d+)월/);
      if (m) {
        year = parseInt(m[1]);
        month = parseInt(m[2]);
        break outer;
      }
    }
  }

  const nameToId = new Map<string, string>();
  users.forEach((u) => nameToId.set(u.name, u.id));

  const existingMap = new Map<string, Duty>();
  existingDuties.forEach((d) => existingMap.set(d.date, d));

  // Find first data row by scanning ALL columns for "N월 N일"
  // (SheetJS may strip leading empty columns, so we can't hardcode col index)
  let dataStartIdx = -1;
  let dateColIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < (rows[i]?.length ?? 0); j++) {
      const cell = rows[i][j];
      if (cell && /\d+월\s*\d+일/.test(String(cell))) {
        dataStartIdx = i;
        dateColIdx = j;
        break;
      }
    }
    if (dataStartIdx !== -1) break;
  }
  if (dataStartIdx === -1 || dateColIdx === -1)
    throw new Error("데이터 행을 찾을 수 없습니다");

  // Column offsets relative to the date column
  // date+1=구분, date+2=요일, date+3=책임관계급, date+4=책임관성명,
  // date+5=조장계급, date+6=조장성명, date+7=조원계급, date+8=조원성명
  const shiftOff  = 1;
  const dowOff    = 2;
  const supOff    = 4;
  const ledOff    = 6;
  const memOff    = 8;

  const allUnmatched = new Set<string>();

  const resolveSlot = (name: string | null | undefined): ParsedSlot => {
    if (!name || !String(name).trim()) {
      return { name: "-", userId: null, isUnmatched: false };
    }
    const n = String(name).trim();
    const userId = nameToId.get(n) ?? null;
    if (!userId) allUnmatched.add(n);
    return { name: n, userId, isUnmatched: !userId };
  };

  const DOW = ["일", "월", "화", "수", "목", "금", "토"];

  const duties: ParsedDuty[] = [];
  let currentDate: string | null = null;
  let currentWeekday = "";
  let currentType: "weekday" | "weekend_or_holiday" = "weekday";
  let currentRows: ParsedAssignmentRow[] = [];

  const flushDuty = () => {
    if (!currentDate || currentRows.length === 0) return;

    const existing = existingMap.get(currentDate);
    const recentChanges: string[] = [];

    if (existing) {
      currentRows.forEach((row, idx) => {
        const oldA = existing.assignments.find((a) => a.shift === row.shift);
        if (!oldA) return;
        if (row.supervisor.userId !== oldA.supervisorId)
          recentChanges.push(`${idx}_supervisorId`);
        if (row.leader.userId !== oldA.leaderId)
          recentChanges.push(`${idx}_leaderId`);
        if (row.member.userId !== oldA.memberId)
          recentChanges.push(`${idx}_memberId`);
      });
    }

    duties.push({
      date: currentDate,
      weekday: currentWeekday,
      type: currentType,
      rows: [...currentRows],
      recentChanges,
    });
    currentRows = [];
  };

  for (let i = dataStartIdx; i < rows.length; i++) {
    const row = rows[i];
    const dateCell  = row[dateColIdx]           ? String(row[dateColIdx]).trim()           : "";
    const shiftCell = row[dateColIdx + shiftOff] ? String(row[dateColIdx + shiftOff]).trim() : "";
    const weekdayCell = row[dateColIdx + dowOff] ? String(row[dateColIdx + dowOff]).trim()  : "";

    const supName = row[dateColIdx + supOff] ? String(row[dateColIdx + supOff]).trim() : null;
    const ledName = row[dateColIdx + ledOff] ? String(row[dateColIdx + ledOff]).trim() : null;
    const memName = row[dateColIdx + memOff] ? String(row[dateColIdx + memOff]).trim() : null;

    if (!supName && !ledName && !memName) continue;

    if (dateCell && /\d+월\s*\d+일/.test(dateCell)) {
      flushDuty();
      const m = dateCell.match(/(\d+)월\s*(\d+)일/);
      if (!m) continue;
      const mo = parseInt(m[1]);
      const da = parseInt(m[2]);
      currentDate = `${year}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
      currentWeekday =
        weekdayCell ||
        DOW[new Date(currentDate + "T00:00:00").getDay()];
      currentType =
        shiftCell === "일직" || shiftCell === "숙직"
          ? "weekend_or_holiday"
          : "weekday";
    }

    if (!currentDate) continue;

    const shift: DutyAssignment["shift"] =
      shiftCell === "일직" ? "day" : shiftCell === "숙직" ? "night" : "full";

    currentRows.push({
      shift,
      supervisor: resolveSlot(supName),
      leader: resolveSlot(ledName),
      member: resolveSlot(memName),
    });
  }
  flushDuty();

  const changeCount = duties.reduce((s, d) => s + d.recentChanges.length, 0);

  return {
    year,
    month,
    duties,
    unmatchedNames: Array.from(allUnmatched),
    changeCount,
  };
}

/** Convert ParsedDuty[] → Firestore-ready Duty[] */
export function toFirestoreDuties(
  parsed: ParsedDuty[]
): Omit<Duty, "id">[] {
  return parsed.map((p) => ({
    date: p.date,
    weekday: p.weekday,
    type: p.type,
    assignments: p.rows.map((r) => ({
      shift: r.shift,
      supervisorId: r.supervisor.userId,
      leaderId: r.leader.userId,
      memberId: r.member.userId,
    })),
    recentChanges: p.recentChanges,
  }));
}
