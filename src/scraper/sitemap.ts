import { load } from "cheerio";

const SITEMAP_URL = "https://www.nhs.uk/sitemap-cms-content.xml";

export async function fetchSitemapUrls(): Promise<string[]> {
  console.log(`Fetching sitemap from ${SITEMAP_URL}...`);
  const response = await fetch(SITEMAP_URL, {
    headers: { "User-Agent": "nhs-mcp-scraper/2.0 (health data for LLM tools)" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const $ = load(xml, { xmlMode: true });

  const urls: string[] = [];
  $("url > loc").each((_, el) => {
    const url = $(el).text().trim();
    if (url.includes("/conditions/") || url.includes("/medicines/")) {
      urls.push(url);
    }
  });

  console.log(`Found ${urls.length} condition/medicine URLs in sitemap`);
  return urls;
}
