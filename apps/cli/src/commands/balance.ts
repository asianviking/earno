import { z } from 'incur'
import { createPublicClient, erc20Abi, formatUnits, http } from 'viem'
import { EARNO_CHAINS, findEarnoChainById, findEarnoChainByKey, type EarnoChain } from '@earno/core/chains'
import { STABLECOIN_VARIANTS_BY_CHAIN_ID } from '../stablecoins.js'

type ChainBalanceResult = {
  chainId: number
  chainKey: string
  chainName: string
  rpcUrl: string
  native:
    | {
        symbol: string
        decimals: number
        balanceWei: string
        balance: string
      }
    | {
        error: string
      }
  tokens: Array<
    | {
        family: 'USDC' | 'USDT'
        symbols: string[]
        address: `0x${string}`
        decimals: number
        balanceWei: string
        balance: string
      }
    | {
        family: 'USDC' | 'USDT'
        symbols: string[]
        address: `0x${string}`
        decimals: number
        error: string
      }
  >
  error?: string
}

function normalizeAddress(raw: string): `0x${string}` {
  const trimmed = raw.trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error(`Invalid address '${raw}' (expected 0x… 40 hex chars)`)
  }
  return trimmed as `0x${string}`
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

function resolveEarnoChain(selector: string): EarnoChain {
  const parsed = parseChainSelector(selector)
  if (parsed.kind === 'id') {
    const chain = findEarnoChainById(parsed.id)
    if (!chain) throw new Error(`Unknown chainId ${parsed.id}`)
    return chain
  }

  const chain = findEarnoChainByKey(parsed.key)
  if (!chain) throw new Error(`Unknown chain '${parsed.key}'`)
  return chain
}

function resolveSelectedChains(args: {
  chain?: string
  chains?: string
}): EarnoChain[] {
  if (args.chain && args.chains) {
    throw new Error(`Use either --chain or --chains, not both`)
  }

  if (args.chain) {
    return [resolveEarnoChain(args.chain)]
  }

  if (args.chains) {
    const list = args.chains
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (list.length === 0) throw new Error('Empty --chains list')
    return list.map(resolveEarnoChain)
  }

  return EARNO_CHAINS
}

function parseRpcOverrides(raw: string | undefined): Record<number, string> {
  if (!raw) return {}

  const out: Record<number, string> = {}
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const part of parts) {
    const [left, ...rest] = part.split('=')
    const right = rest.join('=')
    if (!left || !right) {
      throw new Error(
        `Invalid --rpcs entry '${part}'. Expected chainKey=url or chainId=url`,
      )
    }

    const chain = resolveEarnoChain(left)

    let url: URL
    try {
      url = new URL(right)
    } catch {
      throw new Error(`Invalid RPC URL for ${chain.key}: '${right}'`)
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Invalid RPC URL for ${chain.key}: '${right}'`)
    }

    out[chain.id] = url.toString()
  }

  return out
}

async function mapLimit<T, U>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const max = Math.max(1, Math.floor(limit))
  const workerCount = Math.min(max, items.length)
  const results: U[] = new Array(items.length)

  let nextIndex = 0
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex++
      if (index >= items.length) break
      results[index] = await fn(items[index]!, index)
    }
  })

  await Promise.all(workers)
  return results
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return promise

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, rej) => {
    timeoutId = setTimeout(() => rej(new Error(`${label} timed out`)), ms)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

async function queryChainBalance(args: {
  chain: EarnoChain
  rpcUrl: string
  address: `0x${string}`
}): Promise<ChainBalanceResult> {
  const { chain, rpcUrl, address } = args

  const client = createPublicClient({
    transport: http(rpcUrl),
  })

  const nativeSymbol = chain.nativeCurrency.symbol
  const nativeDecimals = chain.nativeCurrency.decimals

  const stablecoins = STABLECOIN_VARIANTS_BY_CHAIN_ID[chain.id] ?? []

  const nativePromise = (async () => {
    const balanceWei = await client.getBalance({ address })
    return {
      symbol: nativeSymbol,
      decimals: nativeDecimals,
      balanceWei: balanceWei.toString(),
      balance: formatUnits(balanceWei, nativeDecimals),
    }
  })()

  const tokenPromises = stablecoins.map(async (token) => {
    const symbols = [token.symbol, ...(token.aliases ?? [])]
    try {
      const balanceWei = (await client.readContract({
        address: token.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      })) as bigint

      return {
        family: token.family,
        symbols,
        address: token.address,
        decimals: token.decimals,
        balanceWei: balanceWei.toString(),
        balance: formatUnits(balanceWei, token.decimals),
      } as const
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to query token balance'
      return {
        family: token.family,
        symbols,
        address: token.address,
        decimals: token.decimals,
        error: message,
      } as const
    }
  })

  const [nativeSettled, tokensSettled] = await Promise.all([
    nativePromise
      .then((v) => ({ ok: true as const, value: v }))
      .catch((e) => ({
        ok: false as const,
        error: e instanceof Error ? e.message : 'Failed to query native balance',
      })),
    Promise.all(tokenPromises),
  ])

  const native = nativeSettled.ok ? nativeSettled.value : { error: nativeSettled.error }

  return {
    chainId: chain.id,
    chainKey: chain.key,
    chainName: chain.name,
    rpcUrl,
    native,
    tokens: tokensSettled,
  }
}

export const balance = {
  description: 'Check native + stablecoin balances across chains',
  options: z.object({
    address: z.string().describe('Wallet address to check'),
    chain: z.string().optional().describe('Chain key or chainId (default: all)'),
    chains: z
      .string()
      .optional()
      .describe('Comma-separated chain keys/chainIds (default: all)'),
    rpc: z
      .string()
      .optional()
      .describe('RPC URL override (only when querying a single --chain)'),
    rpcs: z
      .string()
      .optional()
      .describe('Per-chain RPC overrides: chain=url,chain=url'),
    concurrency: z
      .number()
      .optional()
      .describe('Max concurrent chain requests (default: 3)'),
    timeoutSec: z
      .number()
      .optional()
      .describe('Timeout per chain in seconds (default: 10)'),
  }),
  env: z.object({
    EARNO_RPC: z
      .string()
      .optional()
      .describe('RPC URL override (single-chain only; use --rpcs for multi-chain)'),
  }),
  examples: [
    {
      options: { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
      description: 'Check balances across all configured chains',
    },
    {
      options: { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', chain: 'base' },
      description: 'Check balances on a single chain',
    },
  ],
  async run(c: any) {
    let address: `0x${string}`
    try {
      address = normalizeAddress(c.options.address)
    } catch (e) {
      return c.error({
        code: 'INVALID_ADDRESS',
        message: e instanceof Error ? e.message : 'Invalid address',
        retryable: true,
      })
    }

    let selectedChains: EarnoChain[]
    try {
      selectedChains = resolveSelectedChains({
        chain: c.options.chain ?? undefined,
        chains: c.options.chains ?? undefined,
      })
    } catch (e) {
      return c.error({
        code: 'INVALID_CHAIN',
        message: e instanceof Error ? e.message : 'Invalid chain selection',
        retryable: true,
      })
    }

    const concurrency = Math.max(1, Math.floor(Number(c.options.concurrency ?? 3)))
    const timeoutMs = Math.max(1, Math.floor(Number(c.options.timeoutSec ?? 10))) * 1000

    let rpcOverrides: Record<number, string> = {}
    try {
      rpcOverrides = parseRpcOverrides(c.options.rpcs ?? undefined)
    } catch (e) {
      return c.error({
        code: 'INVALID_RPC',
        message: e instanceof Error ? e.message : 'Invalid RPC overrides',
        retryable: true,
      })
    }

    const singleChainMode = selectedChains.length === 1

    if (c.options.rpc && !singleChainMode) {
      return c.error({
        code: 'INVALID_RPC',
        message: 'Use --rpcs for multi-chain RPC overrides (or specify --chain)',
        retryable: true,
      })
    }

    if (singleChainMode) {
      const chain = selectedChains[0]!
      const rpcUrl =
        c.options.rpc ??
        c.env.EARNO_RPC ??
        rpcOverrides[chain.id] ??
        chain.rpcUrls[0]

      if (!rpcUrl) {
        return c.error({
          code: 'MISSING_RPC',
          message: `Missing RPC URL for chainId ${chain.id}. Provide --rpc or set $EARNO_RPC.`,
          retryable: true,
        })
      }

      const result = await withTimeout(
        queryChainBalance({ chain, rpcUrl, address }),
        timeoutMs,
        `balance(${chain.key})`,
      ).catch((e) => {
        const message = e instanceof Error ? e.message : 'Failed to query chain'
        return {
          chainId: chain.id,
          chainKey: chain.key,
          chainName: chain.name,
          rpcUrl,
          native: { error: message },
          tokens: [],
          error: message,
        } satisfies ChainBalanceResult
      })

      return c.ok({ address, chains: [result] })
    }

    const results = await mapLimit(selectedChains, concurrency, async (chain) => {
      const rpcUrl = rpcOverrides[chain.id] ?? chain.rpcUrls[0]
      if (!rpcUrl) {
        return {
          chainId: chain.id,
          chainKey: chain.key,
          chainName: chain.name,
          rpcUrl: '',
          native: { error: `Missing RPC URL for chainId ${chain.id}` },
          tokens: [],
          error: 'Missing RPC URL',
        } satisfies ChainBalanceResult
      }

      return await withTimeout(
        queryChainBalance({ chain, rpcUrl, address }),
        timeoutMs,
        `balance(${chain.key})`,
      ).catch((e) => {
        const message = e instanceof Error ? e.message : 'Failed to query chain'
        return {
          chainId: chain.id,
          chainKey: chain.key,
          chainName: chain.name,
          rpcUrl,
          native: { error: message },
          tokens: [],
          error: message,
        } satisfies ChainBalanceResult
      })
    })

    return c.ok({
      address,
      chains: results,
    })
  },
}
