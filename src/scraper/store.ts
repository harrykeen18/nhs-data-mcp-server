import { getDb, upsertPage, insertSections } from "../db.js";
import type { ExtractedPage } from "../types.js";

export function storePage(page: ExtractedPage): void {
  const db = getDb();

  const transaction = db.transaction(() => {
    const pageId = upsertPage(page);
    if (page.sections.length > 0) {
      insertSections(pageId, page.sections);
    }
  });

  transaction();
}
