"use client";

import { doc, updateDoc } from "firebase/firestore";
import { AuthGuard } from "@/components/AuthGuard";
import { NavBar } from "@/components/NavBar";
import { useAuth } from "@/hooks/useAuth";
import { useRequests } from "@/hooks/useRequests";
import { db } from "@/lib/firebase";
import { logHistory } from "@/lib/history";
import type { DutyShift, RequestStatus } from "@/types";

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "대기",
  accepted: "승인 대기",
  rejected: "거절됨",
  approved: "승인완료",
  cancelled: "취소됨",
};

const STATUS_COLOR: Record<RequestStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  accepted: "bg-amber-100 text-amber-800",
  rejected: "bg-gray-100 text-gray-600",
  approved: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-500",
};

const shiftLabel = (s: DutyShift) =>
  s === "full" ? "근무" : s === "day" ? "일직" : "숙직";

export default function InboxPage() {
  const { session, users } = useAuth();
  const { requests } = useRequests();
  const nameOf = (id: string | null) =>
    id ? users.find((u) => u.id === id)?.name ?? "?" : "전체";

  const list = requests.filter((r) => {
    if (!session) return false;
    return r.requesterId === session.userId;
  });

  const cancel = async (r: { id: string }) => {
    await updateDoc(doc(db, "requests", r.id), {
      status: "cancelled",
      updatedAt: Date.now(),
    });
    await logHistory("request_cancelled", session?.userId ?? null, {
      requestId: r.id,
    });
  };

  return (
    <AuthGuard>
      <NavBar />
      <main className="pb-24 px-3 pt-3 max-w-md mx-auto space-y-3">
        <h1 className="text-xl font-extrabold">요청함</h1>

        {list.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-12 bg-white rounded-2xl border border-dashed">
            없음
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map((r) => (
              <li
                key={r.id}
                className="bg-white border border-gray-200 rounded-2xl p-3.5 text-sm shadow-sm"
              >
                <div className="flex justify-between items-center mb-2">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLOR[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {new Date(r.createdAt).toLocaleString("ko")}
                  </span>
                </div>
                {r.requestType === "substitute" ? (
                  <>
                    <div className="font-bold flex items-center gap-1.5">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold">대신 근무</span>
                      <span className="text-brand">{nameOf(r.requesterId)}</span>
                      <span className="text-gray-400 text-xs">→</span>
                      <span className="text-amber-700">{nameOf(r.targetId)}</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                      <div>
                        {nameOf(r.requesterId)}의 {r.dutyDate} {shiftLabel(r.shift)} (
                        {r.role === "supervisor" ? "책임관" : r.role === "leader" ? "조장" : "조원"}
                        )을 {nameOf(r.targetId)}가 대신 수행
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-bold">
                      <span className="text-brand">{nameOf(r.requesterId)}</span>
                      <span className="mx-1 text-gray-400">↔</span>
                      <span className="text-amber-700">{nameOf(r.targetId)}</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                      <div>
                        <span className="inline-block w-4 text-gray-400">A</span>
                        {r.dutyDate} · {shiftLabel(r.shift)} ·{" "}
                        {r.role === "supervisor" ? "책임관" : r.role === "leader" ? "조장" : "조원"}
                      </div>
                      {r.targetDutyDate && (
                        <div>
                          <span className="inline-block w-4 text-gray-400">B</span>
                          {r.targetDutyDate} · {shiftLabel(r.targetShift)}
                        </div>
                      )}
                    </div>
                  </>
                )}
                {r.reason && (
                  <div className="text-xs text-gray-500 mt-2 bg-gray-50 rounded px-2 py-1.5">
                    사유: {r.reason}
                  </div>
                )}

                {r.status === "accepted" && (
                  <button
                    onClick={() => cancel(r)}
                    className="w-full mt-2.5 border py-2 rounded-lg font-semibold hover:bg-gray-50"
                  >
                    요청 취소
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </AuthGuard>
  );
}
