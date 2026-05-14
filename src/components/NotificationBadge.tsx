"use client";

import { useRequests } from "@/hooks/useRequests";
import { useChatUnread } from "@/hooks/useChatUnread";
import { useReservations } from "@/hooks/useReservations";
import { useRoomUnread } from "@/hooks/useRoomUnread";

function AdminBadge() {
  const { requests } = useRequests();
  const { reservations } = useReservations();
  const count =
    requests.filter((r) => r.status === "accepted").length +
    reservations.filter((r) => r.status === "pending").length;
  if (count === 0) return null;
  return (
    <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function ChatBadge() {
  const { hasAnyUnread, unreadNoticeCount } = useChatUnread();
  if (!hasAnyUnread) return null;
  if (unreadNoticeCount > 0) {
    return (
      <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
        {unreadNoticeCount > 99 ? "99+" : unreadNoticeCount}
      </span>
    );
  }
  return <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full" />;
}

function RoomsBadge() {
  const { hasUnread } = useRoomUnread();
  if (!hasUnread) return null;
  return <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full" />;
}

export function NotificationBadge({ kind }: { kind: "admin" | "chat" | "rooms" }) {
  if (kind === "admin") return <AdminBadge />;
  if (kind === "chat") return <ChatBadge />;
  if (kind === "rooms") return <RoomsBadge />;
  return null;
}
