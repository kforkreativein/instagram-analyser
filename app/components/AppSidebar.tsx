"use client";

import { useEffect, useState } from "react";

import {
  Clapperboard,
  Home,
  Settings,
  Tv,
  Upload,
  Users,
  Video,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    section: "Analyze", items: [
      { label: "Home", path: "/", icon: Home },
      { label: "Channels", path: "/channels", icon: Tv },
      { label: "Videos", path: "/videos", icon: Video },
      { label: "Uploads", path: "/uploads", icon: Upload },
    ]
  },
  {
    section: "Create", items: [
      { label: "Scripts", path: "/scripts", icon: Clapperboard },
      { label: "Clients", path: "/clients", icon: Users },
    ]
  },
  {
    section: "System", items: [
      { label: "Settings", path: "/settings", icon: Settings },
    ]
  }
];

export default function AppSidebar() {
  const pathname = usePathname();

  // Dynamic branding from Settings
  const [agencyName, setAgencyName] = useState("Outlier Studio");
  const [agencyLogo, setAgencyLogo] = useState("");

  useEffect(() => {
    setAgencyName(localStorage.getItem("agencyName") || "Outlier Studio");
    setAgencyLogo(localStorage.getItem("agencyLogo") || "");
  }, []);

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[240px] md:w-[260px] lg:w-[280px] shrink-0 bg-[rgba(8,10,15,0.97)] border-r border-[rgba(255,255,255,0.06)] z-[100] flex flex-col">
      {/* LOGO AREA */}
      <div className="px-6 h-[89px] flex items-center border-b border-white/5 shrink-0">
        <Link href="/" className="block cursor-pointer no-underline group hover:opacity-90 transition-opacity">
          <img
            src="/branding/full-logo.png"
            alt="Outlier Studio"
            className="w-auto h-[89px] object-contain flex-shrink-0"
          />
        </Link>
      </div>

      {/* NAV SECTION */}
      <nav className="flex-1 overflow-y-auto p-[10px_10px] custom-scrollbar">
        {navItems.map((group) => (
          <div key={group.section}>
            <div className="font-['JetBrains_Mono'] text-[9px] tracking-[0.2em] uppercase text-[#5A6478] px-[8px] my-[16px_0_5px]">
              {group.section}
            </div>
            <div className="flex flex-col gap-0">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.path || (item.path !== "/" && pathname.startsWith(item.path));

                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={() => {
                      if (item.path === "/scripts") {
                        localStorage.removeItem("remix_data");
                      }
                    }}
                    className={`relative flex items-center gap-[10px] p-[9px_10px] rounded-[8px] mb-[1px] text-[13px] border transition-all duration-150 cursor-pointer no-underline ${isActive
                      ? "bg-[rgba(255,59,87,0.08)] text-[#F0F2F7] border-[rgba(255,59,87,0.18)]"
                      : "text-[#8892A4] border-transparent hover:bg-[#111620] hover:text-[#F0F2F7] hover:border-[rgba(255,255,255,0.06)]"
                      }`}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[65%] bg-[#FF3B57] rounded-r-[3px]" />
                    )}
                    <span className={`w-[16px] text-center flex-shrink-0 flex justify-center text-[14px] ${isActive ? "text-[#FF3B57]" : ""}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span>{item.label}</span>


                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* SIDEBAR FOOTER */}
      <div className="p-[14px] border-t border-[rgba(255,255,255,0.06)]">
        <div className="flex flex-row items-center gap-[8px] p-[8px_10px] bg-[#111620] rounded-[8px] border border-[rgba(255,255,255,0.06)]">
          {agencyLogo ? (
            <div className="w-[26px] h-[26px] rounded-[7px] bg-white p-[2px] flex items-center justify-center overflow-hidden shrink-0">
              <img src={agencyLogo} alt="" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center bg-gradient-to-br from-[#FF3B57] to-[#FF8C42] shrink-0">
              <span className="font-['Syne'] font-[800] text-[11px] text-white">{agencyName.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <span className="text-[11.5px] font-['DM_Sans'] text-[#8892A4] truncate">
            {agencyName}
          </span>
        </div>
      </div>
    </aside>
  );
}
