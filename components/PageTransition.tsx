"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Re-runs the entrance animation on every navigation.
 *
 * The dashboard layout is a server component and does not re-render when you
 * move between pages inside it, so an animation class there would fire once on
 * first load and never again. Keying on the pathname remounts the wrapper, which
 * restarts the CSS animation.
 *
 * A client boundary purely for `usePathname` - the pages themselves stay server
 * components and are passed straight through as children, so nothing that
 * renders inside here is pulled into the client bundle.
 *
 * Deliberately a fade and nothing more. A slide or a directional transition
 * implies a spatial relationship between pages that a flat nav does not have,
 * and it delays content the user asked for. Under prefers-reduced-motion the
 * animation is removed entirely and this becomes a plain div.
 */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className={`fade-in ${className ?? ""}`}>
      {children}
    </div>
  );
}
