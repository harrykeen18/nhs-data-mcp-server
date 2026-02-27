import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PageRow, SectionRow, SearchResult, ExtractedPage } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DB_PATH = process.env.DB_PATH || path.join(PROJECT_ROOT, "nhs-data.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      description TEXT,
      alternate_names TEXT,
      keywords TEXT,
      generic_name TEXT,
      brand_names TEXT,
      date_modified TEXT,
      last_reviewed TEXT,
      next_review TEXT,
      scraped_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      health_aspect TEXT NOT NULL,
      headline TEXT,
      description TEXT,
      content_html TEXT,
      content_text TEXT,
      advisory_level TEXT,
      sort_order INTEGER NOT NULL,
      UNIQUE(page_id, health_aspect, sort_order)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
      name, description, keywords,
      content='pages', content_rowid='id'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS sections_fts USING fts5(
      headline, content_text,
      content='sections', content_rowid='id'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
      INSERT INTO pages_fts(rowid, name, description, keywords)
      VALUES (new.id, new.name, new.description, new.keywords);
    END;

    CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, name, description, keywords)
      VALUES ('delete', old.id, old.name, old.description, old.keywords);
    END;

    CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, name, description, keywords)
      VALUES ('delete', old.id, old.name, old.description, old.keywords);
      INSERT INTO pages_fts(rowid, name, description, keywords)
      VALUES (new.id, new.name, new.description, new.keywords);
    END;

    CREATE TRIGGER IF NOT EXISTS sections_ai AFTER INSERT ON sections BEGIN
      INSERT INTO sections_fts(rowid, headline, content_text)
      VALUES (new.id, new.headline, new.content_text);
    END;

    CREATE TRIGGER IF NOT EXISTS sections_ad AFTER DELETE ON sections BEGIN
      INSERT INTO sections_fts(sections_fts, rowid, headline, content_text)
      VALUES ('delete', old.id, old.headline, old.content_text);
    END;

    CREATE TRIGGER IF NOT EXISTS sections_au AFTER UPDATE ON sections BEGIN
      INSERT INTO sections_fts(sections_fts, rowid, headline, content_text)
      VALUES ('delete', old.id, old.headline, old.content_text);
      INSERT INTO sections_fts(rowid, headline, content_text)
      VALUES (new.id, new.headline, new.content_text);
    END;
  `);
}

// --- Query helpers ---

export function searchPages(query: string, type?: string): SearchResult[] {
  const db = getDb();
  // Escape special FTS5 characters and append wildcard
  const ftsQuery = query.replace(/['"*()]/g, "").trim();
  if (!ftsQuery) return [];

  const terms = ftsQuery.split(/\s+/).map(t => `"${t}"*`).join(" ");

  let sql = `
    SELECT p.name, p.slug, p.type, p.description, rank
    FROM pages_fts
    JOIN pages p ON p.id = pages_fts.rowid
    WHERE pages_fts MATCH ?
  `;
  const params: unknown[] = [terms];

  if (type) {
    sql += ` AND p.type = ?`;
    params.push(type);
  }

  sql += ` ORDER BY rank LIMIT 25`;

  return db.prepare(sql).all(...params) as SearchResult[];
}

export function getPageBySlug(slug: string): PageRow | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM pages WHERE slug = ?").get(slug) as PageRow | undefined;
}

export function getSectionsByPageId(pageId: number, aspect?: string): SectionRow[] {
  const db = getDb();
  if (aspect && aspect !== "all") {
    const pattern = `%${aspect}%`;
    return db.prepare(
      "SELECT * FROM sections WHERE page_id = ? AND health_aspect LIKE ? ORDER BY sort_order"
    ).all(pageId, pattern) as SectionRow[];
  }
  return db.prepare(
    "SELECT * FROM sections WHERE page_id = ? ORDER BY sort_order"
  ).all(pageId) as SectionRow[];
}

export function listByType(type: string, letter?: string): PageRow[] {
  const db = getDb();
  if (letter) {
    return db.prepare(
      "SELECT * FROM pages WHERE type = ? AND name LIKE ? ORDER BY name"
    ).all(type, `${letter.toUpperCase()}%`) as PageRow[];
  }
  return db.prepare(
    "SELECT * FROM pages WHERE type = ? ORDER BY name"
  ).all(type) as PageRow[];
}

export function upsertPage(page: ExtractedPage): number {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = db.prepare("SELECT id FROM pages WHERE slug = ?").get(page.slug) as { id: number } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE pages SET
        type = ?, name = ?, url = ?, description = ?,
        alternate_names = ?, keywords = ?, generic_name = ?,
        brand_names = ?, date_modified = ?, last_reviewed = ?,
        next_review = ?, scraped_at = ?
      WHERE id = ?
    `).run(
      page.type, page.name, page.url, page.description,
      page.alternate_names ? JSON.stringify(page.alternate_names) : null,
      page.keywords,
      page.generic_name,
      page.brand_names ? JSON.stringify(page.brand_names) : null,
      page.date_modified, page.last_reviewed, page.next_review,
      now, existing.id
    );

    // Delete old sections (triggers handle FTS cleanup)
    db.prepare("DELETE FROM sections WHERE page_id = ?").run(existing.id);

    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO pages (type, name, slug, url, description, alternate_names, keywords,
      generic_name, brand_names, date_modified, last_reviewed, next_review, scraped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    page.type, page.name, page.slug, page.url, page.description,
    page.alternate_names ? JSON.stringify(page.alternate_names) : null,
    page.keywords,
    page.generic_name,
    page.brand_names ? JSON.stringify(page.brand_names) : null,
    page.date_modified, page.last_reviewed, page.next_review,
    now
  );

  return Number(result.lastInsertRowid);
}

export function insertSections(pageId: number, sections: ExtractedPage["sections"]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO sections (page_id, health_aspect, headline, description, content_html, content_text, advisory_level, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const s of sections) {
    stmt.run(pageId, s.health_aspect, s.headline, s.description, s.content_html, s.content_text, s.advisory_level, s.sort_order);
  }
}

export function getPageCount(): { type: string; count: number }[] {
  const db = getDb();
  return db.prepare("SELECT type, COUNT(*) as count FROM pages GROUP BY type").all() as { type: string; count: number }[];
}
