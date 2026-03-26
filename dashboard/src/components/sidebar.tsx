"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

const navigation = [
  {
    name: "Overview",
    href: "/",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-10h8V3h-8v8Z" />
    ),
  },
  {
    name: "Batch Review",
    href: "/batch",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    ),
  },
  {
    name: "Publishing Queue",
    href: "/queue",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h12M3 17h8m7-12v12m0 0-3-3m3 3 3-3" />
    ),
  },
  {
    name: "Voice Notes",
    href: "/voice-notes",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Zm0 14v3m-5-6a5 5 0 0 0 10 0" />
    ),
  },
  {
    name: "Analytics",
    href: "/analytics",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19h16M7 16l4-5 3 2 4-6" />
    ),
  },
  {
    name: "Users",
    href: "/users",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m16 0h6v-2a4 4 0 0 0-3-3.87M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm6 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    ),
  },
  {
    name: "Settings",
    href: "/settings",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317a1 1 0 0 1 1.35-.447l1.2.6a1 1 0 0 0 .894 0l1.2-.6a1 1 0 0 1 1.35.447l.4.8a1 1 0 0 0 .754.54l1.3.2a1 1 0 0 1 .85.99v1.3a1 1 0 0 0 .293.707l.922.922a1 1 0 0 1 0 1.414l-.922.922a1 1 0 0 0-.293.707v1.3a1 1 0 0 1-.85.99l-1.3.2a1 1 0 0 0-.754.54l-.4.8a1 1 0 0 1-1.35.447l-1.2-.6a1 1 0 0 0-.894 0l-1.2.6a1 1 0 0 1-1.35-.447l-.4-.8a1 1 0 0 0-.754-.54l-1.3-.2a1 1 0 0 1-.85-.99v-1.3a1 1 0 0 0-.293-.707l-.922-.922a1 1 0 0 1 0-1.414l.922-.922A1 1 0 0 0 5 8.147v-1.3a1 1 0 0 1 .85-.99l1.3-.2a1 1 0 0 0 .754-.54l.42-.8ZM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="hidden lg:flex w-72 h-screen shrink-0 overflow-hidden flex-col border-r bg-[#1a1714] text-[#faf8f5] border-[#3a332d]">
      <div className="px-7 py-7 border-b border-[#3a332d]">
        <p className="uppercase text-[11px] tracking-[0.12em] text-[#d4cfc8]">Control Layer</p>
        <h1 className="text-[1.35rem] leading-tight mt-2" style={{ fontFamily: "var(--font-libre-baskerville), Georgia, serif" }}>
          Tokenomics<span className="text-[#b8956e]">.net</span>
        </h1>
        <p className="text-xs text-[#b9b1a8] mt-1">Publishing operations dashboard</p>
      </div>

      <nav className="flex-1 px-4 py-5 space-y-1.5">
        {navigation.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-200 ${isActive
                ? "bg-[#2a2520] text-[#faf8f5] border border-[#b8956e]/40"
                : "text-[#c7beb4] hover:text-[#faf8f5] hover:bg-[#26211d]"
                }`}
            >
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${isActive ? "bg-[#b8956e]/15" : "bg-[#312a24]"}`}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  {item.icon}
                </svg>
              </span>
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-[#3a332d] space-y-3">
        <div className="flex items-center gap-2 text-xs text-[#b9b1a8]">
          <span className="w-2 h-2 rounded-full bg-[#b8956e] flex-shrink-0" />
          Pipeline monitor active
        </div>
        {user && (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-[#faf8f5] font-medium truncate">{user.email}</p>
            </div>
            <button
              id="logout-btn"
              onClick={logout}
              title="Sign out"
              className="flex-shrink-0 p-1.5 text-[#a79e94] hover:text-[#faf8f5] hover:bg-[#2f2924] rounded-lg transition-all"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
