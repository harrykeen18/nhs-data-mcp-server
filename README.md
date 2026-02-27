# NHS MCP Server

An MCP server providing access to NHS health information — conditions, medicines, symptoms, treatments, and more. Backed by a SQLite database with full-text search across 900+ NHS pages.

## Connect to the hosted server

No installation required — the server runs on Fly.io.

**Claude Desktop:** Go to Settings > Connectors and add the server URL:
```
https://nhs-mcp-server.fly.dev/mcp
```

**Claude Code / other MCP clients:** Add to your MCP config:
```json
{
  "mcpServers": {
    "nhs": {
      "type": "streamable-http",
      "url": "https://nhs-mcp-server.fly.dev/mcp"
    }
  }
}
```

## Available tools

| Tool | Description |
|------|-------------|
| `search_nhs` | Full-text search across all NHS conditions and medicines |
| `get_condition` | Get detailed info about a condition (optionally filter by aspect: symptoms, causes, treatments) |
| `get_medicine` | Get detailed info about a medicine (uses, dosage, side effects, interactions) |
| `get_page` | Fetch any NHS page by slug |
| `list_conditions` | Browse conditions A-Z, optionally filter by letter |
| `list_medicines` | Browse medicines A-Z, optionally filter by letter |

## Run locally

```bash
npm install
npm run dev          # stdio transport (for local MCP clients)

# or with HTTP transport:
TRANSPORT=http npm run dev
```

## Data

The database (`nhs-data.db`) is pre-built and committed to this repo. It's produced by the [nhs-data-scraper](https://github.com/harryf/nhs-data-scraper) repo.

To update the data:
1. Run the scraper in the `nhs-data-scraper` repo
2. Copy the resulting `nhs-data.db` here
3. Commit and redeploy: `fly deploy`

## Deploy

```bash
npm run build
fly deploy
```

## License

Content is licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). © NHS
