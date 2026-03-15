export default function ExportsPage() {
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
            Exported <span className="text-[#3BFFC8]">Media</span>
          </h1>
          <p className="font-['DM_Sans'] text-[14px] font-[300] text-[#8892A4] max-w-[560px] leading-[1.65] mb-[28px]">
            Review, download, and manage your finalized video assets.
          </p>
        </header>

        <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0D1017] p-8 text-center flex flex-col items-center justify-center min-h-[300px]">
          <div className="w-[48px] h-[48px] rounded-full bg-[rgba(255,255,255,0.03)] flex items-center justify-center mb-[16px]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#5A6478]">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" x2="12" y1="15" y2="3" />
            </svg>
          </div>
          <h2 className="font-['Syne'] font-[700] text-[18px] text-[#F0F2F7] mb-[8px]">No Exports Yet</h2>
          <p className="font-['DM_Sans'] text-[13px] text-[#8892A4]">Rendered reports and video assets will appear here.</p>
        </div>
      </div>
    </div>
  );
}
