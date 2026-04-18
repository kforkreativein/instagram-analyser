import AppSidebar from "../components/AppSidebar";
import Topbar from "../components/Topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      {/* Ambient Glow Blobs */}
      <div className="fixed top-[-100px] right-[10%] w-[500px] h-[500px] rounded-full bg-[rgba(255,59,87,0.06)] blur-[120px] pointer-events-none z-0"></div>
      <div className="fixed bottom-[10%] left-[20%] w-[400px] h-[400px] rounded-full bg-[rgba(59,255,200,0.04)] blur-[120px] pointer-events-none z-0"></div>

      <div className="flex min-h-screen w-full relative z-10">
        <AppSidebar />
        <div className="flex-1 xl:ml-[280px] min-w-0 overflow-x-hidden min-h-screen relative flex flex-col z-1 bg-transparent">
          <Topbar />
          <main className="p-[32px] flex-1 page-enter relative z-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
