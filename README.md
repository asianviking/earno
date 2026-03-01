# earno

EVM intent CLI + web executor for transaction bundles (any EVM chain; Ethereum default).

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
earno send 0.01 --to 0xYourAddress --wait
```

Override the executor base URL for a single run:

```sh
earno send 0.01 --to 0xYourAddress --web-url http://localhost:5173
```

To run the executor UI locally instead:

```sh
pnpm dev:web
EARNO_WEB_URL=http://localhost:5173 earno send 0.01 --to 0xYourAddress
```

To point the CLI at a deployed executor (e.g. Vercel):

```sh
EARNO_WEB_URL=https://your-app.vercel.app earno send 0.01 --to 0xYourAddress
```

## Default commands

### Send

```sh
earno send 0.01 --to 0xYourAddress
```

### Swap (Relay)

```sh
earno swap 0.01 --from native --to USDC --chain base --toChain base --sender 0xYourAddress
```

## Plugins

earno supports strategy plugins as nested command groups (e.g. `earno bera deposit ...`).

### Berachain (sWBERA)

Berachain commands live in an **opt-in** plugin:

```sh
# Enable (writes to your local config; plugin is already bundled with @earno/cli)
earno plugin add @earno/plugin-berachain

earno bera deposit 1.0 --receiver 0xYourAddress
earno bera balance --address 0xYourAddress
earno bera withdraw 1.0 --receiver 0xYourAddress
```

### Other plugins

```sh
# Add a plugin spec to your local config (does not install it)
earno plugin add @ayvee/bend

# Or load plugins ad-hoc for a single run
EARNO_PLUGINS=@earno/plugin-example earno example send 0.01 --to 0xYourAddress
```

## Output formats

Default output is TOON (token-efficient for agents). Use flags for alternatives:

```sh
earno send 0.01 --to 0x... --json          # JSON
earno send 0.01 --to 0x... --format yaml   # YAML
earno send 0.01 --to 0x... --format md     # Markdown
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
| `EARNO_CHAIN` | Default chain key/chainId | `ethereum` |
| `EARNO_RPC` | RPC URL override | — |
| `EARNO_WEB_URL` | Base URL for executor links (`executorUrl` / `portoLink`) | `https://earno.sh` |
| `EARNO_PLUGINS` | Comma-separated plugin import specs | — |
| `WALLET_PRIVATE_KEY` | Used in `cast send` commands (never stored) | — |

## License

MIT
