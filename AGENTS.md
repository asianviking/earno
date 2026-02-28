# earno — agent notes

## Repo layout

- `apps/cli` — `earno` CLI (incur + viem)
- `apps/web` — web executor (Vite + React + Porto / injected wallets)
- `packages/core` — shared request schema + transport (`EarnoWebRequestV1`, compression, chain defaults)
- `packages/plugin-example` — example strategy plugin (`@earno/plugin-example`)

## Common commands

```sh
pnpm install
pnpm build
pnpm test

pnpm dev:web        # run executor UI
pnpm --filter @earno/cli dev
pnpm --filter @earno/cli test
```

## Conventions

- Keep the **trust boundary** clear: strategy/plugin code runs in the CLI; the web executor should execute only `calls` from the request.
- Prefer `pnpm --filter <pkg> ...` when building/testing a single package.
- Don’t commit secrets (`.env` is ignored). Don’t check in `.vercel/` (ignored).

