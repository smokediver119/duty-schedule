"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { NavBar } from "@/components/NavBar";
import { useAuth } from "@/hooks/useAuth";
import { useDuties } from "@/hooks/useDuties";
import { db } from "@/lib/firebase";
import { logHistory } from "@/lib/history";
import type { DutyShift, RequestedRole } from "@/types";

type MySlot = { dutyDate: string; shift: DutyShift; role: RequestedRole };
type TargetSlot = { dutyDate: string; shift: DutyShift; occupantId: string; occupantName: string };

const shiftLabel = (s: DutyShift) => s === "full" ? "근무" : s === "day" ? "일직" : "숙직";
const roleLabel  = (r: RequestedRole) => r === "supervisor" ? "책임관" : r === "leader" ? "조장" : "조원";

// ─── 협의 확인 모달 ────────────────────────────────────
function ConfirmModal({
  targetName,
  onYes,
  onNo,
}: {
  targetName: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-30 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-sm p-6 space-y-5 shadow-2xl">
        <div className="text-center space-y-2">
          <div className="text-3xl">🤝</div>
          <p className="text-base font-bold leading-snug">
            <span className="text-brand">{targetName}</span>님과<br />협의 완료 하셨습니까?
          </p>
          <p className="text-xs text-gray-400">협의 없는 요청은 반려될 수 있습니다.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onNo}
            className="flex-1 border py-3 rounded-xl font-semibold text-sm hover:bg-gray-50 active:scale-[0.98] transition"
          >
            아니오
          </button>
          <button
            onClick={onYes}
            className="flex-1 bg-brand hover:bg-brand-dark text-white py-3 rounded-xl font-bold text-sm active:scale-[0.98] transition shadow-lg shadow-brand/20"
          >
            예
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 맞교대 폼 ─────────────────────────────────────────
function SwapForm() {
  const { me, users } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const initTarget         = params.get("target") ?? "";
  const initTargetShift    = (params.get("targetShift") ?? "") as DutyShift | "";
  const initTargetPersonId = params.get("targetPersonId") ?? "";

  const now = new Date();
  const [year, setYear]   = useState(initTarget ? Number(initTarget.slice(0, 4)) : now.getFullYear());
  const [month, setMonth] = useState(initTarget ? Number(initTarget.slice(5, 7)) : now.getMonth() + 1);
  const { duties } = useDuties(year, month);

  const [pickKey, setPickKey]       = useState("");
  const [targetKey, setTargetKey]   = useState("");
  const [reason, setReason]         = useState("");
  const [msg, setMsg]               = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const myDuties = useMemo<MySlot[]>(() => {
    if (!me) return [];
    const list: MySlot[] = [];
    for (const d of duties) {
      for (const a of d.assignments) {
        if (a.supervisorId === me.id) list.push({ dutyDate: d.date, shift: a.shift, role: "supervisor" });
        if (a.leaderId     === me.id) list.push({ dutyDate: d.date, shift: a.shift, role: "leader" });
        if (a.memberId     === me.id) list.push({ dutyDate: d.date, shift: a.shift, role: "member" });
      }
    }
    return list;
  }, [duties, me]);

  const selected = myDuties.find((d) => `${d.dutyDate}|${d.shift}|${d.role}` === pickKey);

  const myRole     = me?.role;
  const roleToUse  = selected?.role ?? (myRole === "supervisor" ? "supervisor" : myRole === "leader" ? "leader" : "member");
  const targetDateToExclude = selected?.dutyDate;

  const targetOptions = useMemo<TargetSlot[]>(() => {
    if (!me) return [];
    const list: TargetSlot[] = [];
    for (const d of duties) {
      if (targetDateToExclude && d.date === targetDateToExclude) continue;
      for (const a of d.assignments) {
        const oid = roleToUse === "supervisor" ? a.supervisorId : roleToUse === "leader" ? a.leaderId : a.memberId;
        if (!oid || oid === me.id) continue;
        const occ = users.find((u) => u.id === oid);
        if (!occ) continue;
        list.push({ dutyDate: d.date, shift: a.shift, occupantId: oid, occupantName: occ.name });
      }
    }
    return list;
  }, [selected, duties, users, me, myRole, roleToUse, targetDateToExclude]);

  useEffect(() => {
    if (!initTarget || !initTargetPersonId || targetOptions.length === 0) return;
    const match = targetOptions.find(
      (t) => t.dutyDate === initTarget && (initTargetShift === "" || t.shift === initTargetShift) && t.occupantId === initTargetPersonId
    );
    if (match) setTargetKey(`${match.dutyDate}|${match.shift}|${match.occupantId}`);
  }, [initTarget, initTargetShift, initTargetPersonId, targetOptions]);

  const target = targetOptions.find((t) => `${t.dutyDate}|${t.shift}|${t.occupantId}` === targetKey);

  // 실제 Firestore 제출
  const doSubmit = async () => {
    if (!me || !selected || !target) return;
    setShowConfirm(false);
    setSubmitting(true);
    setMsg("");
    try {
      const n = Date.now();
      const ref = await addDoc(collection(db, "requests"), {
        requestType: "swap",
        requesterId: me.id,
        targetId: target.occupantId,
        dutyDate: selected.dutyDate,
        shift: selected.shift,
        role: selected.role,
        targetDutyDate: target.dutyDate,
        targetShift: target.shift,
        status: "accepted",
        reason: reason || null,
        createdAt: n, updatedAt: n,
      });
      await logHistory("request_created", me.id, { requestId: ref.id, type: "swap" });
      router.replace("/inbox");
    } catch (err) {
      setMsg("전송 실패: " + (err as Error).message);
      setSubmitting(false);
    }
  };

  // 폼 제출 → 유효성 검사 후 모달 표시
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    if (!selected) { setMsg("내 당직 날짜를 선택하세요"); return; }
    if (!target)   { setMsg("교대할 날짜의 상대를 선택하세요"); return; }
    setShowConfirm(true);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 월 선택 */}
        <section className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-gray-400 tracking-widest">월 선택</div>
            <div className="flex items-center gap-2 text-sm">
              <select value={year} onChange={(e) => { setYear(+e.target.value); setPickKey(""); setTargetKey(""); }} className="border rounded-lg px-2 py-1">
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}년</option>)}
              </select>
              <select value={month} onChange={(e) => { setMonth(+e.target.value); setPickKey(""); setTargetKey(""); }} className="border rounded-lg px-2 py-1">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}월</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* A: 내 당직 */}
        <section className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-6 h-6 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center font-bold">1</span>
            <span className="font-semibold text-sm">내 당직 (A) — 넘겨줄 날짜</span>
          </div>
          <select value={pickKey} onChange={(e) => { setPickKey(e.target.value); setTargetKey(""); }} className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20">
            <option value="">선택</option>
            {myDuties.map((d) => { const k = `${d.dutyDate}|${d.shift}|${d.role}`; return <option key={k} value={k}>{d.dutyDate} · {shiftLabel(d.shift)} · {roleLabel(d.role)}</option>; })}
          </select>
          {myDuties.length === 0 && <p className="text-xs text-amber-600">이번 달에 본인 당직이 없습니다.</p>}
        </section>

        {/* B: 가고 싶은 날짜 */}
        <section className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold">2</span>
            <span className="font-semibold text-sm">가고 싶은 날짜 (B)</span>
          </div>
          {target && initTarget ? (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm">
              <span className="text-amber-600 font-semibold">📅 자동 선택됨</span>
              <span className="text-gray-700">{target.dutyDate} · {shiftLabel(target.shift)} · {target.occupantName}</span>
              <button type="button" onClick={() => setTargetKey("")} className="ml-auto text-gray-400 hover:text-gray-600 text-xs">변경</button>
            </div>
          ) : (
            <>
              <select value={targetKey} onChange={(e) => setTargetKey(e.target.value)} disabled={!selected} className="w-full border rounded-xl px-3 py-2.5 text-sm disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20">
                <option value="">선택</option>
                {targetOptions.map((t) => { const k = `${t.dutyDate}|${t.shift}|${t.occupantId}`; return <option key={k} value={k}>{t.dutyDate} · {shiftLabel(t.shift)} · {t.occupantName}</option>; })}
              </select>
              {selected && targetOptions.length === 0 && <p className="text-xs text-amber-600">교대 가능한 일자가 없습니다.</p>}
            </>
          )}
          <p className="text-[11px] text-gray-500">※ 관리자가 승인하면 A에는 상대가, B에는 본인이 지정됩니다.</p>
        </section>

        {selected && target && (
          <section className="bg-gradient-to-br from-rose-50 to-amber-50 rounded-2xl p-4 border border-rose-100 text-sm space-y-1">
            <div className="text-[11px] font-bold text-gray-500 tracking-widest">요약</div>
            <div><b className="text-brand">{me?.name}</b>({roleLabel(selected.role)}) {selected.dutyDate} {shiftLabel(selected.shift)} ↔ <b className="text-amber-600">{target.occupantName}</b> {target.dutyDate} {shiftLabel(target.shift)}</div>
          </section>
        )}

        <section className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-6 h-6 rounded-full bg-gray-400 text-white text-xs flex items-center justify-center font-bold">3</span>
            <span className="font-semibold text-sm">사유 (선택)</span>
          </div>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="교대 사유" className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
        </section>

        {msg && (
          <div className={`text-sm px-3 py-2 rounded-lg border ${
            msg === "협의 후 신청해주시기 바랍니다"
              ? "text-amber-700 bg-amber-50 border-amber-200"
              : "text-red-600 bg-red-50 border-red-100"
          }`}>
            {msg}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-brand hover:bg-brand-dark active:scale-[0.98] transition text-white py-3 rounded-xl font-bold shadow-lg shadow-brand/20 disabled:opacity-60"
        >
          {submitting ? "전송 중..." : "요청 전송"}
        </button>
      </form>

      {showConfirm && target && (
        <ConfirmModal
          targetName={target.occupantName}
          onYes={doSubmit}
          onNo={() => {
            setShowConfirm(false);
            setMsg("협의 후 신청해주시기 바랍니다");
          }}
        />
      )}
    </>
  );
}

// ─── 대신 근무 폼 ───────────────────────────────────────
function SubstituteForm() {
  const { me, users } = useAuth();
  const router = useRouter();
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { duties } = useDuties(year, month);

  const [pickKey, setPickKey]           = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [reason, setReason]             = useState("");
  const [msg, setMsg]                   = useState("");
  const [submitting, setSubmitting]     = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);

  const myDuties = useMemo<MySlot[]>(() => {
    if (!me) return [];
    const list: MySlot[] = [];
    for (const d of duties) {
      for (const a of d.assignments) {
        if (a.supervisorId === me.id) list.push({ dutyDate: d.date, shift: a.shift, role: "supervisor" });
        if (a.leaderId     === me.id) list.push({ dutyDate: d.date, shift: a.shift, role: "leader" });
        if (a.memberId     === me.id) list.push({ dutyDate: d.date, shift: a.shift, role: "member" });
      }
    }
    return list;
  }, [duties, me]);

  const selected   = myDuties.find((d) => `${d.dutyDate}|${d.shift}|${d.role}` === pickKey);
  const targetUser = users.find((u) => u.id === targetUserId);
  const otherUsers = users.filter((u) => u.active && u.id !== me?.id);

  // 실제 Firestore 제출
  const doSubmit = async () => {
    if (!me || !selected || !targetUserId) return;
    setShowConfirm(false);
    setSubmitting(true);
    setMsg("");
    try {
      const n = Date.now();
      const ref = await addDoc(collection(db, "requests"), {
        requestType: "substitute",
        requesterId: me.id,
        targetId: targetUserId,
        dutyDate: selected.dutyDate,
        shift: selected.shift,
        role: selected.role,
        targetDutyDate: selected.dutyDate,
        targetShift: selected.shift,
        status: "accepted",
        reason: reason || null,
        createdAt: n, updatedAt: n,
      });
      await logHistory("request_created", me.id, { requestId: ref.id, type: "substitute" });
      router.replace("/inbox");
    } catch (err) {
      setMsg("전송 실패: " + (err as Error).message);
      setSubmitting(false);
    }
  };

  // 폼 제출 → 유효성 검사 후 모달 표시
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    if (!selected)     { setMsg("내 당직 날짜를 선택하세요"); return; }
    if (!targetUserId) { setMsg("대신 와줄 사람을 선택하세요"); return; }
    setShowConfirm(true);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 월 선택 */}
        <section className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-gray-400 tracking-widest">월 선택</div>
            <div className="flex items-center gap-2 text-sm">
              <select value={year} onChange={(e) => { setYear(+e.target.value); setPickKey(""); }} className="border rounded-lg px-2 py-1">
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}년</option>)}
              </select>
              <select value={month} onChange={(e) => { setMonth(+e.target.value); setPickKey(""); }} className="border rounded-lg px-2 py-1">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}월</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* 내 당직 */}
        <section className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-6 h-6 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center font-bold">1</span>
            <span className="font-semibold text-sm">내 당직 — 대신 맡길 날짜</span>
          </div>
          <select value={pickKey} onChange={(e) => setPickKey(e.target.value)} className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20">
            <option value="">선택</option>
            {myDuties.map((d) => { const k = `${d.dutyDate}|${d.shift}|${d.role}`; return <option key={k} value={k}>{d.dutyDate} · {shiftLabel(d.shift)} · {roleLabel(d.role)}</option>; })}
          </select>
          {myDuties.length === 0 && <p className="text-xs text-amber-600">이번 달에 본인 당직이 없습니다.</p>}
        </section>

        {/* 대신 들어올 직원 */}
        <section className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold">2</span>
            <span className="font-semibold text-sm">대신 들어올 직원</span>
          </div>
          <select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} disabled={!selected} className="w-full border rounded-xl px-3 py-2.5 text-sm disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20">
            <option value="">선택</option>
            {otherUsers.filter((u) => !selected || u.role === selected.role).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.rank})</option>)}
          </select>
          <p className="text-[11px] text-gray-500">※ 관리자가 승인하면 해당 날짜 당직이 상대방으로 변경됩니다.</p>
        </section>

        {selected && targetUser && (
          <section className="bg-gradient-to-br from-rose-50 to-amber-50 rounded-2xl p-4 border border-rose-100 text-sm">
            <div className="text-[11px] font-bold text-gray-500 tracking-widest mb-1">요약</div>
            <div>
              <b className="text-brand">{me?.name}</b>({roleLabel(selected.role)})의{" "}
              <b>{selected.dutyDate}</b> {shiftLabel(selected.shift)}을{" "}
              <b className="text-amber-600">{targetUser.name}</b>이 대신합니다
            </div>
          </section>
        )}

        <section className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-6 h-6 rounded-full bg-gray-400 text-white text-xs flex items-center justify-center font-bold">3</span>
            <span className="font-semibold text-sm">사유 (선택)</span>
          </div>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="대신 근무 사유" className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
        </section>

        {msg && (
          <div className={`text-sm px-3 py-2 rounded-lg border ${
            msg === "협의 후 신청해주시기 바랍니다"
              ? "text-amber-700 bg-amber-50 border-amber-200"
              : "text-red-600 bg-red-50 border-red-100"
          }`}>
            {msg}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-brand hover:bg-brand-dark active:scale-[0.98] transition text-white py-3 rounded-xl font-bold shadow-lg shadow-brand/20 disabled:opacity-60"
        >
          {submitting ? "전송 중..." : "요청 전송"}
        </button>
      </form>

      {showConfirm && targetUser && (
        <ConfirmModal
          targetName={targetUser.name}
          onYes={doSubmit}
          onNo={() => {
            setShowConfirm(false);
            setMsg("협의 후 신청해주시기 바랍니다");
          }}
        />
      )}
    </>
  );
}

// ─── 페이지 ────────────────────────────────────────────
export default function RequestPage() {
  const [mode, setMode] = useState<"swap" | "substitute">("swap");
  return (
    <AuthGuard>
      <NavBar />
      <main className="pb-24 px-3 pt-3 max-w-md mx-auto space-y-4">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setMode("swap")}
            className={`flex-1 py-2 rounded-lg text-sm transition font-semibold ${mode === "swap" ? "bg-white shadow-sm text-brand" : "text-gray-500"}`}
          >
            맞교대 요청
          </button>
          <button
            onClick={() => setMode("substitute")}
            className={`flex-1 py-2 rounded-lg text-sm transition font-semibold leading-tight ${mode === "substitute" ? "bg-white shadow-sm text-brand" : "text-gray-500"}`}
          >
            대신 근무{" "}
            <span className="text-[10px] font-normal opacity-60">(맞교대×)</span>
          </button>
        </div>

        <Suspense fallback={<div className="text-sm text-gray-400">로딩 중...</div>}>
          {mode === "swap" ? <SwapForm /> : <SubstituteForm />}
        </Suspense>
      </main>
    </AuthGuard>
  );
}
