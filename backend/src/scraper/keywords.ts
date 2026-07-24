/**
 * Keyword list used to tag tenders whose title/description mention
 * defense / surveillance / optics equipment of interest.
 *
 * Sourced from the project brief. Matching is case-insensitive and
 * whole-phrase (not stemmed), run against the tender's title + description.
 */
export const KEYWORDS: string[] = [
  "Thermal Camera",
  "Thermal Weapon Sight",
  "Thermal Imager",
  "Thermal Imaging Sight",
  "Night Vision Device",
  "Night Vision Goggles",
  "Image Intensifier",
  "PTZ Camera",
  "Long Range PTZ Camera",
  "Optical Camera",
  "Laser Range Finder",
  "LOROS",
  "EOSS",
  "Battlefield Surveillance Radar",
  "Border Surveillance System",
  "Reflex Sight",
  "Red Dot Sight",
  "Holographic Sight",
  "Weapon Sight",
  "LWIR",
  "MWIR",
  "Uncooled Thermal",
  "Cooled Thermal",
  "Target Acquisition System",
  "Handheld Thermal Imager",
  "Day Night Sight",
  "Night Vision Camera",
];

/**
 * Returns the subset of KEYWORDS found in the given text, matched as
 * whole phrases, case-insensitively. Longer/more specific phrases are
 * checked as-is (no need to de-duplicate substrings like "Thermal
 * Camera" vs "Thermal Imager" - each is reported independently since
 * they represent distinct equipment categories).
 */
export function matchKeywords(text: string): string[] {
  if (!text) return [];
  const haystack = text.toLowerCase();
  const matches: string[] = [];

  for (const keyword of KEYWORDS) {
    const needle = keyword.toLowerCase();
    if (haystack.includes(needle)) {
      matches.push(keyword);
    }
  }
  return matches;
}

/** Comma-joined string for storage in Tender.keywordMatched, or null if none. */
export function matchKeywordsAsString(
  title: string | null | undefined,
  description: string | null | undefined
): string | null {
  const combined = `${title ?? ""} ${description ?? ""}`;
  const matches = matchKeywords(combined);
  return matches.length ? matches.join(", ") : null;
}
