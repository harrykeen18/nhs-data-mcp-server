import type { PageRow, SectionRow, SearchResult } from "./types.js";

const ASPECT_MAP: Record<string, string> = {
  symptoms: "Symptoms",
  causes: "Causes",
  treatments: "Treatments",
  overview: "Overview",
  self_care: "SelfCare",
  side_effects: "SideEffects",
  usage: "UsageOrSchedule",
  suitability: "Suitability",
  interactions: "Interactions",
};

/** Convert a health aspect URI (e.g. "http://schema.org/SymptomsHealthAspect") to a readable label */
function aspectLabel(aspect: string): string {
  // Strip schema.org prefix if present
  const name = aspect.replace(/^https?:\/\/schema\.org\//, "");
  return name
    .replace(/HealthAspect$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** Strip HTML to readable markdown-ish text */
function htmlToMarkdown(html: string): string {
  return html
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, "\n### $1\n")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<li>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p>(.*?)<\/p>/gis, "$1\n\n")
    .replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatAdvisory(level: string): string {
  switch (level) {
    case "immediate": return "🔴 **Call 999 or go to A&E immediately**";
    case "urgent": return "🟠 **Urgent: See a GP or call 111**";
    case "primary": return "🟡 **See a GP**";
    default: return "";
  }
}

function formatSection(section: SectionRow): string {
  const lines: string[] = [];
  const label = section.headline || aspectLabel(section.health_aspect);
  lines.push(`## ${label}`);

  if (section.advisory_level) {
    const advisory = formatAdvisory(section.advisory_level);
    if (advisory) lines.push(advisory);
  }

  if (section.description) {
    lines.push(section.description);
  }

  if (section.content_html) {
    lines.push(htmlToMarkdown(section.content_html));
  }

  return lines.join("\n\n");
}

export function formatPageWithSections(page: PageRow, sections: SectionRow[]): string {
  const lines: string[] = [`# ${page.name}`];

  if (page.description) {
    lines.push(page.description);
  }

  // Medicine-specific info
  if (page.type === "medicine") {
    const extras: string[] = [];
    if (page.generic_name) extras.push(`**Generic name:** ${page.generic_name}`);
    if (page.brand_names) {
      try {
        const brands = JSON.parse(page.brand_names);
        if (brands.length > 0) extras.push(`**Brand names:** ${brands.join(", ")}`);
      } catch {}
    }
    if (extras.length > 0) lines.push(extras.join("\n"));
  }

  // Alternate names
  if (page.alternate_names) {
    try {
      const alts = JSON.parse(page.alternate_names);
      if (alts.length > 0) lines.push(`**Also known as:** ${alts.join(", ")}`);
    } catch {}
  }

  // Sections
  for (const section of sections) {
    lines.push(formatSection(section));
  }

  // Footer
  const footerParts: string[] = [];
  if (page.last_reviewed) footerParts.push(`Last reviewed: ${page.last_reviewed}`);
  if (page.next_review) footerParts.push(`Next review: ${page.next_review}`);

  lines.push(`\n---\nSource: ${page.url}`);
  if (footerParts.length > 0) lines.push(footerParts.join(" | "));
  lines.push("Content is licensed under the Open Government Licence v3.0. © NHS");

  return lines.join("\n\n");
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return "No results found.";

  return results
    .map((r) => {
      const desc = r.description ? ` — ${r.description}` : "";
      return `- **${r.name}** [${r.type}] (slug: \`${r.slug}\`)${desc}`;
    })
    .join("\n");
}

export function formatPageList(pages: PageRow[]): string {
  if (pages.length === 0) return "No results found.";

  return pages
    .map((p) => `- **${p.name}** (slug: \`${p.slug}\`)`)
    .join("\n");
}

export { ASPECT_MAP };
