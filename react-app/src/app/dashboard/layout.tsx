"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "⚡" },
  { href: "/dashboard/create", label: "Create Project", icon: "✨" },
  { href: "/dashboard/projects", label: "Projects", icon: "📁" },
  { href: "/dashboard/clips", label: "My Clips", icon: "🎬" },
  { href: "/dashboard/brand-kit", label: "Brand Kit", icon: "🎨" },
  { href: "/dashboard/billing", label: "Billing", icon: "💳" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-[#f8f9fc] text-slate-800">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-100 shadow-sm flex flex-col transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-white text-sm shadow-lg shadow-indigo-200">
              G
            </div>
            <span className="text-[17px] font-bold tracking-tight text-slate-800">ClipAI</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <span className="text-base w-5 text-center">{item.icon}</span>
                {item.label}
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500" />}
              </Link>
            );
          })}
        </nav>

        {/* Usage widget */}
        <div className="p-4 border-t border-slate-100">
          <div className="bg-indigo-50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500 font-medium">Processing Minutes</span>
              <span className="text-xs text-slate-700 font-semibold">0 / 30</span>
            </div>
            <div className="w-full h-1.5 bg-indigo-100 rounded-full overflow-hidden">
              <div className="h-full w-[2%] bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full" />
            </div>
            <p className="text-[10px] text-slate-400 mt-2">Free Plan · <Link href="/dashboard/billing" className="text-indigo-500 hover:underline">Upgrade</Link></p>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/80 backdrop-blur-xl border-b border-slate-100 flex items-center px-4 md:px-6 gap-4 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end mr-1">
              <span className="text-sm font-semibold text-slate-700 leading-none">{user?.fullName || user?.emailAddresses[0]?.emailAddress}</span>
              <span className="text-[11px] text-slate-400 mt-0.5">Free Plan</span>
            </div>
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
