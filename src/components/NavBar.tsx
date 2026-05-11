"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSession } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBadge } from "./NotificationBadge";

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { session, me } = useAuth();
  const [welcome, setWelcome] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = sessionStorage.getItem("welcome");
    if (w) {
      setWelcome(w);
      sessionStorage.removeItem("welcome");
      const t = setTimeout(() => setWelcome(null), 2800);
      return () => clearTimeout(t);
    }
  }, []);

  if (!session) return null;

  const isAdmin = session.role === "admin";
  const tabs = [
    { href: "/calendar", label: "캘린더", icon: "📅" },
    { href: "/request", label: "요청", icon: "🔁" },
    { href: "/inbox", label: "요청내역", icon: "📤" },
    { href: "/chat", label: "채팅", icon: "💬", badge: "chat" as const },
    ...(isAdmin
      ? [
          { href: "/admin", label: "관리자", icon: "🛠️", badge: "admin" as const },
          { href: "/history", label: "이력", icon: "📜" },
        ]
      : []),
  ];

  const logout = () => {
    clearSession();
    router.replace("/");
  };

  return (
    <>
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold text-gray-400 tracking-widest shrink-0">
            접속자
          </span>
          {me ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-bold text-sm truncate">{me.name}</span>
              <span className="text-[11px] text-gray-500 truncate">
                [{me.rank}] {me.dept}
              </span>
            </div>
          ) : (
            <span className="text-gray-400 text-sm">-</span>
          )}
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${
              isAdmin
                ? "bg-red-100 text-red-700"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {isAdmin ? "관리자" : "근무자"}
          </span>
        </div>
<button
          onClick={logout}
          className="text-xs text-gray-500 hover:text-gray-700 shrink-0 ml-2"
        >
          로그아웃
        </button>
      </header>

      {welcome && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-30 bg-gradient-to-r from-rose-500 to-amber-500 text-white px-4 py-2 rounded-full shadow-lg text-sm font-semibold animate-[fadein_.25s_ease-out]">
          🎉 {welcome}님 환영합니다
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t grid z-10 pb-[env(safe-area-inset-bottom)]"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
      >
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center py-2 text-[11px] transition ${
                active ? "text-brand font-bold" : "text-gray-500"
              }`}
            >
              <span className="text-lg leading-none relative">
                {t.icon}
                {t.badge && <NotificationBadge kind={t.badge} />}
              </span>
              <span className="mt-0.5">{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
