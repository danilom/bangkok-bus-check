# Project Guidelines

You are working as a senior TypeScript developer. Write production-quality code by default — not "quick example" quality. These guidelines apply to every file you touch unless explicitly told otherwise.

## TypeScript

- Use strict TypeScript. Avoid `any`; use `unknown` and narrow properly.
- Prefer `type` for unions/intersections, `interface` for object shapes that may be extended.
- Use `satisfies` where appropriate instead of casting.
- Use `const` assertions and discriminated unions over loose string types.
- Avoid non-null assertions (`!`). Handle nullability explicitly.
- Use modern ES features: optional chaining, nullish coalescing, `Array.at()`, `Object.hasOwn()`, etc.
- Prefer `structuredClone` over manual deep copies.

## Code Structure

- Keep functions short and single-purpose. If a function needs a comment explaining "what it does," it should probably be split.
- No functions longer than ~40 lines without good reason.
- Name things clearly. Avoid abbreviations unless they're universally understood (`i` in a loop is fine; `rstTkn` is not).
- Colocate related logic. Don't scatter a feature across many unrelated files.
- Prefer flat over nested — early returns over deep conditionals.

## Error Handling

- Always handle errors explicitly. No silent `catch` blocks.
- Use typed error classes or discriminated result types (`{ ok: true, value } | { ok: false, error }`) for operations that can fail predictably.
- Don't swallow exceptions. If you catch, either recover meaningfully or rethrow with context.
- Validate external inputs (API responses, env vars, user input) at the boundary before they enter the system. Don't trust inferred types from `JSON.parse`.

## Comments

- Comment *why*, not *what*. Code should explain itself; comments explain intent, tradeoffs, and surprises.
- Document non-obvious decisions: "Using X instead of Y because of Z."
- JSDoc on public API functions, especially parameters that aren't self-evident from the types.
- Don't comment out dead code — delete it. Git remembers.

## Async

- Prefer `async/await` over raw promise chains.
- Always `await` or explicitly `void` promises — never fire-and-forget silently.
- Handle `Promise.allSettled` vs `Promise.all` deliberately (fail-fast vs. partial results).

## Dependencies & Imports

- Don't introduce dependencies for things easily done natively.
- Prefer named exports over default exports.
- Group imports: external packages, then internal modules, then relative imports.

## Configuration & Secrets

- Never hardcode secrets or environment-specific values.
- Read config from environment variables; validate them at startup with a schema (e.g. `zod`).
- Project-level personal settings (e.g. `settings.local.json`, `.env.local`) are never committed.

## Testing

Not blanket coverage — tests are for **logic that fails silently**. 
What does: code whose wrong answer still looks like an answer.

- Run with `npm test` (esbuild → `node --test`; no test framework dependency).
- Test names describe behaviour, not implementation: `"returns empty array when
  no results found"`, not `"test getItems"`.

## Git

- Commits should be atomic. Keep the descriptions brief.
- Commit each finished change right away, unprompted; never let changes pile up uncommitted.
- Preserve a file's line endings (the repo is mixed CRLF/LF); a wholesale ending change makes every line a diff.
- Don't commit commented-out code, debug logs, or TODO comments without a tracking issue.

## Project notes

- README.md describes the data pipeline and the site layout (two apps, one build).
- BOARD.md holds the working notes for the Bangkok Bus Board experiment (`/board/`): decisions, status, next steps. Update it when you change course there.
- TODO-check.md and TODO-board.md are the two apps' backlogs (the data pipeline's items are in TODO-check.md).
