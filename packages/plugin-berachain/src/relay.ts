import { createPublicClient, erc20Abi, http } from 'viem'
import { findEarnoChainById, findEarnoChainByKey } from '@earno/core/chains'
import { NATIVE_ADDRESS } from './contracts.js'

export const RELAY_BASE_URL = 'https://api.relay.link' as const

export type RelayCurrency = {
  chainId: number
  address: `0x${string}`
  symbol?: string
  name?: string
  decimals?: number
  metadata?: {
    verified?: boolean
    isNative?: boolean
  }
}

export type RelayTxData = {
  to: `0x${string}`
  data: `0x${string}`
  value: string
  chainId: number
}

export type RelayStep = {
  id: string
  description?: string
  kind: string
  requestId?: `0x${string}`
  action?: string
  items: Array<{
    data: unknown
    check?: unknown
  }>
}

export type RelaySwapResponse = {
  steps: RelayStep[]
  fees?: unknown
  details?: unknown
}

export type CurrencySelector =
  | { kind: 'native' }
  | { kind: 'address'; address: `0x${string}` }
  | { kind: 'term'; term: string }

export type ResolvedCurrency = {
  chainId: number
  address: `0x${string}`
  decimals: number | null
  symbol: string | null
  isNative: boolean
}

function parseChainSelector(
  selector: string,
): { kind: 'id'; id: number } | { kind: 'key'; key: string } {
  const trimmed = selector.trim()
  if (!trimmed) return { kind: 'key', key: '' }

  const asNumber = Number(trimmed)
  if (Number.isFinite(asNumber) && Number.isInteger(asNumber) && asNumber > 0) {
    return { kind: 'id', id: asNumber }
  }
  return { kind: 'key', key: trimmed }
}

export function resolveChainId(selector: string | undefined): number | undefined {
  if (!selector) return undefined
  const parsed = parseChainSelector(selector)
  if (parsed.kind === 'id') return parsed.id
  const chain = findEarnoChainByKey(parsed.key)
  if (!chain) throw new Error(`Unknown chain '${parsed.key}'`)
  return chain.id
}

export function parseCurrencySelector(args: {
  input: string | undefined
  chainId: number
}): CurrencySelector {
  const raw = (args.input ?? 'native').trim()
  if (!raw || raw.toLowerCase() === 'native') return { kind: 'native' }

  if (raw.toLowerCase() === NATIVE_ADDRESS.toLowerCase()) return { kind: 'native' }

  const chain = findEarnoChainById(args.chainId)
  const nativeSymbol = chain?.nativeCurrency.symbol
  if (nativeSymbol && raw.toLowerCase() === nativeSymbol.toLowerCase()) {
    return { kind: 'native' }
  }

  if (/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    return { kind: 'address', address: raw as `0x${string}` }
  }

  return { kind: 'term', term: raw }
}

async function relayCurrenciesV2(args: {
  apiKey?: string
  body: Record<string, unknown>
}): Promise<RelayCurrency[]> {
  const res = await fetch(`${RELAY_BASE_URL}/currencies/v2`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(args.apiKey ? { 'x-api-key': args.apiKey } : {}),
    },
    body: JSON.stringify(args.body),
  })

  const text = await res.text()
  let json: any
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = undefined
  }

  if (!res.ok) {
    const msg =
      (json && typeof json.message === 'string' && json.message) ||
      `Relay API error (${res.status})`
    const errorCode =
      json && typeof json.errorCode === 'string' ? json.errorCode : undefined
    throw new Error(errorCode ? `${msg} (${errorCode})` : msg)
  }

  if (!Array.isArray(json)) {
    throw new Error('Relay API returned unexpected response')
  }

  const currencies: RelayCurrency[] = []
  for (const item of json) {
    if (!item || typeof item !== 'object') continue
    const v = item as any
    if (typeof v.chainId !== 'number') continue
    if (typeof v.address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(v.address)) {
      continue
    }

    const decimals =
      typeof v.decimals === 'number' && Number.isFinite(v.decimals) ? v.decimals : undefined

    currencies.push({
      chainId: v.chainId,
      address: v.address as `0x${string}`,
      ...(typeof v.symbol === 'string' ? { symbol: v.symbol } : {}),
      ...(typeof v.name === 'string' ? { name: v.name } : {}),
      ...(decimals !== undefined ? { decimals } : {}),
      ...(v.metadata && typeof v.metadata === 'object'
        ? {
            metadata: {
              ...(typeof v.metadata.verified === 'boolean'
                ? { verified: v.metadata.verified }
                : {}),
              ...(typeof v.metadata.isNative === 'boolean'
                ? { isNative: v.metadata.isNative }
                : {}),
            },
          }
        : {}),
    })
  }

  return currencies
}

function normalizeTerm(term: string): string {
  return term.trim().toLowerCase()
}

function findRelayCurrencyMatch(args: {
  term: string
  chainId: number
  currencies: RelayCurrency[]
}): { match: RelayCurrency } | { ambiguous: RelayCurrency[] } | { notFound: true } {
  const termLower = normalizeTerm(args.term)
  const items = args.currencies.filter((c) => c.chainId === args.chainId)

  if (items.length === 0) return { notFound: true }

  const exactSymbol = items.filter(
    (c) => typeof c.symbol === 'string' && c.symbol.toLowerCase() === termLower,
  )
  if (exactSymbol.length === 1) return { match: exactSymbol[0] }
  if (exactSymbol.length > 1) return { ambiguous: exactSymbol }

  const exactName = items.filter(
    (c) => typeof c.name === 'string' && c.name.toLowerCase() === termLower,
  )
  if (exactName.length === 1) return { match: exactName[0] }
  if (exactName.length > 1) return { ambiguous: exactName }

  if (items.length === 1) return { match: items[0] }
  return { ambiguous: items.slice(0, 8) }
}

async function fetchErc20Decimals(args: {
  rpcUrl: string
  token: `0x${string}`
}): Promise<number> {
  const client = createPublicClient({ transport: http(args.rpcUrl) })
  const decimals = await client.readContract({
    abi: erc20Abi,
    address: args.token,
    functionName: 'decimals',
  })

  if (typeof decimals !== 'number' || !Number.isFinite(decimals) || decimals < 0) {
    throw new Error('Invalid decimals() response')
  }

  return decimals
}

export async function resolveCurrency(args: {
  selector: CurrencySelector
  chainId: number
  rpcUrl: string
  apiKey?: string
}): Promise<ResolvedCurrency> {
  const chain = findEarnoChainById(args.chainId)

  if (args.selector.kind === 'native') {
    return {
      chainId: args.chainId,
      address: NATIVE_ADDRESS,
      decimals: 18,
      symbol: chain?.nativeCurrency.symbol ?? 'NATIVE',
      isNative: true,
    }
  }

  if (args.selector.kind === 'address') {
    const token = args.selector.address

    let symbol: string | null = null
    let decimals: number | null = null

    try {
      const currencies = await relayCurrenciesV2({
        apiKey: args.apiKey,
        body: { chainIds: [args.chainId], address: token, limit: 5 },
      })
      const match = currencies.find((c) => c.address.toLowerCase() === token.toLowerCase())
      if (match) {
        symbol = match.symbol ?? null
        decimals = match.decimals ?? null
      }
    } catch {
      // ignore and fall back to onchain read
    }

    if (decimals === null) {
      try {
        decimals = await fetchErc20Decimals({
          rpcUrl: args.rpcUrl,
          token,
        })
      } catch {
        decimals = null
      }
    }

    return {
      chainId: args.chainId,
      address: token,
      decimals,
      symbol,
      isNative: false,
    }
  }

  const term = args.selector.term

  const currenciesStrict = await relayCurrenciesV2({
    apiKey: args.apiKey,
    body: {
      chainIds: [args.chainId],
      term,
      verified: true,
      defaultList: true,
      limit: 25,
    },
  })

  const currencies =
    currenciesStrict.length > 0
      ? currenciesStrict
      : await relayCurrenciesV2({
          apiKey: args.apiKey,
          body: {
            chainIds: [args.chainId],
            term,
            defaultList: true,
            limit: 25,
          },
        })

  const picked = findRelayCurrencyMatch({
    term,
    chainId: args.chainId,
    currencies,
  })

  if ('notFound' in picked) {
    const chainLabel = chain ? `${chain.name} (${chain.key})` : String(args.chainId)
    throw new Error(
      `Could not find token '${term}' on ${chainLabel}. Try a 0x… ERC20 address.`,
    )
  }

  if ('ambiguous' in picked) {
    const chainLabel = chain ? `${chain.name} (${chain.key})` : String(args.chainId)
    const candidates = picked.ambiguous
      .map((c) => `${c.symbol ?? c.name ?? 'TOKEN'} ${c.address}`)
      .join(', ')
    throw new Error(
      `Token '${term}' is ambiguous on ${chainLabel}. Use an address. Candidates: ${candidates}`,
    )
  }

  const match = picked.match
  return {
    chainId: args.chainId,
    address: match.address,
    decimals: match.decimals ?? null,
    symbol: match.symbol ?? null,
    isNative: match.metadata?.isNative ?? false,
  }
}

export async function relayExecuteSwapMultiInput(args: {
  apiKey?: string
  body: Record<string, unknown>
}): Promise<RelaySwapResponse> {
  const res = await fetch(`${RELAY_BASE_URL}/execute/swap/multi-input`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(args.apiKey ? { 'x-api-key': args.apiKey } : {}),
    },
    body: JSON.stringify(args.body),
  })

  const text = await res.text()
  let json: any
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = undefined
  }

  if (!res.ok) {
    const msg =
      (json && typeof json.message === 'string' && json.message) ||
      `Relay API error (${res.status})`
    const errorCode =
      json && typeof json.errorCode === 'string' ? json.errorCode : undefined
    throw new Error(errorCode ? `${msg} (${errorCode})` : msg)
  }

  if (!json || typeof json !== 'object' || !Array.isArray(json.steps)) {
    throw new Error('Relay API returned unexpected response')
  }

  return json as RelaySwapResponse
}

export function isRelayTxData(value: unknown): value is RelayTxData {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<RelayTxData>
  return (
    typeof v.to === 'string' &&
    /^0x[0-9a-fA-F]{40}$/.test(v.to) &&
    typeof v.data === 'string' &&
    /^0x[0-9a-fA-F]*$/.test(v.data) &&
    typeof v.value === 'string' &&
    typeof v.chainId === 'number'
  )
}

