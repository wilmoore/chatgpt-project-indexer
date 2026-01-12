# 010. Vitest for Test Framework

Date: 2026-01-11

## Status

Accepted

## Context

The project needed a test framework to add unit and integration test coverage. The codebase uses:
- ESM modules (`"type": "module"` in package.json)
- TypeScript with modern syntax
- Node.js runtime

Common test frameworks include Jest, Mocha, and Vitest. Jest has historically had issues with ESM support requiring complex configuration or transformers.

## Decision

We chose Vitest as the test framework with @vitest/coverage-v8 for code coverage.

Configuration is minimal (`vitest.config.ts`):
- Native ESM support without transformers
- TypeScript support out of the box
- Node environment for testing CLI/storage modules
- V8 coverage provider for accurate coverage reports

## Consequences

**Positive:**
- Zero-config ESM support - no babel or transformers needed
- Fast test execution with native ESM
- Familiar Jest-like API reduces learning curve
- Built-in TypeScript support
- Hot module reloading in watch mode

**Negative:**
- Newer tool with smaller ecosystem than Jest
- Some Jest plugins may not have Vitest equivalents
- Type definition warnings in strict TypeScript configs (Vite internal types)

## Alternatives Considered

### Jest
- Mature ecosystem with extensive plugin support
- Requires additional configuration for ESM (`experimental-vm-modules`)
- Transform overhead for TypeScript
- Rejected: ESM support is experimental and fragile

### Mocha + Chai
- Flexible and unopinionated
- Requires manual setup for TypeScript, coverage, assertions
- Rejected: Too much configuration overhead

## Related

- Planning: `.plan/.done/fix-tests-and-security-audit/`
- Test files: `tests/unit/`, `tests/integration/`
