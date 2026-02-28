# earno

Berachain yield CLI — earn from your terminal.

Builds transaction calldata for Berachain yield strategies and outputs ready-to-paste `cast` commands. Works for humans and AI agents.

Built with [incur](https://github.com/wevm/incur) + [viem](https://github.com/wevm/viem).

## Install

```sh
# Install globally
npm i -g earno

# Or clone and link
git clone https://github.com/asianviking/earno.git
cd earno
pnpm install
pnpm build
pnpm --filter earno link --global
```

After either method, `earno` is available everywhere:

```sh
earno --help
```

### Deposit BERA into sWBERA

```sh
earno deposit 1.5 --receiver 0xYourAddress
```

Outputs three `cast send` commands to execute in order:
1. **Wrap** BERA → WBERA
2. **Approve** WBERA for sWBERA
3. **Deposit** WBERA → sWBERA

### Sign + execute (browser)

Start the executor UI:

```sh
pnpm dev:web
```

Generate a web link from the CLI:

```sh
earno deposit 1.5 --receiver 0xYourAddress --web
```

Open the returned `executorUrl` (or legacy `portoLink`), pick a wallet (Porto or injected), and execute.

### Deploy the web executor (Vercel)

1. Import the repo in Vercel and set **Root Directory** to `apps/web`.
2. Deploy (the repo includes `apps/web/vercel.json`).
3. Point the CLI at your deployed URL:

```sh
EARNO_WEB_URL=https://your-app.vercel.app earno deposit 1.0 --receiver 0xYourAddress --web
```

### Check balance

```sh
earno balance --address 0xYourAddress
```

Queries sWBERA on-chain and shows:
- Your sWBERA shares
- Underlying BERA value
- Current exchange rate
- Total vault assets

### Withdraw sWBERA back to BERA

```sh
earno withdraw 1.0 --receiver 0xYourAddress
```

Outputs `cast send` commands to:
1. **Redeem** sWBERA → WBERA
2. **Unwrap** WBERA → native BERA

## Output formats

Default output is TOON (token-efficient for agents). Use flags for alternatives:

```sh
earno deposit 1.0 --receiver 0x... --json      # JSON
earno deposit 1.0 --receiver 0x... --format yaml # YAML
earno deposit 1.0 --receiver 0x... --format md   # Markdown
```

## Agent integration

earno is agent-native via incur. Any AI agent can discover and use it:

```sh
# Register as an MCP server (Claude Code, Cursor, etc.)
earno mcp add

# Sync skill files to your agent
earno skills add

# Print LLM-readable command manifest
earno --llms
```

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `EARNO_RPC` | Berachain RPC URL | `https://rpc.berachain.com/` |
| `EARNO_WEB_URL` | Base URL for `--web` executor links | `http://localhost:5173` |
| `BEARN_RPC` | Legacy alias for `EARNO_RPC` | — |
| `BEARN_WEB_URL` | Legacy alias for `EARNO_WEB_URL` | — |
| `WALLET_PRIVATE_KEY` | Used in `cast send` commands (never stored) | — |

## Contracts

| Contract | Address |
|----------|---------|
| sWBERA | `0x118D2cEeE9785eaf70C15Cd74CD84c9f8c3EeC9a` |
| WBERA | `0x6969696969696969696969696969696969696969` |

Chain: Berachain mainnet (chain ID `80094`)

## License

MIT
