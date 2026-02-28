import {
  EARNO_DEFAULT_CHAIN,
  findEarnoChainById,
  findEarnoChainByKey,
  type EarnoChain,
} from '@earno/core/chains'

export type ResolvedCliChain = {
  chain: EarnoChain
  rpcUrl: string
}

function parseChainSelector(selector: string): { kind: 'id'; id: number } | { kind: 'key'; key: string } {
  const trimmed = selector.trim()
  if (!trimmed) return { kind: 'key', key: '' }

  const asNumber = Number(trimmed)
  if (Number.isFinite(asNumber) && Number.isInteger(asNumber) && asNumber > 0) {
    return { kind: 'id', id: asNumber }
  }
  return { kind: 'key', key: trimmed }
}

export function resolveCliChain(args: {
  chain?: string
  rpcUrl?: string
  env?: {
    EARNO_CHAIN?: string
    BEARN_CHAIN?: string
    EARNO_RPC?: string
    BEARN_RPC?: string
  }
}): ResolvedCliChain {
  const envChain = args.env?.EARNO_CHAIN ?? args.env?.BEARN_CHAIN
  const selector = args.chain ?? envChain

  let chain: EarnoChain | undefined
  if (!selector) {
    chain = EARNO_DEFAULT_CHAIN
  } else {
    const parsed = parseChainSelector(selector)
    if (parsed.kind === 'id') {
      chain =
        findEarnoChainById(parsed.id) ??
        ({
          id: parsed.id,
          key: `chain-${parsed.id}`,
          name: `Chain ${parsed.id}`,
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [],
        } satisfies EarnoChain)
    } else {
      chain = findEarnoChainByKey(parsed.key)
      if (!chain) throw new Error(`Unknown chain '${parsed.key}'`)
    }
  }

  const rpcUrl =
    args.rpcUrl ??
    args.env?.EARNO_RPC ??
    args.env?.BEARN_RPC ??
    chain.rpcUrls[0]

  if (!rpcUrl) {
    throw new Error(
      `Missing RPC URL for chainId ${chain.id}. Provide --rpc or set $EARNO_RPC.`,
    )
  }

  return { chain, rpcUrl }
}

