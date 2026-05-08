export function humanize(key: string): string {
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Rough char-width approximation for sans-serif fonts: ~0.55 × font size.
const CHAR_PX_PER_FONT_PX = 0.55;

export function fitLabel(text: string, maxPx: number, fontSize: number): string {
  const charPx = fontSize * CHAR_PX_PER_FONT_PX;
  const maxChars = Math.floor(maxPx / charPx);
  if (text.length <= maxChars) return text;
  if (maxChars <= 2) return text.slice(0, maxChars);
  return text.slice(0, maxChars - 1).replace(/\s+$/, "") + "…";
}
