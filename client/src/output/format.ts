import type { Job, Role, ShopPresence } from "./types";
import { LAMINATE_LABEL, MATERIAL_LABEL } from "./types";

export function formatUsdc(cents: number): string {
  return `${(cents / 100).toFixed(2)} USDC`;
}

export function formatInches(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
}

export function formatSize(widthIn: number, heightIn: number): string {
  return `${formatInches(widthIn)} × ${formatInches(heightIn)} in`;
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function roleLabel(role: Role): string {
  return role === "ordering" ? "You're ordering" : "You're producing";
}

export function phaseLabel(job: Job, role: Role): string {
  if (job.expired && job.phase === "offered") return "Expired offer";
  switch (job.phase) {
    case "offered":
      return role === "producing" ? "Offer" : "Waiting for acceptance";
    case "accepted":
      return role === "ordering" ? "Funding required" : "Waiting for funding";
    case "funding_pending":
      return "Payment pending";
    case "funded":
      return role === "producing" ? "Ready to produce" : "In production";
    case "completion_submitted":
      return role === "ordering" ? "Completion to review" : "Waiting for review";
    case "paid":
      return "Paid";
    case "passed":
      return "Passed";
    case "issue":
      return "Production issue";
    default:
      return job.phase;
  }
}

export function materialLine(laminate: boolean): string {
  return laminate ? `${MATERIAL_LABEL} · ${LAMINATE_LABEL}` : MATERIAL_LABEL;
}

export function requiredMaterial(laminate: boolean): string {
  return laminate ? `${MATERIAL_LABEL} and ${LAMINATE_LABEL}` : MATERIAL_LABEL;
}

export function attentionLabel(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "1 needs you" : `${count} need you`;
}

export function stripStatus(count: number, presence: ShopPresence): string {
  const attention = attentionLabel(count);
  if (attention) return attention;
  if (presence === "disconnected") return "Disconnected";
  if (presence === "stale") return "Capacity stale";
  if (presence === "paused") return "Paused";
  return "Receiving jobs";
}

export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function downloadText(fileName: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function needsAction(job: Job, role: Role): boolean {
  if (role === "producing") {
    if (job.expired && job.phase === "offered") return false;
    return job.phase === "offered" || job.phase === "funded" || job.phase === "issue";
  }
  if (!job.selfOrdered) return false;
  if (job.expired && job.phase === "offered") return true;
  return (
    job.phase === "accepted" ||
    job.phase === "funding_pending" ||
    job.phase === "completion_submitted" ||
    job.phase === "passed"
  );
}

export type CardRef = { job: Job; role: Role };

export function groupJobs(jobs: Job[]): { needs: CardRef[]; progress: CardRef[]; done: CardRef[] } {
  const needs: CardRef[] = [];
  const progress: CardRef[] = [];
  const done: CardRef[] = [];
  for (const job of jobs) {
    const roles: Role[] = job.selfOrdered ? ["ordering", "producing"] : ["producing"];
    for (const role of roles) {
      const ref = { job, role };
      if (job.phase === "paid" || (role === "producing" && job.phase === "passed")) done.push(ref);
      else if (needsAction(job, role)) needs.push(ref);
      else progress.push(ref);
    }
  }
  const recent = (a: CardRef, b: CardRef) => Date.parse(b.job.updatedAt) - Date.parse(a.job.updatedAt);
  needs.sort(recent);
  progress.sort(recent);
  done.sort(recent);
  return { needs, progress, done };
}
