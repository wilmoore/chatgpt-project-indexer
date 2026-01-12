# 011. Shared CORS Utility for Edge Functions

Date: 2026-01-11

## Status

Accepted

## Context

Supabase Edge Functions required CORS headers for browser access. The initial implementation used hardcoded `Access-Control-Allow-Origin: "*"` in each function, which:
- Presents a security concern for production deployments
- Violates DRY principle with duplicate CORS configuration
- Makes origin configuration inflexible

## Decision

We created a shared CORS utility module at `supabase/functions/_shared/cors.ts` that:
- Reads allowed origin from `ALLOWED_ORIGIN` environment variable
- Defaults to `http://localhost:3000` for local development
- Provides `getCorsHeaders()` and `corsPreflightResponse()` helpers
- Is imported by all edge functions

Edge functions now use:
```typescript
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
```

## Consequences

**Positive:**
- Single source of truth for CORS configuration
- Environment-configurable for different deployments
- No code changes needed to update CORS policy
- Consistent CORS behavior across all endpoints
- Explicit default prevents accidental wildcard in production

**Negative:**
- Requires setting environment variable in Supabase dashboard for production
- Additional import in each function (minor overhead)

## Alternatives Considered

### Keep hardcoded CORS per function
- Simple and self-contained
- Rejected: Security risk, maintenance burden

### Supabase Gateway-level CORS
- Would handle CORS at infrastructure level
- Rejected: Not available for Edge Functions, less control

### Multiple allowed origins
- Could support array of origins
- Rejected: YAGNI - single origin sufficient for current use case

## Related

- Planning: `.plan/.done/fix-tests-and-security-audit/`
- Files: `supabase/functions/_shared/cors.ts`
