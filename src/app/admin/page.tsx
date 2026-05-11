"use client";

import Link from "next/link";
import { doc, runTransaction } from "firebase/firestore";
import { AuthGuard } from "@/components/AuthGuard";
import { NavBar } from "@/components/NavBar";
import { useAuth } from "@/hooks/useAuth";
import { useRequests } from "@/hooks/useRequests";
import { db } from "@/lib/firebase";
import { logHistory } from "@/lib/history";
import type { DutyRequest, DutyAssignment } from "@/types";
import { useUsers } from "@/hooks/useUsers";
import { useDuties } from "@/hooks/useDuties";
import { useState, useMemo } from "react";
import { detectRequestRisks } from "@/lib/conflicts";
import type { Duty } from "@/types";

export default function AdminPage() {
  const { session } = useAuth();
  const { requests } = useRequests();
  const { users } = useUsers();
  const accepted = requests.filter((r) => r.status === "accepted");
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");
  const [remapping, setRemapping] = useState(false);
  const [remapMsg, setRemapMsg] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "swap" | "substitute">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");

  const filteredAccepted = accepted.filter((r) => {
    if (typeFilter === "all") return true;
    const t = r.requestType ?? "swap";
    return t === typeFilter;
  });

  const now = new Date();
  const cur = { y: now.getFullYear(), m: now.getMonth() + 1 };
  const nxt = cur.m === 12 ? { y: cur.y + 1, m: 1 } : { y: cur.y, m: cur.m + 1 };
  const { duties: curDuties } = useDuties(cur.y, cur.m);
  const { duties: nxtDuties } = useDuties(nxt.y, nxt.m);
  const dutyMap = useMemo(() => {
    const m = new Map<string, Duty>();
    [...curDuties, ...nxtDuties].forEach((d) => m.set(d.date, d));
    return m;
  }, [curDuties, nxtDuties]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAccepted.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredAccepted.map((r) => r.id)));
  };

  const nameOf = (id: string | null) =>
    id ? users.find((u) => u.id === id)?.name ?? "?" : "-";

  const approveCore = async (req: DutyRequest) => {
    if (!req.targetId) throw new Error("대상자 없음");
    const roleField =
      req.role === "supervisor"
        ? "supervisorId"
        : req.role === "leader"
        ? "leaderId"
        : "memberId";

    const isSubstitute = req.requestType === "substitute";

      if (isSubstitute) {
        // 대신 근무: A 슬롯에 targetId 투입, B 날짜 변경 없음
        await runTransaction(db, async (tx) => {
          const aRef = doc(db, "duties", req.dutyDate);
          const aSnap = await tx.get(aRef);
          if (!aSnap.exists()) throw new Error("당직표 없음");

          const aData = aSnap.data() as { assignments: DutyAssignment[] };
          const aHit = aData.assignments.some(
            (a) => a.shift === req.shift && a[roleField] === req.requesterId
          );
          if (!aHit) throw new Error("요청자가 현재 A 당직에 배정되어 있지 않습니다");

          const newAssignments = aData.assignments.map((a) => {
            if (a.shift !== req.shift) return a;
            if (a[roleField] !== req.requesterId) return a;
            return { ...a, [roleField]: req.targetId };
          });
          tx.update(aRef, { assignments: newAssignments });
          tx.update(doc(db, "requests", req.id), {
            status: "approved",
            updatedAt: Date.now(),
          });
        });

        await logHistory("request_approved", session?.userId ?? null, {
          requestId: req.id,
          requestType: "substitute",
          requesterId: req.requesterId,
          targetId: req.targetId,
          a: `${req.dutyDate}/${req.shift}`,
        });
      } else {
        // 맞교대: A↔B 양방향 교체
        await runTransaction(db, async (tx) => {
          const aRef = doc(db, "duties", req.dutyDate);
          const bRef = doc(db, "duties", req.targetDutyDate);
          const aSnap = await tx.get(aRef);
          const bSnap = await tx.get(bRef);
          if (!aSnap.exists() || !bSnap.exists())
            throw new Error("당직표 없음");

          const aData = aSnap.data() as { assignments: DutyAssignment[] };
          const bData = bSnap.data() as { assignments: DutyAssignment[] };

          const aHit = aData.assignments.some(
            (a) => a.shift === req.shift && a[roleField] === req.requesterId
          );
          const bHit = bData.assignments.some(
            (a) => a.shift === req.targetShift && a[roleField] === req.targetId
          );
          if (!aHit) throw new Error("요청자가 현재 A 당직에 배정되어 있지 않습니다");
          if (!bHit) throw new Error("대상자가 현재 B 당직에 배정되어 있지 않습니다");

          const aAssignments = aData.assignments.map((a) => {
            if (a.shift !== req.shift) return a;
            if (a[roleField] !== req.requesterId) return a;
            return { ...a, [roleField]: req.targetId };
          });
          const bAssignments = bData.assignments.map((a) => {
            if (a.shift !== req.targetShift) return a;
            if (a[roleField] !== req.targetId) return a;
            return { ...a, [roleField]: req.requesterId };
          });

          tx.update(aRef, { assignments: aAssignments });
          tx.update(bRef, { assignments: bAssignments });
          tx.update(doc(db, "requests", req.id), {
            status: "approved",
            updatedAt: Date.now(),
          });
        });

        await logHistory("request_approved", session?.userId ?? null, {
          requestId: req.id,
          requestType: "swap",
          requesterId: req.requesterId,
          targetId: req.targetId,
          a: `${req.dutyDate}/${req.shift}`,
          b: `${req.targetDutyDate}/${req.targetShift}`,
        });
      }

      // auto-cancel other pending conflicting requests on same A slot
      const conflicts = requests.filter(
        (r) =>
          r.id !== req.id &&
          r.status === "pending" &&
          r.role === req.role &&
          ((r.dutyDate === req.dutyDate && r.shift === req.shift) ||
            (!isSubstitute &&
              ((r.targetDutyDate === req.targetDutyDate && r.targetShift === req.targetShift) ||
                (r.dutyDate === req.targetDutyDate && r.shift === req.targetShift) ||
                (r.targetDutyDate === req.dutyDate && r.targetShift === req.shift))))
      );
      for (const c of conflicts) {
        await runTransaction(db, async (tx) => {
          tx.update(doc(db, "requests", c.id), {
            status: "cancelled",
            updatedAt: Date.now(),
          });
        });
        await logHistory("request_auto_cancelled", session?.userId ?? null, {
          requestId: c.id,
          reason: "다른 요청 승인으로 자동 취소",
        });
      }
  };

  const approve = async (req: DutyRequest) => {
    try {
      await approveCore(req);
    } catch (e) {
      alert("승인 실패: " + (e as Error).message);
    }
  };

  const bulkApprove = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}건을 승인하시겠습니까?`)) return;
    setBulkRunning(true);
    setBulkMsg("");
    let ok = 0;
    const fails: string[] = [];
    const targets = accepted.filter((r) => selectedIds.has(r.id));
    for (const r of targets) {
      try {
        await approveCore(r);
        ok++;
      } catch (e) {
        const name = users.find((u) => u.id === r.requesterId)?.name ?? "?";
        fails.push(`${name} (${r.dutyDate}): ${(e as Error).message}`);
      }
    }
    setSelectedIds(new Set());
    setBulkRunning(false);
    setBulkMsg(
      fails.length === 0
        ? `✅ ${ok}건 모두 승인 완료`
        : `✅ ${ok}건 승인 / ❌ ${fails.length}건 실패\n${fails.join("\n")}`
    );
  };

  const reject = async (req: DutyRequest) => {
    await runTransaction(db, async (tx) => {
      tx.update(doc(db, "requests", req.id), {
        status: "rejected",
        updatedAt: Date.now(),
      });
    });
    await logHistory("request_rejected", session?.userId ?? null, {
      requestId: req.id,
    });
  };

  const loadSeed = async () => {
    setSeeding(true);
    setSeedMsg("");
    try {
      console.log("🚀 시드 데이터 로드 시작");
      const { writeBatch, collection, doc, getDocs, setDoc } = await import(
        "firebase/firestore"
      );

      // 단순 쓰기 테스트
      console.log("🧪 단순 쓰기 테스트 중...");
      try {
        const testStart = Date.now();
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("쓰기 타임아웃 (10초)")), 10000)
        );
        await Promise.race([
          setDoc(doc(db, "_test", "ping"), { ts: Date.now() }),
          timeout,
        ]);
        console.log("✅ 단순 쓰기 성공:", Date.now() - testStart, "ms");
      } catch (e) {
        console.error("❌ 단순 쓰기 실패:", e);
        throw new Error("Firestore 쓰기 실패: " + (e as Error).message);
      }

      console.log("📥 파일 다운로드 중...");
      const ures = await fetch("/seed/users.json");
      const dres = await fetch("/seed/duties_2026_05.json");
      const seedUsers: Array<Record<string, unknown>> = await ures.json();
      const seedDuties: Array<Record<string, unknown>> = await dres.json();
      console.log("✅ 파일 로드 완료:", seedUsers.length, "명 사용자,", seedDuties.length, "일 당직");

      // 이름 기준 upsert: 기존 사용자는 업데이트, 없는 사용자만 생성
      console.log("👤 기존 사용자 조회 중...");
      const existingSnap = await getDocs(collection(db, "users"));
      console.log("📋 기존 사용자:", existingSnap.size, "명");
      const existingByName = new Map<string, string>();
      existingSnap.forEach((d) => {
        const name = (d.data() as { name?: string }).name;
        if (name) existingByName.set(name, d.id);
      });

      console.log("✍️ 사용자 배치 처리 중...");
      const userNameToId = new Map<string, string>();
      const batch1 = writeBatch(db);
      let created = 0;
      let updated = 0;
      for (const u of seedUsers) {
        const nm = u.name as string;
        const existingId = existingByName.get(nm);
        if (existingId) {
          userNameToId.set(nm, existingId);
          batch1.set(doc(db, "users", existingId), u, { merge: true });
          updated++;
        } else {
          const ref = doc(collection(db, "users"));
          userNameToId.set(nm, ref.id);
          batch1.set(ref, u);
          created++;
        }
      }
      console.log("💾 사용자 배치 커밋 중...");
      console.log("⏳ batch1.commit() 시작...");
      await batch1.commit();
      console.log("✅ 사용자 배치 완료: 신규", created, "명, 갱신", updated, "명");

      console.log("🗓️ 당직 배치 처리 중...");
      const batch2 = writeBatch(db);
      for (const d of seedDuties) {
        const date = d.date as string;
        const ref = doc(db, "duties", date);
        const assignments = (d.assignments as Array<Record<string, unknown>>).map(
          (a) => ({
            shift: a.shift,
            supervisorId: userNameToId.get(a.supervisor as string) ?? null,
            leaderId: userNameToId.get(a.leader as string) ?? null,
            memberId: userNameToId.get(a.member as string) ?? null,
          })
        );
        batch2.set(ref, {
          date,
          weekday: d.weekday,
          type: d.type,
          assignments,
        });
      }
      console.log("⏳ batch2.commit() 시작...");
      await batch2.commit();
      console.log("✅ 당직 배치 완료");

      console.log("📝 이력 기록 중...");
      await logHistory("duty_generated", session?.userId ?? null, {
        source: "seed-2026-05",
        count: seedDuties.length,
      });
      console.log("✅ 이력 기록 완료");

      const msg = `✅ 사용자 신규 ${created}명 / 갱신 ${updated}명, 당직 ${seedDuties.length}일 로드 완료`;
      console.log(msg);
      setSeedMsg(msg);
    } catch (e) {
      setSeedMsg("❌ 실패: " + (e as Error).message);
    } finally {
      setSeeding(false);
    }
  };

  const remapExt = async () => {
    setRemapping(true);
    setRemapMsg("");
    try {
      const { writeBatch, collection, doc, getDocs } = await import(
        "firebase/firestore"
      );
      const ures = await fetch("/seed/users.json");
      const seedUsers: Array<{ name: string; ext?: string | null }> =
        await ures.json();
      const extByName = new Map<string, string | null>();
      for (const u of seedUsers) extByName.set(u.name, u.ext ?? null);

      const snap = await getDocs(collection(db, "users"));
      const batch = writeBatch(db);
      let updated = 0;
      let missing = 0;
      snap.forEach((d) => {
        const data = d.data() as { name?: string; ext?: string | null };
        if (!data.name) return;
        if (extByName.has(data.name)) {
          const newExt = extByName.get(data.name) ?? null;
          if (data.ext !== newExt) {
            batch.update(doc(db, "users", d.id), { ext: newExt });
            updated++;
          }
        } else {
          missing++;
        }
      });
      await batch.commit();
      setRemapMsg(
        `✅ ${updated}명 ext 업데이트. 시드에 없는 사용자 ${missing}명은 건너뜀.`
      );
    } catch (e) {
      setRemapMsg("❌ 실패: " + (e as Error).message);
    } finally {
      setRemapping(false);
    }
  };

  return (
    <AuthGuard adminOnly>
      <NavBar />
      <main className="pb-24 px-3 pt-3 max-w-3xl mx-auto space-y-4">
        <h1 className="text-xl font-extrabold">관리자</h1>

        <section className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
          <div className="text-[11px] font-bold text-gray-400 tracking-widest mb-2">
            빠른 이동
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Link
              href="/admin/users"
              className="border rounded-xl p-3 text-center hover:bg-gray-50 active:scale-[0.98] transition"
            >
              👥 인원/순번
            </Link>
            <Link
              href="/admin/generate"
              className="border rounded-xl p-3 text-center hover:bg-gray-50 active:scale-[0.98] transition"
            >
              🗓️ 월력 생성
            </Link>
            <Link
              href="/admin/holidays"
              className="border rounded-xl p-3 text-center hover:bg-gray-50 active:scale-[0.98] transition"
            >
              🎌 공휴일
            </Link>
            <Link
              href="/history"
              className="border rounded-xl p-3 text-center hover:bg-gray-50 active:scale-[0.98] transition"
            >
              📜 이력
            </Link>
            <Link
              href="/admin/import"
              className="border rounded-xl p-3 text-center hover:bg-gray-50 active:scale-[0.98] transition col-span-2"
            >
              📥 엑셀 가져오기
            </Link>
          </div>
        </section>

        <section className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold">승인 대기</div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
              {accepted.length}건
            </span>
          </div>

          {accepted.length > 0 && (
            <>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-2 text-xs">
                {(["all", "swap", "substitute"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => { setTypeFilter(k); setSelectedIds(new Set()); }}
                    className={`flex-1 py-1.5 rounded-md font-semibold ${
                      typeFilter === k ? "bg-white shadow-sm text-brand" : "text-gray-500"
                    }`}
                  >
                    {k === "all" ? "전체" : k === "swap" ? "맞교대" : "대신근무"}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between mb-2 gap-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredAccepted.length && filteredAccepted.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 accent-brand"
                  />
                  전체 선택
                  {selectedIds.size > 0 && (
                    <span className="text-brand font-semibold"> ({selectedIds.size}건)</span>
                  )}
                </label>
                <button
                  onClick={bulkApprove}
                  disabled={selectedIds.size === 0 || bulkRunning}
                  className="text-xs bg-brand text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40"
                >
                  {bulkRunning ? "승인 중..." : `일괄 승인 ${selectedIds.size || ""}`}
                </button>
              </div>
              {bulkMsg && (
                <pre className="text-[11px] text-gray-700 bg-gray-50 border rounded-lg p-2 mb-2 whitespace-pre-wrap">
                  {bulkMsg}
                </pre>
              )}
            </>
          )}

          {accepted.length === 0 ? (
            <div className="text-sm text-gray-400 py-3 text-center">
              대기 중인 요청 없음
            </div>
          ) : filteredAccepted.length === 0 ? (
            <div className="text-sm text-gray-400 py-3 text-center">
              해당 유형의 대기 요청 없음
            </div>
          ) : (
            <ul className="space-y-2">
              {filteredAccepted.map((r) => (
                <li
                  key={r.id}
                  className={`border rounded-xl p-3 text-sm bg-gradient-to-br from-amber-50/40 to-white ${
                    selectedIds.has(r.id) ? "border-brand ring-1 ring-brand/30" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleSelect(r.id)}
                      className="mt-0.5 w-4 h-4 accent-brand shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                  {r.requestType === "substitute" ? (
                    <>
                      <div className="font-semibold flex items-center gap-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold">대신 근무</span>
                        <span className="text-brand">{nameOf(r.requesterId)}</span>
                        <span className="text-gray-400 text-xs">→</span>
                        <span className="text-amber-700">{nameOf(r.targetId)}</span>
                      </div>
                      <div className="text-xs text-gray-600 mt-1 leading-relaxed">
                        {r.dutyDate} ({r.shift === "full" ? "근무" : r.shift === "day" ? "일직" : "숙직"}) ·{" "}
                        {r.role === "supervisor" ? "책임관" : r.role === "leader" ? "조장" : "조원"}
                        <br />
                        {nameOf(r.requesterId)} 슬롯 → {nameOf(r.targetId)} 투입
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-semibold">
                        <span className="text-brand">{nameOf(r.requesterId)}</span>
                        <span className="mx-1 text-gray-400">↔</span>
                        <span className="text-amber-700">{nameOf(r.targetId)}</span>
                      </div>
                      <div className="text-xs text-gray-600 mt-1 leading-relaxed">
                        A: {r.dutyDate} ({r.shift === "full" ? "근무" : r.shift === "day" ? "일직" : "숙직"})
                        <br />
                        B: {r.targetDutyDate} ({r.targetShift === "full" ? "근무" : r.targetShift === "day" ? "일직" : "숙직"})
                        <br />
                        역할: {r.role === "supervisor" ? "책임관" : r.role === "leader" ? "조장" : "조원"}
                      </div>
                    </>
                  )}
                  {r.reason && (
                    <div className="text-xs text-gray-500 mt-1 bg-gray-50 rounded px-2 py-1">
                      사유: {r.reason}
                    </div>
                  )}
                  {(() => {
                    const risks = detectRequestRisks(r, dutyMap, nameOf);
                    if (risks.length === 0) return null;
                    return (
                      <div className="text-[11px] text-amber-800 mt-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        <div className="font-bold">⚠️ 승인 시 주의</div>
                        {risks.map((x, i) => (
                          <div key={i}>· {x}</div>
                        ))}
                      </div>
                    );
                  })()}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => approve(r)}
                      className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded-lg font-semibold text-sm active:scale-[0.98] transition"
                    >
                      승인
                    </button>
                    <button
                      onClick={() => reject(r)}
                      className="flex-1 border py-2 rounded-lg font-semibold text-sm hover:bg-gray-50 active:scale-[0.98] transition"
                    >
                      거절
                    </button>
                  </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-3">
          <div>
            <div className="font-bold mb-1">초기 시드 데이터 로드</div>
            <p className="text-xs text-gray-500 mb-2 leading-relaxed">
              엑셀에서 추출한 44명 근무자 + 2026년 5월 당직표를 Firestore에
              주입합니다. 이름 기준 upsert이므로 여러 번 눌러도 중복 생성되지 않습니다.
            </p>
            <button
              onClick={loadSeed}
              disabled={seeding}
              className="w-full border py-2.5 rounded-xl text-sm hover:bg-gray-50 disabled:opacity-60"
            >
              {seeding ? "로드 중..." : "시드 데이터 로드"}
            </button>
            {seedMsg && <div className="text-xs mt-2">{seedMsg}</div>}
          </div>

          <div className="border-t pt-3">
            <div className="font-bold mb-1">사용자 내선번호(ext) 재매핑</div>
            <p className="text-xs text-gray-500 mb-2 leading-relaxed">
              기존 사용자들의 ext 필드를 seed/users.json 기준으로 일괄 덮어씁니다.
              이전에 ext 없는 시드로 로드한 경우 이 버튼으로 복구하세요.
            </p>
            <button
              onClick={remapExt}
              disabled={remapping}
              className="w-full border py-2.5 rounded-xl text-sm hover:bg-gray-50 disabled:opacity-60"
            >
              {remapping ? "업데이트 중..." : "ext 재매핑 실행"}
            </button>
            {remapMsg && <div className="text-xs mt-2">{remapMsg}</div>}
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}
