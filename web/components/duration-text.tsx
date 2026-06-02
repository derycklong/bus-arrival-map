"use client";

interface DurationTextProps {
  ms: number | null;
}

const NEUTRAL = "var(--color-text-muted)";

function colorForMinutes(mins: number): string {
  if (mins < 2) return "var(--color-success)";
  if (mins < 5) return "#84cc16";
  if (mins < 10) return "#eab308";
  if (mins < 15) return "#f97316";
  return "#ef4444";
}

export default function DurationText({ ms }: DurationTextProps) {
  if (ms === null || ms === undefined) {
    return <span style={{ color: NEUTRAL, fontSize: "11px", fontWeight: 600 }}>---</span>;
  }
  if (ms < 0) {
    return <span style={{ color: "var(--color-success)", fontSize: "11px", fontWeight: 600 }}>Arr</span>;
  }
  const mins = Math.floor(ms / 60000);
  if (mins === 0) {
    const secs = Math.floor(ms / 1000);
    return (
      <span style={{ color: "var(--color-success)", fontSize: "11px", fontWeight: 600 }}>{secs}s</span>
    );
  }
  return (
    <span style={{ color: colorForMinutes(mins), fontSize: "11px", fontWeight: 600 }}>{mins}m</span>
  );
}
