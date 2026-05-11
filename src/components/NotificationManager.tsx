"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useChatUnread } from "@/hooks/useChatUnread";
import { useRequests } from "@/hooks/useRequests";
import { useNotifications } from "@/hooks/useNotifications";

export function NotificationManager() {
  const { session } = useAuth();
  const { hasAnyUnread } = useChatUnread();
  const { requests } = useRequests();
  const { sendNotification, setBadge } = useNotifications();

  const initializedRef = useRef(false);
  const prevHasUnreadRef = useRef(false);
  const prevRequestIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!session) return;

    const myPendingIds = new Set(
      requests
        .filter(
          (r) =>
            (r.targetId === session.userId || r.targetId === null) &&
            r.status === "pending" &&
            r.requesterId !== session.userId
        )
        .map((r) => r.id)
    );

    if (!initializedRef.current) {
      prevRequestIdsRef.current = myPendingIds;
      prevHasUnreadRef.current = hasAnyUnread;
      initializedRef.current = true;
      setBadge(myPendingIds.size + (hasAnyUnread ? 1 : 0));
      return;
    }

    let hasNewRequest = false;
    for (const id of myPendingIds) {
      if (!prevRequestIdsRef.current.has(id)) {
        hasNewRequest = true;
        break;
      }
    }
    if (hasNewRequest) {
      sendNotification("📋 당직근무", "새로운 당직 변경 요청이 도착했습니다.");
    }

    if (hasAnyUnread && !prevHasUnreadRef.current) {
      sendNotification("💬 당직근무", "읽지 않은 채팅 메시지가 있습니다.");
    }

    prevRequestIdsRef.current = myPendingIds;
    prevHasUnreadRef.current = hasAnyUnread;

    setBadge(myPendingIds.size + (hasAnyUnread ? 1 : 0));
  }, [requests, hasAnyUnread, session, sendNotification, setBadge]);

  return null;
}
