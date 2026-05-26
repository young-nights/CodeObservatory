import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function getChangeKindColor(kind: string): string {
  switch (kind) {
    case "created":
      return "text-green-600 bg-green-50 dark:bg-green-950";
    case "modified":
      return "text-blue-600 bg-blue-50 dark:bg-blue-950";
    case "deleted":
      return "text-red-600 bg-red-50 dark:bg-red-950";
    default:
      return "text-gray-600 bg-gray-50";
  }
}

export function getFileExtension(path: string): string {
  const parts = path.split(".");
  return parts.length > 1 ? parts.pop()! : "";
}

export function getFileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}
