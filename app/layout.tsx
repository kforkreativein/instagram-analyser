import "./globals.css";
import type { Metadata } from "next";
import AppSidebar from "./components/AppSidebar";
import Topbar from "./components/Topbar";
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
            {/* Ambient Glow Blobs */}
            <div className="fixed top-[-100px] right-[10%] w-[500px] h-[500px] rounded-full bg-[rgba(255,59,87,0.06)] blur-[120px] pointer-events-none z-0"></div>
            <div className="fixed bottom-[10%] left-[20%] w-[400px] h-[400px] rounded-full bg-[rgba(59,255,200,0.04)] blur-[120px] pointer-events-none z-0"></div>

            <div className="flex min-h-screen w-full relative z-10">
              <AppSidebar />
              <div className="flex-1 ml-[240px] md:ml-[260px] lg:ml-[280px] min-w-0 overflow-x-hidden min-h-screen relative flex flex-col z-1 bg-transparent">
                <Topbar />
                <main className="p-[32px] flex-1 page-enter relative z-10">
                  {children}
                </main>
              </div>
            </div>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
