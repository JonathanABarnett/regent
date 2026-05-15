import { describe, expect, it } from "vitest";
import { sanitizeName, sanitizeTwitchUser, sanitizeHexColor } from "./sanitize";

describe("sanitizeName", () => {
  it("trims and clamps length", () => {
    expect(sanitizeName("  hi  ", 32)).toBe("hi");
    expect(sanitizeName("a".repeat(100), 10)).toHaveLength(10);
  });

  it("strips control characters", () => {
    expect(sanitizeName("foo" + String.fromCharCode(0x00) + "bar" + String.fromCharCode(0x07) + "baz")).toBe("foobarbaz");
    expect(sanitizeName("a" + String.fromCharCode(0x1b) + "b")).toBe("ab");
  });

  it("strips bidi override characters (the RLO/PDI trick)", () => {
    // U+202E RIGHT-TO-LEFT OVERRIDE
    expect(sanitizeName("file" + String.fromCharCode(0x202e) + "txt.exe")).toBe("filetxt.exe");
  });

  it("strips zero-width characters", () => {
    // U+200B ZERO WIDTH SPACE
    expect(sanitizeName("zero" + String.fromCharCode(0x200b) + "width")).toBe("zerowidth");
  });

  it("strips HTML tags", () => {
    expect(sanitizeName("Roan<script>alert(1)</script>")).toBe("Roanalert(1)");
    expect(sanitizeName("a<b>c</b>d")).toBe("acd");
  });

  it("collapses runs of whitespace", () => {
    expect(sanitizeName("a   b  c")).toBe("a b c");
  });

  it("returns empty for non-string input", () => {
    expect(sanitizeName(123 as unknown as string)).toBe("");
    expect(sanitizeName(null as unknown as string)).toBe("");
    expect(sanitizeName(undefined as unknown as string)).toBe("");
  });
});

describe("sanitizeTwitchUser", () => {
  it("clamps to 25 chars", () => {
    expect(sanitizeTwitchUser("a".repeat(200)).length).toBeLessThanOrEqual(25);
  });

  it("substitutes 'viewer' for empty or reserved", () => {
    expect(sanitizeTwitchUser("")).toBe("viewer");
    expect(sanitizeTwitchUser("system")).toBe("viewer");
    expect(sanitizeTwitchUser("narrative")).toBe("viewer");
  });

  it("preserves normal usernames", () => {
    expect(sanitizeTwitchUser("Alice")).toBe("Alice");
    expect(sanitizeTwitchUser("user_123")).toBe("user_123");
  });

  it("strips HTML / bidi from usernames", () => {
    expect(sanitizeTwitchUser("Alice<img onerror=x>")).toBe("Alice");
    expect(sanitizeTwitchUser(String.fromCharCode(0x202e) + "DarkAlice")).toBe("DarkAlice");
  });
});

describe("sanitizeHexColor", () => {
  it("accepts valid 6-char hex", () => {
    expect(sanitizeHexColor("#FDE047")).toBe("#fde047");
  });

  it("accepts valid 3-char hex", () => {
    expect(sanitizeHexColor("#F0A")).toBe("#f0a");
  });

  it("rejects non-hex input", () => {
    expect(sanitizeHexColor("javascript:alert(1)", "#fff")).toBe("#fff");
    expect(sanitizeHexColor("not a color", "#000")).toBe("#000");
    expect(sanitizeHexColor("", "#aaa")).toBe("#aaa");
  });

  it("rejects almost-valid hex", () => {
    expect(sanitizeHexColor("#GGGGGG", "#fff")).toBe("#fff");
    expect(sanitizeHexColor("#1234567", "#fff")).toBe("#fff");
    expect(sanitizeHexColor("FDE047", "#fff")).toBe("#fff"); // missing #
  });
});
