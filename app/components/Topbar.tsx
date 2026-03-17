"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Upload, ChevronRight } from "lucide-react";
import { useSession } from "next-auth/react";

export default function Topbar() {
    const pathname = usePathname();
    const router = useRouter();
    const { data: session } = useSession();

    // Dynamic branding
    const [agencyName, setAgencyName] = useState("");

    const fetchBranding = async () => {
        try {
        const res = await fetch("/api/settings");
        if (res.ok) {
            const data = await res.json();
            if (data?.agencyName) {
                setAgencyName(data.agencyName);
            }
        }
        } catch (error) {
            console.error("Failed to fetch branding:", error);
        }
    };

    useEffect(() => {
        fetchBranding();
        const handleUpdate = () => fetchBranding();
        window.addEventListener("settingsUpdated", handleUpdate);
        return () => window.removeEventListener("settingsUpdated", handleUpdate);
    }, []);

    // Format pathname to a readable page name
    const getPageName = () => {
        if (!pathname || pathname === "/") return "HOME";
        const name = pathname.split("/").filter(Boolean)[0];
        return name ? name.toUpperCase() : "HOME";
    };

    const isHome = !pathname || pathname === "/" || pathname === "/home";

    const getAccentColorClass = () => {
        if (!pathname || pathname === "/" || pathname.startsWith("/videos") || pathname.startsWith("/uploads") || pathname.startsWith("/channels")) {
            return "text-[#FF3B57]";
        }
        if (pathname.startsWith("/scripts") || pathname.startsWith("/vault")) {
            return "text-[#3BFFC8]";
        }
        return "text-[#FF3B57]"; // default
    };

    return (
        <header className="sticky top-0 bg-[rgba(8,10,15,0.85)] backdrop-blur-[24px] border-b border-[rgba(255,255,255,0.06)] px-4 md:px-6 h-[89px] flex flex-col md:flex-row items-center justify-between gap-4 z-50">
            {/* Breadcrumb (Left-Aligned) */}
            <div className="flex items-center gap-4">
                <nav className="flex items-center gap-2 text-sm">
                    <span className="font-['JetBrains_Mono'] text-[11px] tracking-[0.15em] text-[#5A6478] uppercase">OUTLIER STUDIO</span>
                    <ChevronRight className="text-[#3BFFC8] opacity-50 text-[10px] mx-2" />
                    <span className="font-['JetBrains_Mono'] text-[11px] tracking-[0.15em] text-[#F0F2F7] uppercase">
                        {getPageName().replace(/-/g, " ")}
                    </span>
                </nav>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 shrink-0 w-full md:w-auto justify-end">
                {!isHome && (
                    <>
                        <Link href="/channels" className="bg-transparent border border-[rgba(255,255,255,0.12)] rounded-[8px] px-[16px] py-[8px] text-[12px] font-['DM_Sans'] font-[500] text-[#8892A4] transition-colors hover:bg-[#111620] hover:text-[#F0F2F7] hover:border-[rgba(255,255,255,0.2)]">
                            ⬡ Scan Channels
                        </Link>

                        <Link href="/uploads" className="flex items-center justify-center w-[34px] h-[34px] bg-transparent border border-[rgba(255,255,255,0.1)] rounded-[8px] text-[#8892A4] hover:bg-[#111620] hover:text-[#F0F2F7] transition-colors">
                            <Upload className="w-[14px] h-[14px]" />
                        </Link>

                        <button
                            type="button"
                            onClick={() => {
                                sessionStorage.removeItem("homeState");
                                router.push("/");
                            }}
                            className="bg-[#FF3B57] text-white px-[16px] py-[8px] rounded-[8px] text-[12px] font-['DM_Sans'] font-[600] shadow-[0_0_20px_rgba(255,59,87,0.25)] transition-all hover:bg-[#ff2244] hover:shadow-[0_0_28px_rgba(255,59,87,0.4)] hover:-translate-y-[1px] cursor-pointer border-none"
                        >
                            + New Analysis
                        </button>
                    </>
                )}
            </div>
        </header>
    );
}
