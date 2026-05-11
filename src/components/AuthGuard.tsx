"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export function AuthGuard({
  adminOnly = false,
  children,
}: {
  adminOnly?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { session, ready } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/");
      return;
    }
    if (adminOnly && session.role !== "admin") {
      router.replace("/calendar");
    }
  }, [ready, session, adminOnly, router]);

  if (!ready || !session) {
    return <div className="p-8 text-center text-gray-400">로딩 중...</div>;
  }
  if (adminOnly && session.role !== "admin") return null;

  return <>{children}</>;
}
