import type { Duty, DutyAssignment, DutyRequest } from "@/types";

const adjDate = (iso: string, offset: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const idsOnAssignment = (a: DutyAssignment): string[] =>
  [a.supervisorId, a.leaderId, a.memberId].filter(Boolean) as string[];

const idsOnDuty = (d: Duty | undefined): Set<string> => {
  const s = new Set<string>();
  if (!d) return s;
  d.assignments.forEach((a) => idsOnAssignment(a).forEach((id) => s.add(id)));
  return s;
};

export function backToBackUsersOnDate(
  iso: string,
  dutyMap: Map<string, Duty>
): Set<string> {
  const here = idsOnDuty(dutyMap.get(iso));
  const prev = idsOnDuty(dutyMap.get(adjDate(iso, -1)));
  const next = idsOnDuty(dutyMap.get(adjDate(iso, 1)));
  const out = new Set<string>();
  here.forEach((id) => {
    if (prev.has(id) || next.has(id)) out.add(id);
  });
  return out;
}

export function duplicateOnSameDate(
  iso: string,
  dutyMap: Map<string, Duty>
): Set<string> {
  const duty = dutyMap.get(iso);
  if (!duty) return new Set();
  const counts = new Map<string, number>();
  duty.assignments.forEach((a) =>
    idsOnAssignment(a).forEach((id) =>
      counts.set(id, (counts.get(id) ?? 0) + 1)
    )
  );
  const out = new Set<string>();
  counts.forEach((c, id) => {
    if (c >= 2) out.add(id);
  });
  return out;
}

/** Returns array of risk messages for an admin-pending request */
export function detectRequestRisks(
  req: DutyRequest,
  dutyMap: Map<string, Duty>,
  nameOf: (id: string | null) => string
): string[] {
  const isSubstitute = req.requestType === "substitute";
  const out: string[] = [];

  const checkAdjacent = (userId: string, date: string, excludeDate?: string) => {
    const prev = adjDate(date, -1);
    const next = adjDate(date, 1);
    const prevSet = idsOnDuty(dutyMap.get(prev));
    const nextSet = idsOnDuty(dutyMap.get(next));
    if (excludeDate !== prev && prevSet.has(userId)) return prev;
    if (excludeDate !== next && nextSet.has(userId)) return next;
    return null;
  };

  if (isSubstitute && req.targetId) {
    const adj = checkAdjacent(req.targetId, req.dutyDate);
    if (adj) out.push(`${nameOf(req.targetId)}이(가) ${adj}에도 당직 (연속)`);
  } else if (req.targetId) {
    const r = checkAdjacent(req.requesterId, req.targetDutyDate, req.dutyDate);
    if (r) out.push(`${nameOf(req.requesterId)}이(가) ${r}에도 당직 (연속)`);
    const t = checkAdjacent(req.targetId, req.dutyDate, req.targetDutyDate);
    if (t) out.push(`${nameOf(req.targetId)}이(가) ${t}에도 당직 (연속)`);
  }

  return out;
}
