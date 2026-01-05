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
