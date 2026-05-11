"use client";

import { useRequests } from "@/hooks/useRequests";
import { useChatUnread } from "@/hooks/useChatUnread";

export function NotificationBadge({ kind }: { kind: "admin" | "chat" }) {
  const { requests } = useRequests();
  const { hasAnyUnread, unreadNoticeCount } = useChatUnread();

  if (kind === "chat") {
    if (!hasAnyUnread) return null;
    if (unreadNoticeCount > 0) {
      return (
        <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
          {unreadNoticeCount > 99 ? "99+" : unreadNoticeCount}
        </span>
      );
    }
    return (
      <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full" />
    );
  }

  let count = 0;
  if (kind === "admin") {
    count = requests.filter((r) => r.status === "accepted").length;
  }

  if (count === 0) return null;
  return (
    <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}
