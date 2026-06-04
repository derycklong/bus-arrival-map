"use client";

import { useState, useEffect, useRef } from "react";

interface DurationTextProps {
  ms: number | null;
  time?: string | null;
}

const NEUTRAL = "var(--color-text-muted)";

function colorForMinutes(mins: number): string {
  if (mins < 2) return "var(--color-success)";
  if (mins < 5) return "#84cc16";
  if (mins < 10) return "#eab308";
  if (mins < 15) return "#f97316";
  return "#ef4444";
}

function msFromTime(time: string): number {
  return new Date(time).getTime() - Date.now();
}

export default function DurationText({ ms, time }: DurationTextProps) {
  const [liveMs, setLiveMs] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!time) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset countdown when time is cleared
      setLiveMs(null);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    const cur = msFromTime(time);
    if (cur < 60000 && cur >= 0) {
      const tick = () => setLiveMs(msFromTime(time));
      tick();
      intervalRef.current = setInterval(tick, 1000);
    } else {
      setLiveMs(null);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [time, ms]);

  const effectiveMs = time && liveMs !== null ? liveMs : ms;

  if (effectiveMs === null || effectiveMs === undefined) {
    return <span style={{ color: NEUTRAL, fontSize: "11px", fontWeight: 600 }}>---</span>;
  }
  if (effectiveMs < 0) {
    return <span style={{ color: "var(--color-success)", fontSize: "11px", fontWeight: 600 }}>Arr</span>;
  }
  const mins = Math.floor(effectiveMs / 60000);
  if (mins === 0) {
    const secs = Math.floor(effectiveMs / 1000);
    return (
      <span style={{ color: "var(--color-success)", fontSize: "11px", fontWeight: 600 }}>{secs}s</span>
    );
  }
  return (
    <span style={{ color: colorForMinutes(mins), fontSize: "11px", fontWeight: 600 }}>{mins}m</span>
  );
}
