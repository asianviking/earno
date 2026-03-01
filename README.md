# earno

EVM intent CLI + web executor for transaction bundles (any EVM chain; Berachain default).

earno generates a portable request object (`calls`, optional `intent` + constraints) that you can:
- execute in the browser executor (Porto or injected wallets)
- or run manually (earno prints `cast` commands when possible)

Built with [incur](https://github.com/wevm/incur) + [viem](https://github.com/wevm/viem).

## Install

```sh
# Install globally
npm i -g @earno/cli

# Or clone and link
git clone https://github.com/asianviking/earno.git
cd earno
pnpm install
pnpm build
pnpm --filter @earno/cli link --global
```

After either method, `earno` is available everywhere:

```sh
earno --help
```

## Quickstart (web executor)

Generate a link from the CLI and sign/execute in the browser (defaults to `https://earno.sh`):

```sh
earno deposit 1.5 --receiver 0xYourAddress --web --wait
```

To run the executor UI locally instead:

```sh
pnpm dev:web
EARNO_WEB_URL=http://localhost:5173 earno deposit 1.0 --receiver 0xYourAddress --web
```

To point the CLI at a deployed executor (e.g. Vercel):

```sh
EARNO_WEB_URL=https://your-app.vercel.app earno deposit 1.0 --receiver 0xYourAddress --web
```

## Built-in strategies (Berachain)

These commands are currently **Berachain mainnet only** and target the sWBERA vault.

### Deposit BERA → sWBERA

```sh
earno deposit 1.5 --receiver 0xYourAddress
```

Outputs `cast send` commands for the underlying steps:
1. **Wrap** BERA → WBERA
2. **Approve** WBERA for sWBERA (skipped if already approved)
3. **Deposit** WBERA → sWBERA

### Check sWBERA balance

```sh
earno balance --address 0xYourAddress
```

Queries sWBERA on-chain and shows:
- Your sWBERA shares
- Underlying BERA value
- Current exchange rate
- Total vault assets

### Withdraw sWBERA → BERA

```sh
earno withdraw 1.0 --receiver 0xYourAddress
```

Outputs `cast send` commands to:
1. **Redeem** sWBERA → WBERA
2. **Unwrap** WBERA → native BERA

## Plugins

earno supports strategy plugins as nested command groups (e.g. `earno bend deposit ...`).

```sh
# Add a plugin spec to your local config (does not install it)
earno plugin add @ayvee/bend

# Or load plugins ad-hoc for a single run
EARNO_PLUGINS=@earno/plugin-example earno example send 0.01 --to 0xYourAddress --web
```

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
| `EARNO_CHAIN` | Default chain key/chainId | `berachain` |
| `EARNO_RPC` | Berachain RPC URL | `https://rpc.berachain.com/` |
| `EARNO_WEB_URL` | Base URL for `--web` executor links | `https://earno.sh` |
| `EARNO_PLUGINS` | Comma-separated plugin import specs | — |
| `WALLET_PRIVATE_KEY` | Used in `cast send` commands (never stored) | — |

## Contracts

Built-in Berachain sWBERA strategy contracts:

| Contract | Address |
|----------|---------|
| sWBERA | `0x118D2cEeE9785eaf70C15Cd74CD84c9f8c3EeC9a` |
| WBERA | `0x6969696969696969696969696969696969696969` |

Chain: Berachain mainnet (chain ID `80094`)

## License

MIT
