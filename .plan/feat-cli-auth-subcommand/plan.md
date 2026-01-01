# Implementation Plan: CLI Auth Subcommand

## Overview

Add `auth` CLI commands for portable session management, enabling headless/remote server operation.

## Commands

| Command | Description |
|---------|-------------|
| `chatgpt-indexer auth login` | Opens browser, waits for login, exports session + populates persistent context |
| `chatgpt-indexer auth export` | Exports from existing persistent session (headless) |
| `chatgpt-indexer auth import <file>` | Imports session file, validates, warns on insecure permissions |
| `chatgpt-indexer auth status` | Checks current session validity |

## Files to Modify

1. **`src/auth/storage-state.ts`** - Update `loginAndExport()` to also populate persistent context
2. **`src/browser/context.ts`** - Check for imported state file on launch
3. **`src/config/constants.ts`** - Add auth file path constants
4. **`src/index.ts`** - Add auth command group with subcommands

## Implementation Steps

### Step 1: Update Constants
Add to `src/config/constants.ts`:
- `AUTH_STATE_FILE`: Default path for exported auth state (`~/.chatgpt-indexer/auth-state.json`)
- `IMPORTED_STATE_FILE`: Path for imported state (`~/.chatgpt-indexer/imported-state.json`)

### Step 2: Update storage-state.ts
- Modify `loginAndExport()` to:
  1. Open browser, wait for login
  2. Export to portable JSON file
  3. Copy cookies to persistent context directory
- Add `checkFilePermissions()` helper for security warnings
- Add permission check to `importToPersistent()`

### Step 3: Update browser/context.ts
- Modify `createPersistentContext()` to:
  1. Check if `imported-state.json` exists
  2. If so, apply cookies from imported state to the context
  3. Delete the imported file after applying (one-time use)

### Step 4: Add CLI Commands
Add to `src/index.ts`:
```typescript
const auth = program.command('auth').description('Manage authentication');

auth.command('login')
  .description('Authenticate interactively (opens browser)')
  .option('-o, --output <path>', 'Output file path')
  .action(...)

auth.command('export')
  .description('Export current session to file')
  .option('-o, --output <path>', 'Output file path')
  .action(...)

auth.command('import')
  .description('Import session from file')
  .argument('<file>', 'Path to auth state file')
  .action(...)

auth.command('status')
  .description('Check authentication status')
  .action(...)
```

### Step 5: Update Run Command
- Add pre-flight auth check before enumeration
- If not authenticated, suggest running `auth login`

## Security Considerations

1. Auth state files contain session tokens - set `chmod 600`
2. Warn on import if file has insecure permissions (world/group readable)
3. Imported state file is deleted after being applied to persistent context

## Testing

1. `auth login` - Opens browser, user logs in, file created
2. `auth export` - Exports from existing session
3. `auth import` - Imports and validates session
4. `auth status` - Shows current auth state
5. `run` - Shows pre-flight auth check message

## Success Criteria

- All auth commands work as documented
- No TypeScript errors
- Permissions are set correctly on auth files
- Pre-flight check prevents unauthenticated runs
