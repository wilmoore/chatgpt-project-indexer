# 004. Multi-Backend Storage Architecture

Date: 2025-12-30

## Status

Accepted

## Context

The ChatGPT Project Indexer initially wrote project data to a local JSON file. As the tool evolved, there was a need to sync data to cloud storage (Supabase) for:

1. Persistence across machines
2. Querying and analysis capabilities
3. Data redundancy and backup

However, local file storage remained valuable for:
- Offline operation
- Quick development iteration
- Fallback if cloud is unavailable

## Decision

Implement a multi-backend storage architecture with a common `StorageBackend` interface that allows multiple storage backends to operate simultaneously.

Key design elements:
- `StorageBackend` interface defines common operations: `initialize()`, `addProject()`, `flush()`, `close()`
- Factory function `createStorageBackends()` instantiates configured backends
- Orchestrator writes to all backends via helper function
- Each backend manages its own buffering and persistence

```typescript
interface StorageBackend {
  readonly name: string;
  initialize(): Promise<void>;
  addProject(project: ProjectRecord): void;
  flush(): Promise<void>;
  close(): Promise<void>;
  getCount(): number;
  getProjects(): ProjectRecord[];
}
```

## Consequences

### Positive

- Data redundancy: local JSON + Supabase ensures no single point of failure
- Graceful degradation: if Supabase is unavailable, local storage still works
- Easy to add new backends (e.g., SQLite, PostgreSQL, S3)
- Each backend can optimize independently (buffering, batching)

### Negative

- Increased complexity with multiple storage paths
- Need to handle consistency if backends diverge
- More code to maintain

## Alternatives Considered

### 1. Supabase-only storage

Rejected because:
- Requires internet connectivity
- Single point of failure
- Slower development iteration

### 2. Sequential write (local first, then sync)

Rejected because:
- More complex sync logic
- Potential for inconsistency
- Write-through is simpler for this use case

## Related

- Planning: `.plan/.done/fix-project-title-extraction-from-popup/`
- Files: `src/storage/index.ts`, `src/storage/types.ts`
