/** Filename helpers — sanitized, no path traversal, .pdf enforced. */

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "document.pdf";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180) || "document.pdf";
}

/** "contract.pdf" -> "contract-edited.pdf". Idempotent: an existing "-edited" suffix is not duplicated. */
export function buildExportFileName(originalOrDesired: string): string {
  const clean = sanitizeFileName(originalOrDesired);
  const withoutExt = clean.replace(/\.pdf$/i, "");
  const base = withoutExt.replace(/(-edited)+$/i, "") || "document";
  return `${base}-edited.pdf`;
}

/** "2.8 MB" style formatting. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[u]}`;
}

/** "Today 10:32" / "Yesterday 18:04" / "02/10/2026 09:15" style. */
export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Today ${time}`;
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString()} ${time}`;
}
