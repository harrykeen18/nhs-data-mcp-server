/** A page row from the pages table */
export interface PageRow {
  id: number;
  type: string;
  name: string;
  slug: string;
  url: string;
  description: string | null;
  alternate_names: string | null;
  keywords: string | null;
  generic_name: string | null;
  brand_names: string | null;
  date_modified: string | null;
  last_reviewed: string | null;
  next_review: string | null;
  scraped_at: string;
}

/** A section row from the sections table */
export interface SectionRow {
  id: number;
  page_id: number;
  health_aspect: string;
  headline: string | null;
  description: string | null;
  content_html: string | null;
  content_text: string | null;
  advisory_level: string | null;
  sort_order: number;
}

/** Extracted JSON-LD data from a single NHS page */
export interface ExtractedPage {
  type: "condition" | "medicine";
  name: string;
  slug: string;
  url: string;
  description: string | null;
  alternate_names: string[] | null;
  keywords: string | null;
  generic_name: string | null;
  brand_names: string[] | null;
  date_modified: string | null;
  last_reviewed: string | null;
  next_review: string | null;
  sections: ExtractedSection[];
}

/** A content section extracted from JSON-LD hasPart */
export interface ExtractedSection {
  health_aspect: string;
  headline: string | null;
  description: string | null;
  content_html: string;
  content_text: string;
  advisory_level: string | null;
  sort_order: number;
}

/** Search result from FTS */
export interface SearchResult {
  name: string;
  slug: string;
  type: string;
  description: string | null;
  rank: number;
}
