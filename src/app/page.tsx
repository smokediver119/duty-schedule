"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUsers } from "@/hooks/useUsers";
import { ADMIN_PASSWORD, loadSession, saveSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { users, loading } = useUsers();
  const [ext, setExt] = useState("");
  const [adminMode, setAdminMode] = useState(false);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [timedOut, setTimedOut] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const normalizeExt = (v: unknown) =>
    v == null ? "" : String(v).replace(/\D/g, "");

  useEffect(() => {
    if (loadSession()) router.replace("/calendar");
  }, [router]);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [loading]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    const cleanExt = ext.trim();

    // 관리자 모드: 비번만 맞으면 ext 일치가 없어도 진입 (복구/초기셋업)
    if (adminMode) {
      if (password !== ADMIN_PASSWORD) {
        setErr("관리자 비밀번호가 올바르지 않습니다");
        return;
      }
      const match = cleanExt
        ? users.find((u) => normalizeExt(u.ext) === cleanExt && u.active)
        : null;
      if (match) {
        saveSession({ userId: match.id, role: "admin" });
        sessionStorage.setItem("welcome", match.name);
        router.replace("/calendar");
      } else {
        // ext 매칭 실패 → 관리자 전용 복구 세션
        saveSession({ userId: "__admin__", role: "admin" });
        router.replace("/admin");
      }
      return;
    }

    // 근무자 모드: ext 필수 + 일치 필수
    if (!cleanExt) {
      setErr("내선번호를 입력하세요");
      return;
    }
    if (loading && users.length === 0) {
      setErr("사용자 목록을 불러오는 중입니다. 잠시 후 다시 시도하세요.");
      return;
    }
    const match = users.find((u) => normalizeExt(u.ext) === cleanExt && u.active);
    if (!match) {
      setErr(
        users.length === 0
          ? "사용자가 아직 등록되지 않았습니다. 관리자로 먼저 진입해 시드 데이터를 로드하세요."
          : "일치하는 내선번호가 없습니다"
      );
      return;
    }
    saveSession({ userId: match.id, role: "worker" });
    sessionStorage.setItem("welcome", match.name);
    router.replace("/calendar");
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-rose-50 via-white to-amber-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white/90 backdrop-blur rounded-3xl shadow-xl p-7 space-y-5 border border-rose-100"
      >
        <div className="text-center space-y-1">
          <img src="/symbol.png" alt="소방청 심볼" className="mx-auto w-36 h-auto" />
          <h1 className="text-xl font-extrabold tracking-tight">광진소방서</h1>
          <p className="text-sm text-gray-500">당직근무 지정 시스템</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            내선번호 (경비)
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            maxLength={4}
            className="w-full border rounded-xl px-4 py-3 text-lg tracking-widest text-center font-mono focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            value={ext}
            onChange={(e) =>
              setExt(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="예) 313"
          />
          {loading && !timedOut && (
            <p className="text-xs text-gray-400 mt-2">
              사용자 목록 불러오는 중…
            </p>
          )}
          {loading && timedOut && (
            <p className="text-xs text-amber-600 mt-2">
              서버 응답이 늦습니다. 내부망에서 Firestore 접근이 차단된 걸 수 있어요.
            </p>
          )}
          {!loading && users.length === 0 && (
            <p className="text-xs text-amber-600 mt-2">
              등록된 사용자가 없습니다. "관리자로 로그인" 체크 후 접속하세요.
            </p>
          )}
          {!loading && users.length > 0 && (
            <div className="mt-1.5 flex items-center justify-between">
              <p className="text-[11px] text-gray-400">
                등록 사용자 {users.length}명 / ext 보유{" "}
                {users.filter((u) => normalizeExt(u.ext)).length}명
              </p>
              <button
                type="button"
                onClick={() => setShowDebug((v) => !v)}
                className="text-[11px] text-gray-400 underline"
              >
                {showDebug ? "목록 숨김" : "ext 목록 보기"}
              </button>
            </div>
          )}
          {showDebug && !loading && (
            <div className="mt-2 max-h-40 overflow-auto border rounded-lg bg-gray-50 p-2 text-[11px] font-mono">
              {users.length === 0 && <div className="text-gray-500">(비어있음)</div>}
              {users.map((u) => (
                <div key={u.id} className="flex justify-between">
                  <span className={u.active ? "" : "text-gray-400 line-through"}>
                    {u.name} ({u.rank})
                  </span>
                  <span
                    className={
                      normalizeExt(u.ext) ? "text-gray-700" : "text-red-400"
                    }
                  >
                    {normalizeExt(u.ext) || "(없음)"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm select-none">
          <input
            type="checkbox"
            checked={adminMode}
            onChange={(e) => {
              setAdminMode(e.target.checked);
              if (!e.target.checked) setPassword("");
            }}
            className="w-4 h-4 accent-brand"
          />
          <span>관리자로 로그인</span>
        </label>

        {adminMode && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              관리자 비밀번호
            </label>
            <input
              type="password"
              inputMode="numeric"
              className="w-full border rounded-xl px-4 py-3 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-[11px] text-gray-400 mt-1.5">
              내선번호 입력 생략 시 초기 설정용으로 관리자 전용 세션에 진입합니다.
            </p>
          </div>
        )}

        {err && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {err}
          </div>
        )}

        <button
          type="submit"
          className="w-full bg-brand hover:bg-brand-dark active:scale-[0.98] transition text-white py-3 rounded-xl font-bold shadow-lg shadow-brand/20"
        >
          접속
        </button>
      </form>
    </main>
  );
}
