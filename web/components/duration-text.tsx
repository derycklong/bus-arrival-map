"use client";

interface DurationTextProps {
  ms: number | null;
}

export default function DurationText({ ms }: DurationTextProps) {
  if (ms === null || ms === undefined) {
    return <span className="text-gray-500">---</span>;
  }
  if (ms < 0) {
    return <span className="text-green-500 font-semibold">Arr</span>;
  }
  const mins = Math.floor(ms / 60000);
  if (mins === 0) {
    const secs = Math.floor(ms / 1000);
    return <span className="text-green-500 font-semibold">{secs}s</span>;
  }
  if (mins < 2) {
    return <span className="text-green-500 font-semibold">{mins}m</span>;
  }
  if (mins < 5) {
    return <span className="text-lime-500 font-semibold">{mins}m</span>;
  }
  if (mins < 5) {
    return <span className="text-lime-500 font-semibold">{mins}m</span>;
  }
  if (mins < 10) {
    return <span className="text-yellow-500 font-semibold">{mins}m</span>;
  }
  if (mins < 15) {
    return <span className="text-orange-500 font-semibold">{mins}m</span>;
  }
  return <span className="text-red-500 font-semibold">{mins}m</span>;
}
