"use client";

import { useEffect, useState } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const HIDE_KEY = "pwa-install-hidden-until";
const HIDE_DAYS = 14;

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hiddenUntil = Number(localStorage.getItem(HIDE_KEY) || 0);
    if (hiddenUntil && Date.now() < hiddenUntil) return;

    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone =
      nav.standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
    if (standalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) && !("MSStream" in window);
    if (isIOS) {
      setIosHint(true);
      setVisible(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const hide = () => {
    const until = Date.now() + HIDE_DAYS * 86400_000;
    localStorage.setItem(HIDE_KEY, String(until));
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const res = await deferred.userChoice;
    if (res.outcome === "accepted") {
      setVisible(false);
      setDeferred(null);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed left-2 right-2 bottom-20 z-30 bg-white border border-rose-200 rounded-2xl shadow-xl p-3 flex items-start gap-3 animate-popin max-w-md mx-auto">
      <img src="/symbol.png" alt="" className="w-10 h-10 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-gray-800">
          홈 화면에 앱으로 추가하기
        </div>
        {iosHint ? (
          <p className="text-[11px] text-gray-600 mt-0.5 leading-snug">
            하단 <b>공유 버튼 ⬆️</b> → <b>"홈 화면에 추가"</b>를 누르면
            앱처럼 사용할 수 있어요.
          </p>
        ) : (
          <p className="text-[11px] text-gray-600 mt-0.5 leading-snug">
            바로가기 아이콘을 추가하면 빠르게 접속할 수 있어요.
          </p>
        )}
        <div className="flex gap-2 mt-2">
          {!iosHint && deferred && (
            <button
              onClick={install}
              className="flex-1 bg-brand text-white text-xs font-bold py-1.5 rounded-lg"
            >
              설치
            </button>
          )}
          <button
            onClick={hide}
            className="flex-1 border text-gray-600 text-xs font-semibold py-1.5 rounded-lg"
          >
            {iosHint ? "알겠어요" : "나중에"}
          </button>
        </div>
      </div>
      <button
        onClick={hide}
        className="text-gray-300 hover:text-gray-500 text-lg leading-none"
        aria-label="닫기"
      >
        ×
      </button>
    </div>
  );
}
