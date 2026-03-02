# @earno/plugin-berachain

Berachain-specific commands for `earno`.

## Enable

This plugin is **opt-in**. Add it to your earno config:

```sh
earno plugin add @earno/plugin-berachain
```

## Commands

```sh
earno bera deposit --help
earno bera balance --help
earno bera vaults --help
earno bera withdraw --help
earno bera withdraw-claim --help
earno bera claim --help
```

## Examples

### Balance

```sh
earno bera balance --address 0xYourAddress
```

### Deposit

Deposit native BERA into sWBERA:

```sh
earno bera deposit 1.0 --into swbera --receiver 0xYourAddress
```

Deposit HONEY into Bend Re7 Honey Vault (auto-stakes vault shares to earn BGT):

```sh
earno bera deposit 10 --into honey --receiver 0xYourAddress
```

Swap/bridge from another chain via Relay, then deposit + stake on Berachain (supported origin chains: ethereum, optimism, arbitrum, base, berachain):

```sh
earno bera deposit 10 --into honey --receiver 0xYourAddress --sender 0xYourAddress \
  --originChain base --from usdc.e --maxInput 50 --slippageBps 50
```

### Withdraw

sWBERA delayed withdrawal (creates a 7-day cooldown request):

```sh
earno bera withdraw 1.0 --from swbera --mode delayed --receiver 0xYourAddress
```

After the cooldown, claim the request:

```sh
earno bera withdraw-claim 123 --sender 0xYourAddress
```

sWBERA instant withdrawal (market sell via Relay; slippage possible):

```sh
earno bera withdraw 1.0 --from swbera --mode instant --to bera --slippageBps 100 --receiver 0xYourAddress
```

Withdraw HONEY from Bend Re7 Honey Vault (unstakes shares first if needed):

```sh
earno bera withdraw 10 --from honey --receiver 0xYourAddress --sender 0xYourAddress
```

### Claim BGT

Claim pending BGT:

```sh
earno bera claim --sender 0xYourAddress
```

Claim and redeem BGT → BERA:

```sh
earno bera claim --sender 0xYourAddress --redeem --receiver 0xYourAddress
```

### Reward Vaults

List top Reward Vaults (API; whitelisted by default):

```sh
earno bera vaults --first 20 --orderBy apr
```

Filter by category:

```sh
earno bera vaults --category defi/amm --first 20
```
