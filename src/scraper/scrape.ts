import { fetchSitemapUrls } from "./sitemap.js";
import { extractPage } from "./extract.js";
import { storePage } from "./store.js";
import { getDb, getPageCount } from "../db.js";

const DELAY_MS = 500;
const BATCH_SIZE = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("=== NHS MCP Scraper ===\n");

  const urls = await fetchSitemapUrls();

  // Filter out sub-pages (e.g. /conditions/asthma/symptoms/) — we only want top-level
  const topLevelUrls = urls.filter((url) => {
    const path = new URL(url).pathname;
    // /conditions/slug/ or /medicines/slug/ — exactly 3 segments
    const segments = path.split("/").filter(Boolean);
    return segments.length === 2;
  });

  console.log(`\nScraping ${topLevelUrls.length} top-level pages...\n`);

  let success = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < topLevelUrls.length; i += BATCH_SIZE) {
    const batch = topLevelUrls.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (url) => {
        try {
          const page = await extractPage(url);
          return { url, page, error: null };
        } catch (err) {
          return { url, page: null, error: err };
        }
      })
    );

    for (const { url, page, error } of results) {
      if (error) {
        console.warn(`  [ERROR] ${url}: ${(error as Error).message || error}`);
        errors++;
      } else if (!page) {
        skipped++;
      } else {
        try {
          storePage(page);
        } catch (storeErr) {
          console.warn(`  [STORE ERROR] ${url}: ${(storeErr as Error).message}`);
          errors++;
          continue;
        }
        success++;
        if (success % 50 === 0) {
          console.log(`  Progress: ${success} pages stored...`);
        }
      }
    }

    // Be polite — delay between batches
    if (i + BATCH_SIZE < topLevelUrls.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n=== Scraping complete ===`);
  console.log(`  Stored: ${success}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);

  const counts = getPageCount();
  console.log(`\nDatabase summary:`);
  for (const { type, count } of counts) {
    console.log(`  ${type}: ${count} pages`);
  }
}

main().catch((err) => {
  console.error("Scraper failed:", err);
  process.exit(1);
});
