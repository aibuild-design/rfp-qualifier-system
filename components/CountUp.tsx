"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Counts a number up to its value on first paint.
 *
 * The point is not decoration. A dashboard of static figures gives no sense of
 * whether it is live or a screenshot, and the count is the one moment where the
 * desk can say "these numbers were just fetched" without a spinner or a
 * timestamp taking up space.
 *
 * The server renders the real number, so the markup is correct with JavaScript
 * off and there is nothing to hydrate wrongly. A layout effect then resets the
 * text to zero and animates up, which happens before the browser paints, so
 * there is no flash of the final value first.
 *
 * Writes to textContent through a ref rather than through state: sixty renders
 * a second to animate one integer would re-render every card on the page, and
 * React has no reason to know about a number that is mid-flight.
 */
export function CountUp({
  value,
  duration = 700,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // A number that animates is a number that is briefly wrong. For anyone who
    // has asked for less motion, show the true value and stop.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || value === 0) {
      el.textContent = String(value);
      return;
    }

    let raf = 0;
    const start = performance.now();
    // Decelerating, so it lands softly on the real figure rather than stopping
    // dead on it.
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = String(Math.round(ease(t) * value));
      if (t < 1) raf = requestAnimationFrame(tick);
      else el.textContent = String(value);
    };

    el.textContent = "0";
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  // tabular figures so the width never changes as the digits roll, which would
  // otherwise nudge everything beside it on every frame.
  return (
    <span ref={ref} className={`tabular ${className ?? ""}`} suppressHydrationWarning>
      {value}
    </span>
  );
}
