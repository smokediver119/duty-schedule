"use client";

import { useRef, useState } from "react";
import { collection, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { AuthGuard } from "@/components/AuthGuard";
import { NavBar } from "@/components/NavBar";
import { useAuth } from "@/hooks/useAuth";
import { useUsers } from "@/hooks/useUsers";
import { db } from "@/lib/firebase";
import { logHistory } from "@/lib/history";
import {
  parseExcelBuffer,
  toFirestoreDuties,
  type ExcelParseResult,
} from "@/lib/parseExcelDuty";
import type { Duty } from "@/types";

const SHIFT_LABEL = { full: "근무", day: "일직", night: "숙직" } as const;

export default function ImportPage() {
  const { session } = useAuth();
  const { users } = useUsers();
  const fileRef = useRef<HTMLInputElement>(null);

  const [result, setResult] = useState<ExcelParseResult | null>(null);
  const [parseError, setParseError] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setParseError("");
    setApplyMsg("");

    try {
      const buf = await file.arrayBuffer();

      // Fetch existing duties to compute diff
      // Need year/month from file first — do a quick parse pass
      const preliminary = parseExcelBuffer(buf, users, []);
      const { year, month } = preliminary;
      const prefix = `${year}-${String(month).padStart(2, "0")}-`;
      const snap = await getDocs(
        query(
          collection(db, "duties"),
          where("date", ">=", `${prefix}01`),
          where("date", "<=", `${prefix}31`)
        )
      );
      const existing = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<Duty, "id">) })
      );

      const parsed = parseExcelBuffer(buf, users, existing);
      setResult(parsed);
    } catch (err) {
      setParseError("파싱 실패: " + (err as Error).message);
    }
  };

  const apply = async () => {
    if (!result || result.unmatchedNames.length > 0) return;
    if (
      !confirm(
        `${result.year}년 ${result.month}월 당직표 ${result.duties.length}일을 Firestore에 적용하시겠습니까?\n기존 데이터를 덮어씁니다.`
      )
    )
      return;

    setApplying(true);
    setApplyMsg("");
    try {
      const fsDuties = toFirestoreDuties(result.duties);
      const batch = writeBatch(db);
      for (const d of fsDuties) {
        batch.set(doc(db, "duties", d.date), { id: d.date, ...d });
      }
      await batch.commit();
      await logHistory("duty_generated", session?.userId ?? null, {
        source: "excel_import",
        year: result.year,
        month: result.month,
        count: result.duties.length,
        changes: result.changeCount,
      });
      setApplyMsg(
        `✅ ${result.year}년 ${result.month}월 ${result.duties.length}일 적용 완료 (변경 ${result.changeCount}건)`
      );
      setResult(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setApplyMsg("❌ 실패: " + (err as Error).message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <AuthGuard adminOnly>
      <NavBar />
      <main className="pb-20 px-3 pt-3 max-w-3xl mx-auto space-y-4">
        <h1 className="text-xl font-extrabold">📥 엑셀 당직표 가져오기</h1>

        {/* 파일 선택 */}
        <section className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm space-y-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            당직근무 변경 지정 엑셀 파일(.xlsx)을 업로드하면 기존 데이터와 비교하여
            변경된 이름을 <span className="text-blue-600 font-semibold">주황색</span>으로
            표시합니다. 확인 후 적용하세요.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            onChange={handleFile}
            className="w-full text-sm border rounded-xl px-3 py-2 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-brand file:text-white file:text-xs file:font-semibold cursor-pointer"
          />
          {parseError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {parseError}
            </div>
          )}
        </section>

        {/* 미리보기 */}
        {result && (
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* 요약 헤더 */}
            <div className="p-4 border-b flex flex-wrap items-center gap-3">
              <div className="font-extrabold text-base">
                {result.year}년 {result.month}월 · {result.duties.length}일
              </div>
              <div className="flex gap-2 text-xs">
                {result.changeCount > 0 && (
                  <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                    변경 {result.changeCount}건
                  </span>
                )}
                {result.changeCount === 0 && (
                  <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">
                    변경 없음
                  </span>
                )}
                {result.unmatchedNames.length > 0 && (
                  <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
                    불일치 {result.unmatchedNames.length}명
                  </span>
                )}
              </div>
            </div>

            {/* 불일치 이름 오류 */}
            {result.unmatchedNames.length > 0 && (
              <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700">
                <div className="font-bold mb-1">❌ 사용자 불일치 — 등록된 이름과 다릅니다</div>
                <div className="flex flex-wrap gap-1">
                  {result.unmatchedNames.map((n) => (
                    <span key={n} className="bg-red-100 px-2 py-0.5 rounded font-mono">{n}</span>
                  ))}
                </div>
                <div className="mt-1.5 text-[11px] text-red-500">
                  인원/순번 메뉴에서 이름을 확인하거나 수정한 후 다시 업로드하세요.
                </div>
              </div>
            )}

            {/* 미리보기 테이블 */}
            <div className="overflow-auto max-h-[55vh] mt-3">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold text-gray-500 border-b">날짜</th>
                    <th className="px-2 py-2 text-left font-semibold text-gray-500 border-b">구분</th>
                    <th className="px-2 py-2 text-left font-semibold text-gray-500 border-b">책임관</th>
                    <th className="px-2 py-2 text-left font-semibold text-gray-500 border-b">조장</th>
                    <th className="px-2 py-2 text-left font-semibold text-gray-500 border-b">조원</th>
                  </tr>
                </thead>
                <tbody>
                  {result.duties.map((d) =>
                    d.rows.map((row, rIdx) => {
                      const supChanged = d.recentChanges.includes(`${rIdx}_supervisorId`);
                      const ledChanged = d.recentChanges.includes(`${rIdx}_leaderId`);
                      const memChanged = d.recentChanges.includes(`${rIdx}_memberId`);
                      const hasAnyChange = supChanged || ledChanged || memChanged;
                      return (
                        <tr
                          key={`${d.date}-${rIdx}`}
                          className={`border-t border-gray-100 ${hasAnyChange ? "bg-blue-50/40" : ""}`}
                        >
                          {rIdx === 0 && (
                            <td
                              rowSpan={d.rows.length}
                              className="px-2 py-1.5 align-top font-semibold text-gray-700 whitespace-nowrap"
                            >
                              {d.date.slice(5).replace("-", "/")}
                              <span className="ml-1 text-gray-400">{d.weekday}</span>
                            </td>
                          )}
                          <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap">
                            {SHIFT_LABEL[row.shift]}
                          </td>
                          <td className={`px-2 py-1.5 whitespace-nowrap ${
                            row.supervisor.isUnmatched
                              ? "text-red-600 font-semibold"
                              : supChanged
                              ? "text-blue-600 font-semibold"
                              : ""
                          }`}>
                            {row.supervisor.name}
                          </td>
                          <td className={`px-2 py-1.5 whitespace-nowrap ${
                            row.leader.isUnmatched
                              ? "text-red-600 font-semibold"
                              : ledChanged
                              ? "text-blue-600 font-semibold"
                              : ""
                          }`}>
                            {row.leader.name}
                          </td>
                          <td className={`px-2 py-1.5 whitespace-nowrap ${
                            row.member.isUnmatched
                              ? "text-red-600 font-semibold"
                              : memChanged
                              ? "text-blue-600 font-semibold"
                              : ""
                          }`}>
                            {row.member.name}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* 범례 */}
            <div className="flex gap-4 px-4 py-2.5 border-t text-[11px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                변경됨
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                이름 불일치
              </span>
            </div>

            {/* 적용 버튼 */}
            <div className="p-4 border-t">
              <button
                onClick={apply}
                disabled={applying || result.unmatchedNames.length > 0}
                className="w-full bg-orange-500 hover:bg-orange-600 active:scale-[0.98] transition text-white py-3 rounded-xl font-bold shadow-lg shadow-orange-200 disabled:opacity-40"
              >
                {applying
                  ? "적용 중..."
                  : result.unmatchedNames.length > 0
                  ? "이름 불일치 해결 후 적용 가능"
                  : `Firestore에 적용 (${result.duties.length}일)`}
              </button>
            </div>
          </section>
        )}

        {applyMsg && (
          <div className="text-sm bg-white border rounded-2xl px-4 py-3 shadow-sm">
            {applyMsg}
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
