/**
 * Shared input sanitizers. Defends against:
 *   - Control characters & bidi overrides (RLO/PDI tricks)
 *   - Zero-width chars that hide hostile names
 *   - Excessively long strings (DoS-by-text)
 *   - HTML-ish content
 *
 * Pure functions; safe to call from any layer.
 *
 * Implementation note: character-class regexes built at runtime from
 * String.fromCharCode so the source stays pure ASCII and survives any
 * editor / copy-paste round trip without bit-rotting.
 */

const CONTROL_CHARS = (() => {
  // U+0000–U+001F C0 controls + U+007F DEL
  let cls = "";
  for (let i = 0; i <= 0x1f; i++) cls += String.fromCharCode(i);
  cls += String.fromCharCode(0x7f);
  return new RegExp("[" + cls + "]", "g");
})();

const BIDI_OVERRIDES = (() => {
  // Common bidi/zero-width offenders
  const codes = [
    0x200b, // ZERO WIDTH SPACE
    0x200c, // ZWNJ
    0x200d, // ZWJ
    0x200e, // LEFT-TO-RIGHT MARK
    0x200f, // RIGHT-TO-LEFT MARK
    0x202a, // LRE
    0x202b, // RLE
    0x202c, // PDF
    0x202d, // LRO
    0x202e, // RLO
    0xfeff, // BOM / ZWNBSP
  ];
  return new RegExp("[" + codes.map((c) => String.fromCharCode(c)).join("") + "]", "g");
})();

const HTML_TAGS = /<\/?[a-zA-Z][^>]*>/g;
const REPEATED_WS = /\s+/g;

export function sanitizeName(input: string, maxLen = 32): string {
  if (typeof input !== "string") return "";
  return input
    .replace(CONTROL_CHARS, "")
    .replace(BIDI_OVERRIDES, "")
    .replace(HTML_TAGS, "")
    .replace(REPEATED_WS, " ")
    .trim()
    .slice(0, maxLen);
}

/**
 * Sanitize a Twitch username. Twitch enforces [a-zA-Z0-9_] 4–25 chars but
 * we accept slightly broader (some chat APIs deliver display_name with
 * unicode). We still strip dangerous stuff and clamp length.
 */
export function sanitizeTwitchUser(input: string): string {
  const clean = sanitizeName(input, 25);
  // also block obvious impersonation attempts of internal control names
  if (clean === "" || clean === "system" || clean === "narrative") return "viewer";
  return clean;
}

/** Validate a hex color (#rrggbb or #rgb). Returns the input if valid, else fallback. */
export function sanitizeHexColor(input: string, fallback = "#000000"): string {
  if (typeof input !== "string") return fallback;
  if (/^#[0-9a-fA-F]{6}$/.test(input)) return input.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(input)) return input.toLowerCase();
  return fallback;
}
