import type { Metadata, Viewport } from "next";
import { FirebaseAuthProvider } from "@/components/FirebaseAuthProvider";
import { InstallPrompt } from "@/components/InstallPrompt";
import { NotificationManager } from "@/components/NotificationManager";
import "./globals.css";

export const metadata: Metadata = {
  title: "광진소방서 당직근무 지정",
  description: "당직근무 변경 요청 시스템",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "당직근무",
  },
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#d7372b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-amber-50/30 text-gray-900 antialiased">
        <FirebaseAuthProvider>
          <NotificationManager />
          {children}
          <InstallPrompt />
        </FirebaseAuthProvider>
      </body>
    </html>
  );
}
