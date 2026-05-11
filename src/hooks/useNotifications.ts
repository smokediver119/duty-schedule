"use client";

import { useEffect, useRef } from "react";

export function useNotifications() {
  const permRef = useRef<NotificationPermission>("default");

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      permRef.current = "granted";
      return;
    }
    if (Notification.permission !== "denied") {
      Notification.requestPermission().then((p) => {
        permRef.current = p;
      });
    }
  }, []);

  const sendNotification = (title: string, body: string) => {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    new Notification(title, { body, icon: "/symbol.png" });
  };

  const setBadge = (count: number) => {
    if (!("setAppBadge" in navigator)) return;
    if (count > 0) navigator.setAppBadge(count);
    else navigator.clearAppBadge();
  };

  return { sendNotification, setBadge };
}
