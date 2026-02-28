# earno — modular execution plan

Goal: let anyone author **strategy plugins** (build call bundles) and **wallet plugins** (sign/send), targeting **any EVM chain** (Berachain default), while keeping the trust boundary clear: the web executor can execute a request **without running third‑party strategy code**.

## Principles

- **Modular by default**: strategy, wallet, chain, transport, UI can all be swapped.
- **Single contract between CLI ↔ web**: a versioned, portable request object.
- **Trust boundary**: strategy code runs in the CLI; web executes only `calls`.
- **Chain-agnostic core**: chainId + rpc + metadata, Berachain as default.
- **Progressive enhancement**: richer UIs/plugins are optional; baseline works from `calls`.

## Monorepo structure (target)

- `apps/web` — Vite web executor (wallet selection, confirmations, send).
- `apps/cli` — CLI that builds requests and prints URLs.
- `packages/core` — shared core types + request transport + chain defaults.
- Future extraction to more `packages/*` as the plugin ecosystem grows:
  - `@earno/plugin-kit` (plugin types, manifests, test helpers)
  - `@earno/chains` (richer chain registry + address books)

## The “Action Request” contract

Minimum executable payload:

- `v`: schema version
- `title`: user-facing label
- `chainId`: EVM chain id
- `rpcUrl?`: optional override (executor should display it)
- `sender?`: expected sender (executor should enforce)
- `calls`: array of `{ label, to, data, valueWei? }`

Planned extensions (optional, forward compatible):

- `intent`: `{ plugin, action, params, display }` for provenance + UX
- `constraints`: `{ deadline, slippageBps, allowlistContracts }`
- `execution`: `{ mode: "single"|"batch", batchHint?: "eip7702" }`
- `callback`: `{ url, state }` to close the CLI loop (tx hash back to CLI)

## URI transport (solves “too long” links)

Default transport:

- encode request JSON → gzip → base64url
- embed in URL fragment: `#r=<payload>`

Reasons:

- fragment avoids server logs and query stripping
- gzip reduces size significantly for calldata-heavy requests

Backwards compatibility:

- decoder accepts legacy base64url(JSON) payloads
- web accepts `?r=` and `#...?r=` as fallback inputs

Future: optional “shortlink transport” as a plugin (store payload, return short id).

## Plugins (swappable modules)

### Strategy plugins (CLI-side)

Purpose: turn user params into a request `{ chainId, calls, intent, constraints }`.

Properties:

- run locally in CLI only
- may depend on `viem` for encoding
- output is pure data (`calls`) so the web doesn’t need the plugin code

Locator strings (for humans):

- `@scope/name` (npm) OR `github:owner/repo` / `owner/repo`
- recorded in `intent.plugin` for provenance (“who built this request?”)

### Wallet plugins (web-side)

Purpose: connect + send calls using a wallet provider.

Baseline interface:

- `connect()` → account
- `send(calls, chain)`:
  - try `wallet_sendCalls` (EIP‑5792 / EIP‑7702 batching)
  - fallback to sequential `eth_sendTransaction`

Ship with:

- `porto` plugin (default)
- `injected` plugin (MetaMask / any EIP‑1193 provider)

### Chain adapters

Purpose: metadata + defaults for known chains:

- `name`, `nativeCurrency`, default `rpcUrls`
- address books for strategy-specific contracts (e.g. WBERA, sWBERA)

Executor behavior:

- if request omits `rpcUrl`, use chain default if known, else prompt user

### Web UI plugins (optional)

Purpose: richer per-strategy forms / previews.

Rule:

- baseline UI must still work from `{ title, calls }` only

## Execution flow (closed loop)

1. CLI builds request and prints an executor URL.
2. User opens the URL, picks a wallet plugin, reviews, executes.
3. Web returns tx hash + status.
4. Optional callback: web redirects to `callback.url?...` to notify CLI (`--wait` mode).

## Milestones / PR breakdown

1. Shared request transport: gzip+fragment, legacy decode, tests.
2. Web wallet adapters: porto + injected, batched send + fallback, better confirmations.
3. Chain registry + CLI `--chain` plumbing; Berachain default; display in executor.
4. Strategy plugin interface + one example external plugin repo (dogfood).
5. Callback loop (`--wait`) + local status display in CLI.
6. Security hardening: allowlists, contract warnings, optional preflight simulation.
