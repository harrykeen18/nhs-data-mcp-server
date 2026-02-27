import { load } from "cheerio";
import type { ExtractedPage, ExtractedSection } from "../types.js";

const USER_AGENT = "nhs-mcp-scraper/2.0 (health data for LLM tools)";

/** Strip HTML tags to plain text */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
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

/** Derive slug from NHS URL */
function slugFromUrl(url: string): string {
  // e.g. https://www.nhs.uk/conditions/asthma/ → asthma
  // e.g. https://www.nhs.uk/medicines/paracetamol/ → paracetamol
  const parts = url.replace(/\/$/, "").split("/");
  return parts[parts.length - 1];
}

/** Determine type from URL */
function typeFromUrl(url: string): "condition" | "medicine" {
  return url.includes("/medicines/") ? "medicine" : "condition";
}

/** Fetch a single page and extract JSON-LD */
export async function extractPage(url: string): Promise<ExtractedPage | null> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });

  if (!response.ok) {
    console.warn(`  [SKIP] ${response.status} for ${url}`);
    return null;
  }

  const html = await response.text();
  const $ = load(html);

  // Find JSON-LD script tag
  const jsonLdScript = $('script[type="application/ld+json"]').first().html();
  if (!jsonLdScript) {
    console.warn(`  [SKIP] No JSON-LD found on ${url}`);
    return null;
  }

  let schema: any;
  try {
    schema = JSON.parse(jsonLdScript);
  } catch {
    console.warn(`  [SKIP] Invalid JSON-LD on ${url}`);
    return null;
  }

  // Handle @graph arrays (some pages wrap in a graph)
  if (schema["@graph"]) {
    schema = schema["@graph"].find(
      (item: any) => item["@type"] === "MedicalWebPage" || item["@type"] === "WebPage"
    ) ?? schema["@graph"][0];
  }

  if (!schema || !schema.name) {
    console.warn(`  [SKIP] No usable schema on ${url}`);
    return null;
  }

  const pageType = typeFromUrl(url);
  const slug = slugFromUrl(url);

  // Extract medicine-specific fields from about.Drug
  let genericName: string | null = null;
  let brandNames: string[] | null = null;
  const about = schema.about;
  if (about) {
    const drug = Array.isArray(about) ? about.find((a: any) => a["@type"] === "Drug") : (about["@type"] === "Drug" ? about : null);
    if (drug) {
      genericName = drug.nonProprietaryName ?? null;
      if (drug.proprietaryName) {
        brandNames = Array.isArray(drug.proprietaryName) ? drug.proprietaryName : [drug.proprietaryName];
      }
    }
  }

  // Extract alternate names
  let alternateNames: string[] | null = null;
  const altSource = Array.isArray(about) ? about[0] : about;
  if (altSource?.alternateName) {
    alternateNames = Array.isArray(altSource.alternateName) ? altSource.alternateName : [altSource.alternateName];
  }

  // Extract last reviewed dates
  let lastReviewed: string | null = null;
  let nextReview: string | null = null;
  if (schema.lastReviewed) {
    if (Array.isArray(schema.lastReviewed)) {
      lastReviewed = schema.lastReviewed[0] ?? null;
      nextReview = schema.lastReviewed[1] ?? null;
    } else {
      lastReviewed = schema.lastReviewed;
    }
  }

  // Extract sections from hasPart
  const sections: ExtractedSection[] = [];
  const hasPart = schema.hasPart;
  if (Array.isArray(hasPart)) {
    for (let i = 0; i < hasPart.length; i++) {
      const part = hasPart[i];
      if (!part) continue;

      const healthAspect = part.hasHealthAspect ?? part["@type"] ?? "Unknown";
      const headline = part.headline ?? null;
      const description = part.description ?? null;

      // Collect HTML content from nested WebPageElements
      let contentHtml = "";
      if (part.hasPart) {
        const elements = Array.isArray(part.hasPart) ? part.hasPart : [part.hasPart];
        const htmlParts: string[] = [];
        let advisoryLevel: string | null = null;
        for (const el of elements) {
          if (el.text) {
            htmlParts.push(el.text);
          }
          if (el.identifier && !advisoryLevel) {
            advisoryLevel = el.identifier;
          }
        }
        contentHtml = htmlParts.join("\n");

        sections.push({
          health_aspect: healthAspect,
          headline,
          description,
          content_html: contentHtml,
          content_text: stripHtml(contentHtml),
          advisory_level: advisoryLevel,
          sort_order: i,
        });
      } else if (part.text) {
        sections.push({
          health_aspect: healthAspect,
          headline,
          description,
          content_html: part.text,
          content_text: stripHtml(part.text),
          advisory_level: part.identifier ?? null,
          sort_order: i,
        });
      }
    }
  }

  return {
    type: pageType,
    name: schema.name,
    slug,
    url,
    description: schema.description ?? null,
    alternate_names: alternateNames,
    keywords: Array.isArray(schema.keywords) ? schema.keywords.join(", ") : (schema.keywords ?? null),
    generic_name: genericName,
    brand_names: brandNames,
    date_modified: schema.dateModified ?? null,
    last_reviewed: lastReviewed,
    next_review: nextReview,
    sections,
  };
}
