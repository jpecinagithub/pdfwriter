/** Tiny id helper (crypto.randomUUID with fallback). */
export function nanoid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
}
