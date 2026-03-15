"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

const navigation = [
  { name: "Overview", href: "/", icon: "📊" },
  { name: "Batch Review", href: "/batch", icon: "📋" },
  { name: "Publishing Queue", href: "/queue", icon: "📤" },
  { name: "Voice Notes", href: "/voice-notes", icon: "🎙️" },
  { name: "Analytics", href: "/analytics", icon: "📈" },
  { name: "Users", href: "/users", icon: "👥" },
  { name: "Settings", href: "/settings", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-lg font-bold text-white">
          Tokenomics<span className="text-indigo-400">.net</span>
        </h1>
        <p className="text-xs text-gray-500 mt-1">Content System</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-indigo-500/10 text-indigo-400 font-medium"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-gray-800 space-y-3">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
          System Online
        </div>
        {user && (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-gray-300 font-medium truncate">{user.email}</p>
            </div>
            <button
              id="logout-btn"
              onClick={logout}
              title="Sign out"
              className="flex-shrink-0 p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
