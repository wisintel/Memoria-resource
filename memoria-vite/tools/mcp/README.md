# Memoria App MCP Server

This MCP server exposes the current Memoria app model to Codex.

It is intentionally app-aware:

- domains are promoted domain cards and app filters
- cards live in `nodes`, `concepts`, `entities`, `clusters`, `domains`, `reference_cards`, `claims`, and `documents`
- graph state lives in `views`, `view_items`, and `view_edges`
- Markdown notes in `library/` and `sources/` remain the editable source files
- discovery refresh is still the database writer for generated knowledge rows
- app row writes go through the running Memoria app API, not direct SQLite edits

Useful tools:

- `app_summary`
- `list_domains`
- `list_card_families`
- `search_cards`
- `read_card`
- `graph_view`
- `current_app_context`
- `list_notes`
- `search_notes`
- `read_note`
- `write_source_note`
- `write_library_note`
- `read_only_sql`
- `refresh_discovery`
- `convert_pdf_to_document`
- `create_item`
- `update_item`
- `delete_item`
- `create_edge`
- `update_edge`
- `delete_edge`
- `create_domain`
- `update_domain`
- `delete_domain`
- `create_view`
- `update_view`
- `delete_view`
- `place_item`
- `save_item_positions`
- `remove_view_item`
- `remove_view_edge`
- `reset_workbench`
- `import_document`
- `import_document_file`
- `delete_document`

`convert_pdf_to_document` sends a local PDF through the app's document upload endpoint. The app endpoint uses the repo-local Marker runtime in `tools/marker/` to convert the PDF into Markdown, then imports it into Memoria as a document.

The mutation tools require the app API to be running. By default they call:

```bash
http://127.0.0.1:4174
```

Override that with `MEMORIA_APP_API_URL` if the API is running somewhere else.

Start command:

```bash
node /Users/davidhall/Developer/memoria/tools/mcp/server.mjs
```

Project-scoped Codex registration:

```toml
[mcp_servers.memoria-app]
command = "node"
args = ["/Users/davidhall/Developer/memoria/tools/mcp/server.mjs"]
cwd = "/Users/davidhall/Developer/memoria"
```
