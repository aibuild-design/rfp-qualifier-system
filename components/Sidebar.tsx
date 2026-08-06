"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GridIcon, SettingsIcon } from "./icons";
import { SignOutButton } from "./SignOutButton";

// Placeholder nav — only the shell has been scoped so far. Extend this once
// the real sections (RFPs list, review queue, etc.) are defined.
const NAV_ITEMS = [
  { label: "Dashboard", icon: GridIcon, href: "/dashboard" },
  { label: "Settings", icon: SettingsIcon, href: "/dashboard/settings" },
];

export function Sidebar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-rfp-black text-white lg:flex">
      <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-rfp-gold-bright text-sm font-bold text-rfp-black">
          R
        </span>
        <div className="leading-tight">
          <p className="font-display text-[13px] font-semibold tracking-wide">
            RFP QUALIFIER
          </p>
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">
            Dashboard
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-5">
        {NAV_ITEMS.map(({ label, icon: Icon, href }) => {
          const active = pathname === href;
          const className = `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            active
              ? "bg-white/10 text-white"
              : "text-white/60 hover:bg-white/5 hover:text-white/90"
          }`;
          return (
            <Link key={label} href={href} className={className}>
              <Icon className="h-4.5 w-4.5" />
              {label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-rfp-gold-bright" />}
            </Link>
          );
        })}
      </nav>

      <SignOutButton userEmail={userEmail} />
    </aside>
  );
}
