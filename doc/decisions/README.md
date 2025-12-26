# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) documenting significant technical decisions.

## What is an ADR?

An ADR captures the context, decision, and consequences of an architecturally significant choice.

## Format

We use the [Michael Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

## Naming Convention

- Filename: `NNN-kebab-case-title.md` (e.g., `001-use-localStorage-for-tracking.md`)
- NNN = zero-padded sequence number (001, 002, 003...)
- Title in heading must match: `# NNN. Title` (e.g., `# 001. Use localStorage for Tracking`)

## Index

- [001. Use Playwright for Browser Automation](001-use-playwright-for-browser-automation.md)
- [002. Layered Architecture with Separation of Concerns](002-layered-architecture-with-separation-of-concerns.md)
- [003. JSON Lines Format for Output Storage](003-json-lines-format-for-output-storage.md)
