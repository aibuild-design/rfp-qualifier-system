"use client";

import Image from "next/image";
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
      <div className="flex h-16 flex-col justify-center gap-1 border-b border-white/10 px-5">
        {/* Yellow wordmark on the near-black rail — 11.9:1, the variant
            Caravann's own site uses on dark. */}
        <Image
          src="/brand/caravann-yellow.png"
          alt="Caravann"
          width={1500}
          height={277}
          priority
          className="h-[22px] w-auto object-contain object-left"
        />
        <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">
          RFP Bid Desk
        </p>
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
