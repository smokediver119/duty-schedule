"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "./useAuth";

interface ChannelMeta {
  lastMessageAt: number;
  lastSenderId: string;
}

interface InboxEntry {
  lastMessageAt: number;
  fromId: string;
}

export function useChatUnread() {
  const { session, me } = useAuth();
  const myId = session?.userId ?? "";
  const isAdmin = session?.role === "admin";
  const myRole = me?.role ?? null;

  const [channelMeta, setChannelMeta] = useState<Record<string, ChannelMeta>>({});
  const [dmInbox, setDmInbox] = useState<Record<string, InboxEntry>>({});
  const [readTs, setReadTs] = useState<Record<string, number>>({});
  const [notices, setNotices] = useState<{ createdAt: number; authorId: string }[]>([]);

  const watchChannels = useMemo(() => {
    if (!myId) return [];
    const ch = ["notice", "global"];
    if (isAdmin || myRole === "supervisor") ch.push("role_supervisor");
    if (isAdmin || myRole === "leader")     ch.push("role_leader");
    if (isAdmin || myRole === "member")     ch.push("role_member");
    return ch;
  }, [myId, isAdmin, myRole]);

  // 채널 메타 구독
  useEffect(() => {
    if (!myId) return;
    const unsubs = watchChannels.map((ch) =>
      onSnapshot(doc(db, "channels", ch), (snap) => {
        if (!snap.exists()) return;
        setChannelMeta((prev) => ({ ...prev, [ch]: snap.data() as ChannelMeta }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [myId, watchChannels.join(",")]); // eslint-disable-line

  // DM 수신함 구독
  useEffect(() => {
    if (!myId) return;
    return onSnapshot(doc(db, "userInbox", myId), (snap) => {
      if (snap.exists()) setDmInbox(snap.data() as Record<string, InboxEntry>);
    });
  }, [myId]);

  // 읽음 타임스탬프 구독
  useEffect(() => {
    if (!myId) return;
    return onSnapshot(doc(db, "userRead", myId), (snap) => {
      if (snap.exists()) setReadTs(snap.data() as Record<string, number>);
    });
  }, [myId]);

  // 공지 구독
  useEffect(() => {
    return onSnapshot(
      query(collection(db, "announcements"), orderBy("createdAt", "desc")),
      (snap) =>
        setNotices(
          snap.docs.map((d) => {
            const data = d.data() as { createdAt: number; authorId: string };
            return { createdAt: data.createdAt, authorId: data.authorId };
          })
        )
    );
  }, []);

  // 미읽음 채널 Set
  const unreadChannels = useMemo(() => {
    const s = new Set<string>();
    Object.entries(channelMeta).forEach(([ch, meta]) => {
      if (meta.lastSenderId !== myId && meta.lastMessageAt > (readTs[ch] ?? 0)) {
        s.add(ch);
      }
    });
    return s;
  }, [channelMeta, readTs, myId]);

  // 미읽음 DM 발신자 Set
  const unreadDmUsers = useMemo(() => {
    const s = new Set<string>();
    Object.entries(dmInbox).forEach(([dmCh, entry]) => {
      if (entry.fromId !== myId && entry.lastMessageAt > (readTs[dmCh] ?? 0)) {
        s.add(entry.fromId);
      }
    });
    return s;
  }, [dmInbox, readTs, myId]);

  const hasAnyUnread = unreadChannels.size > 0 || unreadDmUsers.size > 0;

  // 미읽은 공지 개수
  const unreadNoticeCount = useMemo(() => {
    const readAt = readTs["notice"] ?? 0;
    return notices.filter((n) => n.createdAt > readAt && n.authorId !== myId).length;
  }, [notices, readTs, myId]);

  // 채널 읽음 처리
  const markRead = async (channelId: string) => {
    if (!myId) return;
    await setDoc(doc(db, "userRead", myId), { [channelId]: Date.now() }, { merge: true });
  };

  return { hasAnyUnread, unreadChannels, unreadDmUsers, unreadNoticeCount, markRead };
}
