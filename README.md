# bearn

Berachain yield CLI — earn from your terminal.

Builds transaction calldata for Berachain yield strategies and outputs ready-to-paste `cast` commands. Works for humans and AI agents.

Built with [incur](https://github.com/wevm/incur) + [viem](https://github.com/wevm/viem).

## Install

```sh
# Install globally
npm i -g bearn

# Or clone and link
git clone https://github.com/berachain-skunkworks/bearn.git
cd bearn
pnpm install
pnpm build
pnpm link --global
```

After either method, `bearn` is available everywhere:

```sh
bearn --help
```

### Deposit BERA into sWBERA

```sh
bearn deposit 1.5 --receiver 0xYourAddress
```

Outputs three `cast send` commands to execute in order:
1. **Wrap** BERA → WBERA
2. **Approve** WBERA for sWBERA
3. **Deposit** WBERA → sWBERA

### Check balance

```sh
bearn balance --address 0xYourAddress
```

Queries sWBERA on-chain and shows:
- Your sWBERA shares
- Underlying BERA value
- Current exchange rate
- Total vault assets

### Withdraw sWBERA back to BERA

```sh
bearn withdraw 1.0 --receiver 0xYourAddress
```

Outputs `cast send` commands to:
1. **Redeem** sWBERA → WBERA
2. **Unwrap** WBERA → native BERA

## Output formats

Default output is TOON (token-efficient for agents). Use flags for alternatives:

```sh
bearn deposit 1.0 --receiver 0x... --json      # JSON
bearn deposit 1.0 --receiver 0x... --format yaml # YAML
bearn deposit 1.0 --receiver 0x... --format md   # Markdown
```

## Agent integration

bearn is agent-native via incur. Any AI agent can discover and use it:

```sh
# Register as an MCP server (Claude Code, Cursor, etc.)
bearn mcp add

# Sync skill files to your agent
bearn skills add

# Print LLM-readable command manifest
bearn --llms
```

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BEARN_RPC` | Berachain RPC URL | `https://rpc.berachain.com/` |
| `WALLET_PRIVATE_KEY` | Used in `cast send` commands (never stored) | — |

## Contracts

| Contract | Address |
|----------|---------|
| sWBERA | `0x118D2cEeE9785eaf70C15Cd74CD84c9f8c3EeC9a` |
| WBERA | `0x6969696969696969696969696969696969696969` |

Chain: Berachain mainnet (chain ID `80094`)

## License

MIT
