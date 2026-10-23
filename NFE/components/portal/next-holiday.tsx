"use client";

import { useSyncExternalStore } from "react";
import { FIXED_HOLIDAYS } from "@/lib/workspace";

const format = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** The next fixed-date UAE public holiday from today, worked out in the browser so it is never out of date. */
function nextHoliday(): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcoming = [now.getFullYear(), now.getFullYear() + 1]
    .flatMap((year) => FIXED_HOLIDAYS.uae.map((h) => ({ title: h.title, date: new Date(year, h.month, h.day) })))
    .filter((h) => h.date >= today)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  return upcoming ? `${upcoming.title}, ${format.format(upcoming.date)}` : "";
}

const subscribe = () => () => undefined;

export function NextHoliday() {
  // Empty on the server and during hydration, then the real value in the browser.
  const text = useSyncExternalStore(subscribe, nextHoliday, () => "");
  return <>{text || "…"}</>;
}
