/**
 * Kingdom Chronicle generator — produces a flowing prose narrative of the
 * kingdom's history from structured sim data and journal entries.
 *
 * This is a pure function (no React, no Pixi) so it can run in a worker
 * or be called from a test. The output is plain text with markdown-friendly
 * formatting so it can also be downloaded as a .md file.
 */

import type { SavedJournalEntry } from "../sim/Persistence";

export interface ChronicleInput {
  kingdomName: string;
  monarchName: string;
  kingdomMotto?: string;
  foundedAtMs: number;
  currentYear: number;
  currentSeason: string;
  currentDay: number;
  population: number;
  gold: number;
  vaultCount: number;
  successionGeneration: number;
  dynastyStreak: number;
  reputationScore: number;
  reputationDescriptor: string;
  factions: { merchants: number; scholars: number; guard: number };
  journal: SavedJournalEntry[];
  totalUprisings: number;
  totalUsurperChallenges: number;
  totalRepelled: number;
}

export interface ChronicleSection {
  title: string;
  body: string;
}

/** Generate the full kingdom chronicle as an array of sections. */
export function generateChronicle(input: ChronicleInput): ChronicleSection[] {
  const sections: ChronicleSection[] = [];

  sections.push(buildFoundingSection(input));
  sections.push(buildCurrentStateSection(input));

  const yearSections = buildYearSections(input);
  sections.push(...yearSections);

  const notablePeople = buildNotablePeopleSection(input);
  if (notablePeople) sections.push(notablePeople);

  sections.push(buildPoliticalSection(input));
  sections.push(buildFactionSection(input));
  sections.push(buildVaultSection(input));

  return sections;
}

/** Convert sections to a downloadable markdown string. */
export function chronicleToMarkdown(input: ChronicleInput, sections: ChronicleSection[]): string {
  const header = `# The Chronicle of ${input.kingdomName}\n\n`;
  const motto = input.kingdomMotto ? `*"${input.kingdomMotto}"*\n\n---\n\n` : `---\n\n`;
  const body = sections
    .map((s) => `## ${s.title}\n\n${s.body}`)
    .join("\n\n---\n\n");
  const footer = `\n\n---\n*Chronicle compiled on Day ${input.currentDay}, ${cap(input.currentSeason)}, Year ${input.currentYear}.*\n`;
  return header + motto + body + footer;
}

// ── Section builders ─────────────────────────────────────────────────────────

function buildFoundingSection(input: ChronicleInput): ChronicleSection {
  const age = msToAgeString(Date.now() - input.foundedAtMs);
  const OPENS = [
    `${input.kingdomName} was founded ${age} ago`,
    `The kingdom of ${input.kingdomName} came into being ${age} ago`,
    `${age} ago, the first stones of ${input.kingdomName} were set`,
  ];
  const opening = OPENS[input.successionGeneration % OPENS.length];

  // Find the earliest journal entry for founding context
  const firstMilestone = input.journal.find((e) => e.kind === "milestone" || e.kind === "life");
  const firstLine = firstMilestone
    ? ` The first entry in the kingdom's chronicle reads: "${firstMilestone.text}"`
    : "";

  const monarchLine = input.successionGeneration === 1
    ? ` ${input.monarchName} has been the kingdom's only ruler.`
    : ` Since then, ${input.successionGeneration} monarchs have held the crown — the current being ${input.monarchName}.`;

  return {
    title: "The Founding",
    body: `${opening} in the ${cap(input.currentSeason)} of what would become Year ${input.currentYear}.${firstLine}${monarchLine}`,
  };
}

function buildCurrentStateSection(input: ChronicleInput): ChronicleSection {
  const popLine = `The kingdom presently numbers **${input.population}** souls`;
  const goldLine = `the treasury holds **${Math.floor(input.gold)} gold**`;
  const seasonLine = `It is ${cap(input.currentSeason)}, Year ${input.currentYear}`;

  const repLine = input.reputationScore >= 4
    ? `The crown is ${input.reputationDescriptor} — well thought of in the towns.`
    : input.reputationScore <= -4
    ? `The crown is considered ${input.reputationDescriptor} by those who choose their words carefully.`
    : `The crown's reputation is ${input.reputationDescriptor} — steady if not inspiring.`;

  return {
    title: "The Kingdom Today",
    body: `${seasonLine}. ${popLine}, and ${goldLine}. ${repLine}`,
  };
}

function buildYearSections(input: ChronicleInput): ChronicleSection[] {
  if (input.currentYear <= 1) return [];

  const sections: ChronicleSection[] = [];

  // Group milestones by year
  const byYear = new Map<number, SavedJournalEntry[]>();
  for (const e of input.journal) {
    if (e.kind !== "milestone" && e.kind !== "life") continue;
    const arr = byYear.get(e.year) ?? [];
    arr.push(e);
    byYear.set(e.year, arr);
  }

  const years = [...byYear.keys()].sort((a, b) => a - b);
  // Cap to 8 years of summary to keep the chronicle readable
  const shown = years.slice(0, 8);

  for (const year of shown) {
    const entries = byYear.get(year) ?? [];
    if (entries.length === 0) continue;
    // Pick the 2 most meaningful entries for this year
    const picked = entries.slice(0, 2);
    const lines = picked.map((e) => `— ${e.text}`).join("\n");
    sections.push({
      title: `Year ${year}`,
      body: lines,
    });
  }

  return sections;
}

function buildNotablePeopleSection(input: ChronicleInput): ChronicleSection | null {
  // Find NPCs mentioned in multiple journal entries
  const nameCounts = new Map<string, number>();
  for (const e of input.journal) {
    // Extract capitalized multi-word names (rough heuristic)
    const matches = e.text.match(/\b[A-Z][a-z]+ (?:[A-Z][a-z]+|the [A-Za-z]+)\b/g) ?? [];
    for (const name of matches) {
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
    }
    // Also single names that appear 3+ times
    const singles = e.text.match(/\b[A-Z][a-z]{3,}\b/g) ?? [];
    for (const name of singles) {
      if (name === input.kingdomName || name === input.monarchName) continue;
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 0.5);
    }
  }

  const notable = [...nameCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name]) => name);

  if (notable.length === 0) return null;

  const body = `The chronicle mentions these names more than any others: **${notable.join("**, **")}**. Their stories are woven through the kingdom's days.`;
  return { title: "Notable Figures", body };
}

function buildPoliticalSection(input: ChronicleInput): ChronicleSection {
  const parts: string[] = [];

  if (input.successionGeneration > 1) {
    const streakLine = input.dynastyStreak >= 3
      ? `The dynasty has passed through ${input.dynastyStreak} successive natural heirs without challenge.`
      : input.dynastyStreak === 0
      ? "The current line did not inherit the throne by lineage."
      : "The line of succession has been maintained.";
    parts.push(streakLine);
  }

  if (input.totalUsurperChallenges > 0) {
    const repelled = input.totalRepelled;
    const total = input.totalUsurperChallenges;
    parts.push(
      repelled === total
        ? `The crown has faced ${total} usurper challenge${total === 1 ? "" : "s"} and repelled ${repelled === 1 ? "it" : "all of them"}.`
        : `The crown has faced ${total} usurper challenge${total === 1 ? "" : "s"}. ${total - repelled} resulted in a change of throne.`,
    );
  }

  if (input.totalUprisings > 0) {
    parts.push(`The people have risen ${input.totalUprisings} time${input.totalUprisings === 1 ? "" : "s"} in the kingdom's history.`);
  }

  if (parts.length === 0) {
    parts.push("The throne has been uncontested. Whether this reflects wisdom, strength, or luck is a matter of interpretation.");
  }

  return { title: "Politics and Power", body: parts.join(" ") };
}

function buildFactionSection(input: ChronicleInput): ChronicleSection {
  const { factions } = input;
  const desc = (score: number) =>
    score >= 5 ? "enthusiastic supporters" :
    score >= 2 ? "generally pleased" :
    score >= -2 ? "watching quietly" :
    score >= -5 ? "quietly dissatisfied" :
    "openly unhappy";

  const body =
    `The **Merchant Guild** is ${desc(factions.merchants)}. ` +
    `The **Scholars** are ${desc(factions.scholars)}. ` +
    `The **Guard** are ${desc(factions.guard)}.`;

  return { title: "The Three Factions", body };
}

function buildVaultSection(input: ChronicleInput): ChronicleSection {
  if (input.vaultCount === 0) {
    return {
      title: "The Royal Vault",
      body: "The vault is empty. The kingdom is young, or has not yet paused to collect what it has made.",
    };
  }

  // Pull vault-related journal entries (artifacts logged as milestones with "vault")
  const vaultEntries = input.journal
    .filter((e) => e.kind === "milestone" && e.text.includes("royal vault"))
    .slice(-3);

  const countLine = `The royal vault holds **${input.vaultCount} artifact${input.vaultCount === 1 ? "" : "s"}** accumulated across all reigns.`;
  const recentLine = vaultEntries.length > 0
    ? ` Most recently: ${vaultEntries.map((e) => `"${e.text}"`).join("; ")}`
    : "";

  return { title: "The Royal Vault", body: countLine + recentLine };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function msToAgeString(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"}`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}
