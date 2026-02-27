import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  searchPages,
  getPageBySlug,
  getSectionsByPageId,
  listByType,
} from "./db.js";
import {
  formatPageWithSections,
  formatSearchResults,
  formatPageList,
  ASPECT_MAP,
} from "./formatters.js";
import type { SearchResult } from "./types.js";

function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

export function registerTools(server: McpServer): void {
  server.tool(
    "search_nhs",
    "Full-text search across all NHS conditions and medicines. Returns matching pages with names, types, and descriptions.",
    {
      query: z.string().describe("Search term to find across NHS content"),
      type: z.enum(["condition", "medicine"]).optional().describe("Filter by content type"),
    },
    async ({ query, type }) => {
      try {
        const results = searchPages(query, type);
        if (results.length === 0) {
          return textResult(`No NHS content found matching "${query}".`);
        }
        return textResult(formatSearchResults(results));
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  server.tool(
    "get_condition",
    "Get detailed NHS information about a specific health condition. Use search_nhs or list_conditions first to find the correct slug.",
    {
      slug: z.string().describe("The condition slug (e.g., 'asthma', 'type-2-diabetes')"),
      aspect: z
        .enum(["symptoms", "causes", "treatments", "overview", "all"])
        .optional()
        .default("all")
        .describe("Which aspect of the condition to return. Defaults to 'all'."),
    },
    async ({ slug, aspect }) => {
      try {
        const page = getPageBySlug(slug);
        if (!page) {
          const results = searchPages(slug.replace(/-/g, " "), "condition");
          if (results.length > 0) {
            return textResult(
              `No exact condition found for "${slug}". Did you mean one of these?\n\n` +
              formatSearchResults(results)
            );
          }
          return errorResult(`Condition "${slug}" not found and no search results matched.`);
        }
        if (page.type !== "condition") return errorResult(`"${slug}" is a ${page.type}, not a condition. Use get_medicine for medicines.`);

        const aspectFilter = aspect !== "all" ? ASPECT_MAP[aspect] || aspect : undefined;
        const sections = getSectionsByPageId(page.id, aspectFilter);
        return textResult(formatPageWithSections(page, sections));
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  server.tool(
    "get_medicine",
    "Get detailed NHS information about a specific medicine including uses, dosage, side effects, and interactions. Use search_nhs or list_medicines first to find the correct slug.",
    {
      slug: z.string().describe("The medicine slug (e.g., 'ibuprofen', 'paracetamol')"),
    },
    async ({ slug }) => {
      try {
        const page = getPageBySlug(slug);
        if (!page) {
          const results = searchPages(slug.replace(/-/g, " "), "medicine");
          if (results.length > 0) {
            return textResult(
              `No exact medicine found for "${slug}". Did you mean one of these?\n\n` +
              formatSearchResults(results)
            );
          }
          return errorResult(`Medicine "${slug}" not found and no search results matched.`);
        }
        if (page.type !== "medicine") return errorResult(`"${slug}" is a ${page.type}, not a medicine. Use get_condition for conditions.`);

        const sections = getSectionsByPageId(page.id);
        return textResult(formatPageWithSections(page, sections));
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  server.tool(
    "get_page",
    "Fetch any NHS page by its slug, regardless of type.",
    {
      slug: z.string().describe("The page slug (e.g., 'asthma', 'ibuprofen')"),
    },
    async ({ slug }) => {
      try {
        const page = getPageBySlug(slug);
        if (!page) {
          // Auto-fallback: search for the slug as a query
          const results = searchPages(slug.replace(/-/g, " "));
          if (results.length > 0) {
            return textResult(
              `No exact page found for "${slug}". Did you mean one of these?\n\n` +
              formatSearchResults(results)
            );
          }
          return errorResult(`Page "${slug}" not found and no search results matched.`);
        }

        const sections = getSectionsByPageId(page.id);
        return textResult(formatPageWithSections(page, sections));
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  server.tool(
    "list_conditions",
    "Browse NHS conditions A-Z. Optionally filter by first letter.",
    {
      letter: z.string().length(1).optional().describe("Filter by first letter (e.g., 'A')"),
    },
    async ({ letter }) => {
      try {
        const pages = listByType("condition", letter);
        return textResult(formatPageList(pages));
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );

  server.tool(
    "list_medicines",
    "Browse NHS medicines A-Z. Optionally filter by first letter.",
    {
      letter: z.string().length(1).optional().describe("Filter by first letter (e.g., 'P')"),
    },
    async ({ letter }) => {
      try {
        const pages = listByType("medicine", letter);
        return textResult(formatPageList(pages));
      } catch (err) {
        return errorResult(String(err));
      }
    }
  );
}
