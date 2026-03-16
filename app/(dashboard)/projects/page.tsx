export default function ProjectsPage() {
  return (
    <div className="w-full min-h-screen text-[var(--text)] flex flex-col relative z-10">
      <div className="mx-auto w-full p-[32px]">
        {/* Header Section */}
        <header className="mb-[32px]">
          <div className="flex items-center gap-[8px] mb-[12px]">
            <div className="w-[16px] h-[1px] bg-[#3BFFC8]"></div>
            <span className="font-['JetBrains_Mono'] text-[10px] tracking-[0.16em] uppercase text-[#3BFFC8]">
              Workflow
            </span>
          </div>
          <h1 className="font-['Syne'] font-[800] text-[clamp(28px,4vw,40px)] tracking-[-0.02em] leading-[1.05] text-[#F0F2F7] mb-[10px]">
            Active <span className="text-[#3BFFC8]">Projects</span>
          </h1>
          <p className="font-['DM_Sans'] text-[14px] font-[300] text-[#8892A4] max-w-[560px] leading-[1.65] mb-[28px]">
            Manage complete video production lifecycles from concept to upload.
          </p>
        </header>

        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0D1017] p-8 text-center flex flex-col items-center justify-center min-h-[300px]">
          <div className="w-[48px] h-[48px] rounded-full bg-[rgba(255,255,255,0.03)] flex items-center justify-center mb-[16px]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#5A6478]">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <line x1="3" x2="21" y1="9" y2="9" />
              <line x1="9" x2="9" y1="21" y2="9" />
            </svg>
          </div>
          <h2 className="font-['Syne'] font-[700] text-[18px] text-[#F0F2F7] mb-[8px]">Projects Coming Soon</h2>
          <p className="font-['DM_Sans'] text-[13px] text-[#8892A4]">The project management workspace is currently in development.</p>
        </div>
      </div>
    </div>
  );
}
