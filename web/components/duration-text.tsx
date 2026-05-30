"use client";

interface DurationTextProps {
  ms: number | null;
}

export default function DurationText({ ms }: DurationTextProps) {
  if (ms === null || ms === undefined) {
    return <span className="text-gray-600">---</span>;
  }
  if (ms < 0) {
    return <span className="text-red-400 font-semibold">Arr</span>;
  }
  const mins = Math.floor(ms / 60000);
  if (mins >= 1) {
    return <span className="text-emerald-400">{mins}m</span>;
  }
  const secs = Math.floor(ms / 1000);
  return <span className="text-gray-400">{secs}s</span>;
}
