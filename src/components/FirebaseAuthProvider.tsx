"use client";

import { signInAnonymously } from "firebase/auth";
import { useEffect } from "react";
import { auth } from "@/lib/firebase";

export function FirebaseAuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    signInAnonymously(auth)
      .then((result) => console.log("✅ Firebase 익명 로그인 성공:", result.user.uid))
      .catch((error) => console.error("❌ Firebase 익명 로그인 실패:", error));
  }, []);

  return <>{children}</>;
}
