import "./globals.css";
import type { Metadata } from "next";
import { ToastProvider } from "./components/UI/Toast";
import { AuthProvider } from "./components/AuthProvider";

export const metadata: Metadata = {
  title: "Instagram Outlier & Video Analyzer",
  description: "Discover Instagram outliers and run deep video analysis.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased min-h-screen relative text-[var(--text)]">
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
