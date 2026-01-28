# 017. Config.toml for Edge Function JWT Bypass

Date: 2026-01-27

## Status

Accepted

## Context

Edge functions began returning HTTP 401 Unauthorized after a redeployment. The Supabase gateway enforces JWT verification by default, rejecting requests without an `Authorization` header before the function code executes.

The Raycast extension (and any future client) calls these endpoints with no auth headers -- only `Accept: application/json`. This is by design: the edge functions are public read-only endpoints that use the service role key internally for database access (ADR-008).

Two approaches exist to disable JWT verification:
1. **CLI flag** (`--no-verify-jwt`) -- passed at deploy time, must be remembered every deployment
2. **Config file** (`config.toml`) -- declarative, version-controlled, applied automatically

## Decision

Use `supabase/config.toml` with per-function `verify_jwt = false` declarations:

```toml
[functions.projects]
verify_jwt = false

[functions.meta]
verify_jwt = false

[functions.docs]
verify_jwt = false
```

This approach was chosen over CLI flags because:
- The setting is version-controlled and self-documenting
- It cannot be accidentally omitted during deployment
- It applies consistently across local development and CI/CD
- New team members don't need to know about special flags

## Consequences

### Positive

- **Regression-proof** -- the setting persists in the repository, not in deployment scripts
- **Self-documenting** -- the config file makes the public nature of these endpoints explicit
- **Consistent** -- applies to both `supabase start` (local) and `supabase functions deploy` (remote)

### Negative

- **New file to maintain** -- `config.toml` must be kept in sync with edge function additions
- **Restart required** -- local Supabase must be restarted to pick up config changes

## Alternatives Considered

### CLI deploy flag (`--no-verify-jwt`)

Rejected because:
- Must be remembered on every deployment
- Not version-controlled (lives in deploy scripts or developer memory)
- Previous regression was caused by exactly this being forgotten

### Adding Authorization headers to clients

Rejected because:
- Violates ADR-008 design (service role key not exposed to clients)
- Increases client complexity for no security benefit (read-only public data)
- Would require distributing keys to Raycast extension users

## Related

- [ADR-008: Supabase Edge Functions for API Access](008-supabase-edge-functions-for-api-access.md)
- Planning: `.plan/.done/fix-edge-function-401-unauthorized/`
