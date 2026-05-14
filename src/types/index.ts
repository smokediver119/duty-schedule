export type UserRole = "supervisor" | "leader" | "member" | "special";
// supervisor = 당직 책임관 (소방경)
// leader     = 조장 (소방위/소방장)
// member     = 조원 (소방교/소방사)
// special    = 특별경계 (소방령)

export type UserRank =
  | "소방령"
  | "소방경"
  | "소방위"
  | "소방장"
  | "소방교"
  | "소방사";

export type Department = "행정과" | "예방과" | "재난과" | "대응단" | string;

export interface User {
  id: string;
  name: string;
  rank: UserRank;
  dept: Department;
  role: UserRole;
  orderIndex: number;
  active: boolean;
  ext?: string | null; // 내선번호(경비) — 로그인 ID로 사용
}

export type DutyType = "weekday" | "weekend_or_holiday";
export type DutyShift = "full" | "day" | "night";

export interface DutyAssignment {
  shift: DutyShift;
  supervisorId: string | null;
  leaderId: string | null;
  memberId: string | null;
}

export interface Duty {
  id: string; // YYYY-MM-DD
  date: string;
  weekday?: string;
  type: DutyType;
  assignments: DutyAssignment[];
  recentChanges?: string[]; // ["0_supervisorId", "1_leaderId"] — set by Excel import, cleared on next import
}

export type RequestStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "approved"
  | "cancelled";

export type RequestedRole = "supervisor" | "leader" | "member";

export type RequestType = "swap" | "substitute";

export interface DutyRequest {
  id: string;
  requestType?: RequestType; // 없으면 swap으로 간주 (하위 호환)
  requesterId: string;
  targetId: string | null;
  dutyDate: string;
  shift: DutyShift;
  role: RequestedRole;
  targetDutyDate: string;
  targetShift: DutyShift;
  status: RequestStatus;
  reason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Holiday {
  id: string; // YYYY-MM-DD
  date: string;
  name: string;
}

export type RoomId = "auditorium" | "small_meeting";
export type ReservationStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface RoomReservation {
  id: string;
  room: RoomId;
  date: string;        // YYYY-MM-DD (시작일)
  endDate?: string;    // YYYY-MM-DD (종료일, 없으면 당일)
  startTime: string;   // HH:MM
  endTime: string;     // HH:MM
  purpose: string;
  requesterId: string;
  status: ReservationStatus;
  adminNote?: string;
  createdAt: number;
  updatedAt: number;
}

export type HistoryEvent =
  | "duty_generated"
  | "duty_manual_edit"
  | "request_created"
  | "request_accepted"
  | "request_rejected"
  | "request_cancelled"
  | "request_approved"
  | "request_auto_cancelled"
  | "holiday_added"
  | "holiday_removed"
  | "user_added"
  | "user_updated"
  | "user_deactivated"
  | "reservation_created"
  | "reservation_approved"
  | "reservation_rejected"
  | "reservation_cancelled";

export interface HistoryLog {
  id: string;
  event: HistoryEvent;
  actorId: string | null;
  payload: Record<string, unknown>;
  timestamp: number;
}

export type SessionRole = "worker" | "admin";

export interface Session {
  userId: string;
  role: SessionRole;
  createdAt: number;
}
