"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { AuthGuard } from "@/components/AuthGuard";
import { NavBar } from "@/components/NavBar";
import { db } from "@/lib/firebase";
import { useUsers } from "@/hooks/useUsers";
import { useAuth } from "@/hooks/useAuth";
import { useChatUnread } from "@/hooks/useChatUnread";
import type { User } from "@/types";

// ─── 타입 ──────────────────────────────────────────────
type ChannelKey =
  | "notice"
  | "global"
  | "role_supervisor"
  | "role_leader"
  | "role_member"
  | "direct";

interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: number;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  authorId: string;
  createdAt: number;
}

const CHANNEL_META: Record<ChannelKey, { label: string; fsId: string }> = {
  notice:          { label: "📢 공지",  fsId: "notice" },
  global:          { label: "💬 전체",  fsId: "global" },
  role_supervisor: { label: "📋 책임관", fsId: "role_supervisor" },
  role_leader:     { label: "👥 조장",  fsId: "role_leader" },
  role_member:     { label: "🔧 조원",  fsId: "role_member" },
  direct:          { label: "💌 1:1",   fsId: "" },
};

function dmId(a: string, b: string) {
  return `direct_${[a, b].sort().join("_")}`;
}

function timeStr(ts: number) {
  return new Date(ts).toLocaleTimeString("ko", { hour: "2-digit", minute: "2-digit" });
}

function dateStr(ts: number) {
  return new Date(ts).toLocaleString("ko", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── 컴포넌트 ───────────────────────────────────────────
export default function ChatPage() {
  const { session } = useAuth();
  const { users } = useUsers();
  const { unreadChannels, unreadDmUsers, markRead } = useChatUnread();
  const isAdmin = session?.role === "admin";
  const myId = session?.userId ?? "";

  const me = useMemo(() => users.find((u) => u.id === myId) ?? null, [users, myId]);

  const nameOf = (id: string) => {
    if (!id) return "?";
    if (id === "__admin__") return "관리자";
    return users.find((u) => u.id === id)?.name ?? "?";
  };

  const visibleChannels = useMemo((): ChannelKey[] => {
    const base: ChannelKey[] = ["notice", "global"];
    if (isAdmin || me?.role === "supervisor") base.push("role_supervisor");
    if (isAdmin || me?.role === "leader")     base.push("role_leader");
    if (isAdmin || me?.role === "member")     base.push("role_member");
    base.push("direct");
    return base;
  }, [isAdmin, me]);

  const [activeChannel, setActiveChannel] = useState<ChannelKey>("notice");
  const [dmTarget, setDmTarget] = useState<User | null>(null);
  const [dmSearch, setDmSearch] = useState("");
  const [messages, setMessages]           = useState<Message[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [text, setText]                   = useState("");
  const [noticeBody, setNoticeBody]       = useState("");
  const [showForm, setShowForm]           = useState(false);
  const mainRef   = useRef<HTMLElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeFsChannel = useMemo(() => {
    if (activeChannel === "direct") return dmTarget ? dmId(myId, dmTarget.id) : null;
    return CHANNEL_META[activeChannel].fsId;
  }, [activeChannel, dmTarget, myId]);

  // 채널 전환 → 읽음 처리
  useEffect(() => {
    if (!activeFsChannel) return;
    markRead(activeFsChannel);
  }, [activeFsChannel]); // eslint-disable-line

  // 메시지 구독 + 새 메시지 도착 시 읽음 처리
  useEffect(() => {
    if (activeChannel === "notice" || !activeFsChannel) { setMessages([]); return; }
    const q = query(
      collection(db, "channels", activeFsChannel, "messages"),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Message, "id">) })));
      markRead(activeFsChannel);
    });
  }, [activeFsChannel, activeChannel]); // eslint-disable-line

  // 공지 구독
  useEffect(() => {
    return onSnapshot(
      query(collection(db, "announcements"), orderBy("createdAt", "desc")),
      (snap) =>
        setAnnouncements(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Announcement, "id">) }))
        )
    );
  }, []);

  // 스크롤 아래로 (fixed 컨테이너 내부는 scrollTop 방식이 신뢰도 높음)
  useEffect(() => {
    const el = mainRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || !activeFsChannel) return;
    setText("");
    const now = Date.now();
    // 메시지 저장
    await addDoc(collection(db, "channels", activeFsChannel, "messages"), {
      senderId: myId, text: trimmed, createdAt: now,
    });
    // 채널 메타 갱신 (미읽음 감지용)
    await setDoc(
      doc(db, "channels", activeFsChannel),
      { lastMessageAt: now, lastSenderId: myId },
      { merge: true }
    );
    // DM이면 상대방 수신함 갱신
    if (activeChannel === "direct" && dmTarget) {
      await setDoc(
        doc(db, "userInbox", dmTarget.id),
        { [activeFsChannel]: { lastMessageAt: now, fromId: myId } },
        { merge: true }
      );
    }
  };

  const postAnnouncement = async () => {
    if (!noticeBody.trim()) return;
    const now = Date.now();
    await addDoc(collection(db, "announcements"), {
      title: "",
      content: noticeBody.trim(),
      authorId: myId,
      createdAt: now,
    });
    await setDoc(
      doc(db, "channels", "notice"),
      { lastMessageAt: now, lastSenderId: myId },
      { merge: true }
    );
    setNoticeBody(""); setShowForm(false);
  };

  const deleteAnnouncement = async (id: string) => {
    if (!confirm("공지를 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "announcements", id));
  };

  const deleteMessage = async (msgId: string) => {
    if (!activeFsChannel || !confirm("메시지를 삭제하시겠습니까?")) return;
    await deleteDoc(doc(db, "channels", activeFsChannel, "messages", msgId));
  };

  const switchChannel = (ch: ChannelKey) => {
    setActiveChannel(ch);
    if (ch !== "direct") setDmTarget(null);
    setText("");
    setDmSearch("");
    // 채널 전환 시 스크롤을 맨 위로
    if (mainRef.current) mainRef.current.scrollTop = 0;
  };

  const showInput = activeChannel !== "notice" && !(activeChannel === "direct" && !dmTarget);

  // ─── 렌더 ─────────────────────────────────────────────
  return (
    <AuthGuard>
      <NavBar />

      {/* 채널 탭 + 본문 고정 컨테이너 */}
      <div className="fixed inset-x-0 top-[52px] bottom-14 flex flex-col">

        {/* 채널 탭 */}
        <div className="shrink-0 bg-white border-b flex gap-2 px-3 py-2 overflow-x-auto z-10">
          {visibleChannels.map((ch) => {
            const fsId = CHANNEL_META[ch].fsId;
            const hasUnread =
              ch === "direct"
                ? unreadDmUsers.size > 0
                : unreadChannels.has(fsId);
            return (
              <button
                key={ch}
                onClick={() => switchChannel(ch)}
                className={`relative shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition ${
                  activeChannel === ch
                    ? "bg-brand text-white border-brand"
                    : "bg-white text-gray-500 border-gray-200"
                }`}
              >
                {CHANNEL_META[ch].label}
                {hasUnread && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* DM 상대 헤더 — 스크롤 영역 밖에 고정 */}
        {activeChannel === "direct" && dmTarget && (
          <div className="shrink-0 bg-white border-b px-4 py-2 flex items-center gap-2">
            <button onClick={() => setDmTarget(null)} className="text-xs text-brand shrink-0">← 목록</button>
            <span className="font-semibold text-sm">{dmTarget.name}</span>
            <span className="text-xs text-gray-400">{dmTarget.rank} · {dmTarget.dept}</span>
          </div>
        )}

        {/* 본문 */}
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto overscroll-contain px-3 pt-3"
          style={{ paddingBottom: showInput ? "60px" : "8px", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >

        {/* ── 공지 ── */}
        {activeChannel === "notice" && (
          <div className="space-y-3 max-w-2xl mx-auto">
            {isAdmin && (
              <>
                <button
                  onClick={() => setShowForm((v) => !v)}
                  className="w-full border border-dashed border-brand text-brand text-sm py-2.5 rounded-xl"
                >
                  {showForm ? "취소" : "+ 공지 작성"}
                </button>
                {showForm && (
                  <div className="bg-white border rounded-xl p-4 space-y-2">
                    <textarea
                      className="w-full border rounded-lg px-3 py-2 text-sm h-28 resize-none focus:outline-none focus:border-brand"
                      placeholder="공지 내용을 입력하세요"
                      value={noticeBody}
                      onChange={(e) => setNoticeBody(e.target.value)}
                    />
                    <button
                      onClick={postAnnouncement}
                      disabled={!noticeBody.trim()}
                      className="w-full bg-brand text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                    >
                      등록
                    </button>
                  </div>
                )}
              </>
            )}
            {announcements.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-10">공지 없음</p>
            ) : (
              announcements.map((a) => (
                <div key={a.id} className="bg-white border rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-400 mb-2">
                        {nameOf(a.authorId)} · {dateStr(a.createdAt)}
                      </p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {a.content}
                      </p>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => deleteAnnouncement(a.id)}
                        className="text-gray-300 hover:text-red-400 text-lg leading-none shrink-0"
                        title="삭제"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── 1:1 상대 목록 ── */}
        {activeChannel === "direct" && !dmTarget && (() => {
          const base = users.filter((u) => u.active && u.id !== myId);
          const filtered = dmSearch.trim()
            ? base.filter((u) => u.name.includes(dmSearch.trim()))
            : base;
          // 미읽음 먼저, 나머지는 이름순
          const sorted = [
            ...filtered.filter((u) => unreadDmUsers.has(u.id)),
            ...filtered.filter((u) => !unreadDmUsers.has(u.id)),
          ];
          return (
            <div className="max-w-2xl mx-auto space-y-2">
              {/* 검색 입력창 */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                <input
                  className="w-full border rounded-xl pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-brand"
                  placeholder="이름으로 검색..."
                  value={dmSearch}
                  onChange={(e) => setDmSearch(e.target.value)}
                />
                {dmSearch && (
                  <button
                    onClick={() => setDmSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-base leading-none"
                  >×</button>
                )}
              </div>

              {sorted.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">검색 결과 없음</p>
              ) : (
                <ul className="bg-white border rounded-xl divide-y">
                  {sorted.map((u) => {
                    const hasUnread = unreadDmUsers.has(u.id);
                    return (
                      <li key={u.id}>
                        <button
                          onClick={() => {
                            setDmTarget(u);
                            if (mainRef.current) mainRef.current.scrollTop = 0;
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-center gap-3"
                        >
                          {/* 미읽음 표시 */}
                          <span className={`w-2 h-2 rounded-full shrink-0 ${hasUnread ? "bg-red-500" : "bg-transparent"}`} />
                          <span className={`text-sm flex-1 ${hasUnread ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
                            {u.name}
                          </span>
                          <span className="text-xs text-gray-400">{u.rank} · {u.dept}</span>
                          {hasUnread && (
                            <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full shrink-0">NEW</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })()}

        {/* ── 채팅 메시지 ── */}
        {activeChannel !== "notice" && !(activeChannel === "direct" && !dmTarget) && (
          <div className="max-w-2xl mx-auto space-y-1">
            {messages.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-10">메시지 없음</p>
            )}
            {messages.map((m) => {
              const isMine = m.senderId === myId;
              return (
                <div key={m.id} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                  {!isMine && (
                    <span className="text-[11px] text-gray-400 ml-1 mb-0.5">{nameOf(m.senderId)}</span>
                  )}
                  <div className={`flex items-end gap-1 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                    <div
                      className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                        isMine ? "bg-brand text-white rounded-tr-sm" : "bg-white border rounded-tl-sm"
                      }`}
                    >
                      {m.text}
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => deleteMessage(m.id)}
                        className="text-gray-300 hover:text-red-400 text-base leading-none shrink-0 pb-1"
                        title="메시지 삭제"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-300 mx-1 mt-0.5">{timeStr(m.createdAt)}</span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      </div>{/* /fixed container */}

      {/* 입력창 */}
      {showInput && (
        <div
          className="fixed left-0 right-0 bg-white border-t px-3 py-2 flex gap-2 z-10"
          style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + 56px)` }}
        >
          <input
            className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand"
            placeholder="메시지 입력..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          />
          <button
            onClick={sendMessage}
            disabled={!text.trim()}
            className="bg-brand text-white px-4 rounded-xl text-sm font-semibold disabled:opacity-40 shrink-0"
          >
            전송
          </button>
        </div>
      )}
    </AuthGuard>
  );
}
