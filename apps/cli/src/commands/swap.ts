import { z } from 'incur'
import { createPublicClient, erc20Abi, http, parseEther, parseUnits } from 'viem'
import { findEarnoChainById, findEarnoChainByKey } from '@earno/core/chains'
import type { EarnoRelayStep } from '@earno/core/earnoRequest'
import { resolveCliChain } from '../chain.js'
import {
  buildEarnoWebUrl,
  type EarnoWebCall,
  type EarnoWebRequestV2,
} from '../porto-link.js'
import { startEarnoCallbackServer } from '../callback-server.js'

const RELAY_BASE_URL = 'https://api.relay.link'
const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000' as const

type RelayCurrency = {
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

function resolveChainId(selector: string | undefined): number | undefined {
  if (!selector) return undefined
  const parsed = parseChainSelector(selector)
  if (parsed.kind === 'id') return parsed.id
  const chain = findEarnoChainByKey(parsed.key)
  if (!chain) throw new Error(`Unknown chain '${parsed.key}'`)
  return chain.id
}

type CurrencySelector =
  | { kind: 'native' }
  | { kind: 'address'; address: `0x${string}` }
  | { kind: 'term'; term: string }

type ResolvedCurrency = {
  chainId: number
  address: `0x${string}`
  decimals: number | null
  symbol: string | null
  isNative: boolean
}

function parseCurrencySelector(args: {
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

function shortAddr(addr: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function currencyLabel(args: { chainId: number; currency: `0x${string}` }): string {
  if (args.currency.toLowerCase() === NATIVE_ADDRESS.toLowerCase()) {
    const chain = findEarnoChainById(args.chainId)
    return chain?.nativeCurrency.symbol ?? 'NATIVE'
  }
  return shortAddr(args.currency)
}

function relayCurrencyLabel(args: ResolvedCurrency): string {
  if (args.symbol) return args.symbol
  return currencyLabel({ chainId: args.chainId, currency: args.address })
}

type RelayTxData = {
  to: `0x${string}`
  data: `0x${string}`
  value: string
  chainId: number
}

type RelayStep = {
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

type RelaySwapResponse = {
  steps: RelayStep[]
  fees?: unknown
  details?: unknown
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

async function resolveCurrency(args: {
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
      const match = currencies.find(
        (c) => c.address.toLowerCase() === token.toLowerCase(),
      )
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

async function relayExecuteSwapMultiInput(args: {
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

function stepLabel(step: RelayStep): string {
  return step.description ?? step.action ?? step.id
}

function isRelayTxData(value: unknown): value is RelayTxData {
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

export const swap = {
  description: 'Swap via Relay (builds an executable call bundle)',
  args: z.object({
    amount: z.string().describe('Amount of input currency (e.g. "0.01")'),
  }),
  options: z.object({
    from: z
      .string()
      .optional()
      .describe(
        "Input currency (symbol like 'USDC', ERC20 0x…, or 'native' / chain native symbol) (default: native)",
      ),
    fromDecimals: z
      .number()
      .optional()
      .describe('Override decimals for --from when using an ERC20'),
    to: z
      .string()
      .describe(
        "Output currency (symbol like 'USDC', ERC20 0x…, or 'native' / chain native symbol)",
      ),
    chain: z
      .string()
      .optional()
      .describe('Origin chain key or chainId (default: ethereum)'),
    rpc: z
      .string()
      .optional()
      .describe('RPC URL override for origin chain (default: $EARNO_RPC or chain default)'),
    toChain: z
      .string()
      .optional()
      .describe('Destination chain key or chainId (default: same as --chain)'),
    sender: z.string().describe('Sender wallet address (used by Relay + executor)'),
    recipient: z
      .string()
      .optional()
      .describe('Recipient address on destination chain (default: sender)'),
    refundTo: z
      .string()
      .optional()
      .describe('Refund address on origin chain (default: sender)'),
    slippageBps: z
      .number()
      .optional()
      .describe('Slippage tolerance in basis points (e.g. 50 = 0.50%)'),
    wait: z
      .boolean()
      .optional()
      .describe('Wait for the browser executor to callback with a tx hash'),
    waitTimeoutSec: z
      .number()
      .optional()
      .describe('Timeout in seconds for --wait (default: 300)'),
  }),
  env: z.object({
    EARNO_CHAIN: z.string().optional().describe('Default chain key/chainId'),
    EARNO_RPC: z.string().optional().describe('RPC URL (default: chain default)'),
    RELAY_API_KEY: z
      .string()
      .optional()
      .describe('Relay API key (optional; set if you hit rate limits)'),
  }),
  async run(c: any) {
    const { amount } = c.args
    const sender = c.options.sender as string
    const recipient = (c.options.recipient ?? sender) as string
    const refundTo = (c.options.refundTo ?? sender) as string
    const wantWait = c.options.wait ?? false
    const waitTimeoutSec = c.options.waitTimeoutSec ?? 300
    const webUrl = c.var?.webUrl ?? 'https://earno.sh'

    let originChainId: number
    let rpcUrl: string
    try {
      const resolved = resolveCliChain({
        chain: c.options.chain,
        rpcUrl: c.options.rpc,
        env: c.env,
      })
      originChainId = resolved.chain.id
      rpcUrl = resolved.rpcUrl
    } catch (e) {
      return c.error({
        code: 'INVALID_CHAIN',
        message: e instanceof Error ? e.message : 'Invalid chain configuration',
        retryable: true,
      })
    }

    let destinationChainId: number
    try {
      destinationChainId =
        resolveChainId(c.options.toChain) ?? originChainId
    } catch (e) {
      return c.error({
        code: 'INVALID_DEST_CHAIN',
        message: e instanceof Error ? e.message : 'Invalid destination chain',
        retryable: true,
      })
    }

    const destinationRpcUrl =
      findEarnoChainById(destinationChainId)?.rpcUrls?.[0] ?? rpcUrl

    const fromSelector = parseCurrencySelector({
      input: c.options.from,
      chainId: originChainId,
    })
    const toSelector = parseCurrencySelector({
      input: c.options.to,
      chainId: destinationChainId,
    })

    let fromResolved: ResolvedCurrency
    let toResolved: ResolvedCurrency
    try {
      ;[fromResolved, toResolved] = await Promise.all([
        resolveCurrency({
          selector: fromSelector,
          chainId: originChainId,
          rpcUrl,
          apiKey: c.env.RELAY_API_KEY,
        }),
        resolveCurrency({
          selector: toSelector,
          chainId: destinationChainId,
          rpcUrl: destinationRpcUrl,
          apiKey: c.env.RELAY_API_KEY,
        }),
      ])
    } catch (e) {
      return c.error({
        code: 'CURRENCY_RESOLVE_FAILED',
        message: e instanceof Error ? e.message : 'Failed resolving token',
        retryable: true,
      })
    }

    const fromCurrency = fromResolved.address
    const toCurrency = toResolved.address

    let amountWei: string
    try {
      if (fromCurrency.toLowerCase() === NATIVE_ADDRESS.toLowerCase()) {
        amountWei = parseEther(amount).toString()
      } else {
        const decimals = c.options.fromDecimals ?? fromResolved.decimals
        if (decimals === undefined || decimals === null) {
          return c.error({
            code: 'MISSING_FROM_DECIMALS',
            message:
              `Could not determine decimals for ${currencyLabel({ chainId: originChainId, currency: fromCurrency })}. ` +
              'Provide --fromDecimals or use a well-known token symbol/address.',
            retryable: true,
          })
        }
        amountWei = parseUnits(amount, Number(decimals)).toString()
      }
    } catch (e) {
      return c.error({
        code: 'INVALID_AMOUNT',
        message: e instanceof Error ? e.message : 'Invalid amount',
        retryable: true,
      })
    }

    const slippageBpsRaw = c.options.slippageBps
    const slippageTolerance =
      slippageBpsRaw === undefined || slippageBpsRaw === null
        ? undefined
        : String(Math.max(0, Math.floor(Number(slippageBpsRaw))))

    let relay: RelaySwapResponse
    try {
      relay = await relayExecuteSwapMultiInput({
        apiKey: c.env.RELAY_API_KEY,
        body: {
          user: sender,
          origins: [
            {
              chainId: originChainId,
              currency: fromCurrency,
              amount: amountWei,
              user: sender,
            },
          ],
          destinationCurrency: toCurrency,
          destinationChainId,
          tradeType: 'EXACT_INPUT',
          ...(slippageTolerance ? { slippageTolerance } : {}),
          ...(recipient ? { recipient } : {}),
          ...(refundTo ? { refundTo } : {}),
        },
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Relay request failed'
      return c.error({
        code: 'RELAY_FAILED',
        message,
        retryable: true,
      })
    }

    const calls: Array<EarnoWebCall & { chainId: number }> = []
    const allowlist = new Set<`0x${string}`>()
    const relayRequestIds: string[] = []
    const rpcUrls: Record<string, string> = {}
    const steps = relay.steps
    const hasSignatureSteps = steps.some((s) => s.kind === 'signature')

    for (const step of steps) {
      if (step.kind !== 'transaction' && step.kind !== 'signature') {
        return c.error({
          code: 'UNSUPPORTED_RELAY_STEP',
          message: `Relay returned unsupported step kind '${step.kind}'.`,
          retryable: true,
          details: { step },
        })
      }

      if (step.requestId) relayRequestIds.push(step.requestId)

      if (step.kind === 'signature') continue

      for (const item of step.items ?? []) {
        const data = item?.data
        if (!isRelayTxData(data)) {
          return c.error({
            code: 'INVALID_RELAY_ITEM',
            message: 'Relay returned invalid transaction data',
            retryable: true,
            details: { step, item },
          })
        }

        const chain = findEarnoChainById(data.chainId)
        if (chain?.rpcUrls?.[0]) rpcUrls[String(data.chainId)] = chain.rpcUrls[0]

        const labelBase = stepLabel(step)
        const label = `${calls.length + 1}. ${labelBase}`
        calls.push({
          label,
          to: data.to as `0x${string}`,
          data: data.data as `0x${string}`,
          ...(data.value !== '0' ? { valueWei: data.value } : {}),
          chainId: data.chainId,
        })
        allowlist.add(data.to as `0x${string}`)
      }
    }

    const relaySteps = steps as unknown as EarnoRelayStep[]

    const fromLabel = relayCurrencyLabel(fromResolved)
    const toLabel = relayCurrencyLabel(toResolved)

    let callbackWait:
      | Promise<{
          txHash?: `0x${string}`
          txHashes?: `0x${string}`[]
          bundleId?: `0x${string}`
          status?: string
        }>
      | undefined
    let closeCallback: (() => Promise<void>) | undefined
    let callback: { url: string; state: string } | undefined

    if (wantWait) {
      const server = await startEarnoCallbackServer()
      callback = server.callback
      callbackWait = server.waitForCallback
      closeCallback = server.close
    }

    rpcUrls[String(originChainId)] = rpcUrl

    const req: EarnoWebRequestV2 = {
      v: 2,
      title: `Swap ${amount} ${fromLabel} → ${toLabel}`,
      sender: sender as `0x${string}`,
      receiver: recipient as `0x${string}`,
      constraints: {
        allowlistContracts: Array.from(allowlist),
      },
      rpcUrls,
      intent: {
        plugin: 'earno',
        action: 'swap',
        params: {
          amount,
          amountWei,
          fromCurrency,
          toCurrency,
          fromSymbol: fromResolved.symbol ?? null,
          toSymbol: toResolved.symbol ?? null,
          originChainId,
          destinationChainId,
          sender,
          recipient,
          refundTo,
          slippageTolerance: slippageTolerance ?? null,
          relayRequestIds,
          hasSignatureSteps,
        },
        display: {
          kind: 'swap',
          via: 'relay',
        },
      },
      ...(callback ? { callback } : {}),
      relay: {
        steps: relaySteps,
      },
    }

    const executorUrl = buildEarnoWebUrl(webUrl, req)

    if (wantWait && executorUrl && callbackWait && closeCallback) {
      if (!c.agent) {
        console.error(`Open in browser:\n${executorUrl}\n\nWaiting for callback…`)
      }

      try {
        const timeoutMs = Math.max(1, Number(waitTimeoutSec)) * 1000
        const timeout = new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('Timed out waiting for callback')), timeoutMs),
        )
        const result = await Promise.race([callbackWait, timeout])
        return c.ok(
          {
            originChainId,
            destinationChainId,
            rpcUrl,
            sender,
            recipient,
            fromCurrency,
            toCurrency,
            fromSymbol: fromResolved.symbol ?? null,
            toSymbol: toResolved.symbol ?? null,
            amount,
            amountWei,
            relayRequestIds,
            executorUrl,
            portoLink: executorUrl,
            callback: { ...callback },
            txHash: result.txHash ?? null,
            txHashes: result.txHashes ?? null,
            bundleId: result.bundleId ?? null,
            status: result.status ?? null,
          },
          {
            cta: result.txHash
              ? {
                  commands: [
                    {
                      command: `cast receipt ${result.txHash} --rpc-url ${rpcUrl}`,
                      description: 'Check tx receipt',
                    },
                  ],
                }
              : undefined,
          },
        )
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed waiting for callback'
        return c.error({
          code: 'WAIT_FAILED',
          message,
          retryable: true,
          details: { executorUrl },
        })
      } finally {
        await closeCallback()
      }
    }

    return c.ok(
      {
        originChainId,
        destinationChainId,
        rpcUrl,
        sender,
        recipient,
        fromCurrency,
        toCurrency,
        fromSymbol: fromResolved.symbol ?? null,
        toSymbol: toResolved.symbol ?? null,
        amount,
        amountWei,
        relayRequestIds,
        ...(executorUrl ? { executorUrl } : {}),
        portoLink: executorUrl,
        hasSignatureSteps,
        calls: calls.map((call) => ({
          label: call.label,
          chainId: call.chainId,
          to: call.to,
          data: call.data,
          ...(call.valueWei ? { valueWei: call.valueWei } : {}),
          rpcUrl: rpcUrls[String(call.chainId)] ?? rpcUrl,
          cast:
            `cast send ${call.to} --data ${call.data}` +
            (call.valueWei ? ` --value ${call.valueWei}wei` : '') +
            ` --rpc-url ${rpcUrls[String(call.chainId)] ?? rpcUrl} --private-key $WALLET_PRIVATE_KEY`,
        })),
      },
    )
  },
}
