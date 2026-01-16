# ChatGPT Project Indexer

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Enumerate all your ChatGPT Projects via browser automation. Restore full discoverability of Projects hidden behind ChatGPT's paginated sidebar.

---

## The Problem

Power users with many ChatGPT Projects face a frustrating limitation: Projects are hidden behind a paginated "See more" menu that requires continuous manual scrolling. The menu auto-dismisses, titles get truncated, and on mobile, older Projects are completely invisible.

**This tool solves that.** It runs a browser session that methodically scrolls through your entire Projects list, captures every Project's full title and identifier, and stores them locally for fast lookup.

---

## Features

- **Complete enumeration** — Captures 100% of Projects visible on ChatGPT Web
- **Full-fidelity titles** — Hovers each entry to reveal untruncated titles
- **Watch mode** — Runs continuously, re-scanning at configurable intervals
- **Delta detection** — Reports new vs unchanged Projects between scans
- **Portable authentication** — Export sessions for use on headless servers
- **Graceful shutdown** — Clean stop on SIGTERM/SIGINT with state preservation
- **Idempotent** — Multiple runs never corrupt or duplicate records

---

## Installation

```bash
# Clone the repository
git clone https://github.com/wilmoore/chatgpt-project-indexer.git
cd chatgpt-project-indexer

# Install dependencies
npm install

# Build
npm run build

# (Optional) Link globally
npm link
```

### Requirements

- Node.js 18+
- Playwright browsers (installed automatically)

---

## Quick Start

```bash
# Authenticate (opens browser for ChatGPT login)
chatgpt-indexer auth login

# Run a single enumeration
chatgpt-indexer run

# Run continuously with 15-minute intervals
chatgpt-indexer run --watch
```

---

## CLI Usage

### `run` — Start enumeration

```bash
chatgpt-indexer run [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--headful` | Force visible browser window | Auto-detect |
| `-o, --output <path>` | Output file path | `projects.json` |
| `-w, --watch` | Run continuously, re-scanning at intervals | Off |
| `-i, --interval <duration>` | Scan interval in watch mode | `15m` |
| `--skip-auth-check` | Skip pre-flight authentication check | Off |

**Examples:**

```bash
# Single run, save to custom file
chatgpt-indexer run -o ~/my-projects.json

# Watch mode with 30-minute interval
chatgpt-indexer run --watch --interval 30m

# Watch mode with 1-hour interval, headful browser
chatgpt-indexer run --watch -i 1h --headful
```

### `status` — Show indexing status

```bash
chatgpt-indexer status [options]
```

Displays project count and recent entries from storage.

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <path>` | Storage file path | `projects.json` |

### `auth` — Manage authentication

#### `auth login`

Opens a browser for interactive ChatGPT login. Exports session for reuse.

```bash
chatgpt-indexer auth login
```

#### `auth status`

Check current authentication status.

```bash
chatgpt-indexer auth status
```

#### `auth export`

Export current session to a portable file.

```bash
chatgpt-indexer auth export -o ~/auth-state.json
```

#### `auth import <file>`

Import a session file (for headless servers).

```bash
chatgpt-indexer auth import ~/auth-state.json
```

---

## Watch Mode

Watch mode keeps the indexer running continuously, re-scanning at regular intervals and reporting changes.

```bash
chatgpt-indexer run --watch --interval 15m
```

### Log Format

Logs are structured for easy parsing and `journalctl`/`tail` compatibility:

```
2026-01-04T10:00:00.000Z [INFO] Starting watch mode (interval: 15m)
2026-01-04T10:04:02.000Z [INFO] Scan #1 complete: 371 projects (371 new, 0 unchanged)
2026-01-04T10:19:02.000Z [INFO] Scan #2 complete: 371 projects (0 new, 371 unchanged)
2026-01-04T10:34:05.000Z [INFO] Scan #3 complete: 373 projects (2 new, 371 unchanged)
```

### Interval Format

Supports seconds, minutes, and hours:

| Format | Duration |
|--------|----------|
| `30s` | 30 seconds |
| `15m` | 15 minutes |
| `1h` | 1 hour |

Minimum interval: 1 minute.

### Graceful Shutdown

Send `SIGTERM` or `SIGINT` (Ctrl+C) to stop cleanly:

```
2026-01-04T11:00:00.000Z [INFO] Received SIGTERM, shutting down gracefully...
2026-01-04T11:00:00.150Z [INFO] Watch mode stopped
```

---

## Remote/Headless Operation

For running on servers without a display:

```bash
# On your local machine (with browser)
chatgpt-indexer auth login

# Transfer the session file
scp ~/.chatgpt-indexer/auth-state.json server:~/.chatgpt-indexer/

# On the remote server
chatgpt-indexer auth import ~/.chatgpt-indexer/auth-state.json
chatgpt-indexer run --watch
```

---

## Output Format

Projects are stored as JSON:

```json
{
  "version": 1,
  "lastUpdatedAt": "2026-01-04T10:00:00.000Z",
  "projects": [
    {
      "id": "g-p-abc123",
      "title": "My Project Name",
      "firstSeenAt": "2026-01-04T10:00:00.000Z",
      "lastConfirmedAt": "2026-01-04T10:00:00.000Z"
    }
  ]
}
```

Each project includes:
- `id` — Stable identifier (usable in deep links: `https://chatgpt.com/g/{id}`)
- `title` — Full untruncated title from tooltip
- `firstSeenAt` — When first discovered
- `lastConfirmedAt` — When last seen during enumeration

---

## API Reference

The project provides a REST API for external apps (Raycast, mobile explorers, etc.).

### OpenAPI Documentation

Full API specification is available at:
- **OpenAPI Spec:** [`doc/api/openapi.yaml`](doc/api/openapi.yaml)
- **Live Endpoint:** `http://127.0.0.1:54321/functions/v1/docs`

### Base URLs

| Service | URL |
|---------|-----|
| **PostgREST API** | `http://127.0.0.1:54321/rest/v1` |
| **Edge Functions** | `http://127.0.0.1:54321/functions/v1` |
| **API Docs** | `http://127.0.0.1:54321/functions/v1/docs` |

### Authentication

All requests require the Supabase anon key in the `apikey` header:

```bash
# Local development key
apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
```

### Endpoints

#### List Projects

```bash
GET /rest/v1/projects
```

Returns all indexed ChatGPT projects.

```bash
curl 'http://127.0.0.1:54321/rest/v1/projects?select=id,title&order=title.asc' \
  -H "apikey: <anon-key>"
```

#### Touch a Project (Float to Top)

```bash
POST /rest/v1/touch_queue
```

Queues a project to be "touched" — floats it to the top of the ChatGPT sidebar. Processed within 5-10 seconds by the indexer's watch mode.

```bash
curl -X POST 'http://127.0.0.1:54321/rest/v1/touch_queue' \
  -H "apikey: <anon-key>" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"project_id": "g-p-abc123"}'
```

**Response:**
```json
{
  "id": 1,
  "project_id": "g-p-abc123",
  "status": "pending",
  "created_at": "2026-01-15T16:30:00Z"
}
```

**Status Values:**
- `pending` — Waiting to be processed
- `processing` — Currently being touched
- `completed` — Successfully floated to top
- `failed` — Touch operation failed

#### Check Touch Status

```bash
GET /rest/v1/touch_queue?project_id=eq.{id}&order=created_at.desc&limit=1
```

```bash
curl 'http://127.0.0.1:54321/rest/v1/touch_queue?project_id=eq.g-p-abc123&order=created_at.desc&limit=1' \
  -H "apikey: <anon-key>"
```

#### Get Index Metadata

```bash
GET /functions/v1/meta
```

```bash
curl 'http://127.0.0.1:54321/functions/v1/meta'
```

**Response:**
```json
{
  "name": "ChatGPT Project Index",
  "version": "1.0.0",
  "project_count": 473
}
```

### Raycast Integration

For Raycast extensions, configure the API URL in extension settings:

```
http://127.0.0.1:54321/rest/v1/projects
```

To add a "Touch" action:

```typescript
async function touchProject(projectId: string) {
  await fetch('http://127.0.0.1:54321/rest/v1/touch_queue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': '<anon-key>',
    },
    body: JSON.stringify({ project_id: projectId }),
  });
}
```

### Tables

| Table | Description |
|-------|-------------|
| `projects` | Project records with id, title, timestamps |
| `runs` | Enumeration run history and status |
| `touch_queue` | Queue for touch operations from API |

### Mobile/LAN Access

To access from another device on your network, use your machine's LAN IP:

```bash
# Get your LAN IP (macOS)
ipconfig getifaddr en0
```

Then configure the mobile app with:
```
http://<your-lan-ip>:54321/rest/v1
```

---

## Performance

Scan time scales linearly with project count:

| Projects | Estimated Time |
|----------|----------------|
| 100 | ~1 min |
| 250 | ~2.5 min |
| 500 | ~5.5 min |
| 1000 | ~11 min |

The default 15-minute interval provides comfortable margin for most users.

---

## Architecture

```
src/
├── index.ts              # CLI entry point
├── auth/                 # Authentication management
│   ├── detector.ts       # Auth state detection
│   ├── recovery.ts       # Auth recovery flow
│   └── storage-state.ts  # Portable session export/import
├── browser/              # Browser lifecycle
│   ├── manager.ts        # Launch and navigation
│   └── context.ts        # Persistent context management
├── scraper/              # Core enumeration logic
│   ├── orchestrator.ts   # Main workflow + watch mode
│   ├── navigator.ts      # Sidebar navigation
│   ├── scroller.ts       # Infinite scroll handling
│   └── extractor.ts      # Project data extraction
├── storage/              # Data persistence
│   ├── writer.ts         # Local JSON storage
│   └── supabase.ts       # Optional cloud storage
├── utils/                # Utilities
│   └── logger.ts         # Structured logging
└── config/
    └── constants.ts      # Configuration values
```

---

## Development

```bash
# Run in development mode
npm run dev -- run --headful

# Type check
npm run typecheck

# Build
npm run build
```

---

## License

[ISC](https://opensource.org/licenses/ISC)
