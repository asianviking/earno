import { describe, expect, it, vi } from 'vitest'
import { balance } from '../src/commands/balance.js'
import { EARNO_CHAINS } from '@earno/core/chains'
import { STABLECOIN_VARIANTS_BY_CHAIN_ID } from '../src/stablecoins.js'

function mockOkResponse(json: unknown) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === 'content-type' ? 'application/json' : null,
    },
    json: async () => json,
    text: async () => JSON.stringify(json),
  } as any
}

function toHexQuantity(value: bigint): string {
  if (value === 0n) return '0x0'
  return `0x${value.toString(16)}`
}

function toHex32(value: bigint): string {
  const hex = value.toString(16)
  return `0x${hex.padStart(64, '0')}`
}

function normalizeRpcUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

describe('balance', () => {
  it('queries all EARNO_CHAINS by default (native + stables)', async () => {
    const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

    const nativeByRpc: Record<string, bigint> = {
      'https://ethereum.publicnode.com': 1_000000000000000000n,
      'https://mainnet.base.org': 2_000000000000000000n,
      'https://mainnet.optimism.io': 3_000000000000000000n,
      'https://arb1.arbitrum.io/rpc': 4_000000000000000000n,
      'https://rpc.berachain.com': 5_000000000000000000n,
    }

    const chainIdByRpc: Record<string, number> = {
      'https://ethereum.publicnode.com': 1,
      'https://mainnet.base.org': 8453,
      'https://mainnet.optimism.io': 10,
      'https://arb1.arbitrum.io/rpc': 42161,
      'https://rpc.berachain.com': 80094,
    }

    const tokenBalancesByRpc: Record<string, Record<string, bigint>> = {}
    for (const chain of EARNO_CHAINS) {
      const rpcUrl = normalizeRpcUrl(chain.rpcUrls[0]!)
      tokenBalancesByRpc[rpcUrl] = {}
      const tokens = STABLECOIN_VARIANTS_BY_CHAIN_ID[chain.id] ?? []
      for (const t of tokens) {
        tokenBalancesByRpc[rpcUrl]![t.address.toLowerCase()] = 0n
      }
    }

    // Seed a couple non-zero token balances.
    tokenBalancesByRpc['https://ethereum.publicnode.com']![
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
    ] = 123_450_000n // 123.45 USDC
    tokenBalancesByRpc['https://arb1.arbitrum.io/rpc']![
      '0xaf88d065e77c8cc2239327c5edb3a432268e5831'
    ] = 1_000_000n // 1 USDC
    tokenBalancesByRpc['https://rpc.berachain.com']![
      '0x779ded0c9e1022225f8e0630b35a9b54be713736'
    ] = 7_000_000n // 7 USDT0

    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url
      if (typeof url !== 'string') throw new Error('Unexpected fetch input')

      const urlKey = normalizeRpcUrl(url)

      let bodyText = ''
      if (init?.body !== undefined) {
        if (typeof init.body === 'string') bodyText = init.body
        else if (init.body instanceof Uint8Array) {
          bodyText = Buffer.from(init.body).toString('utf8')
        } else {
          bodyText = String(init.body)
        }
      }
      else if (typeof input !== 'string' && typeof input?.text === 'function') {
        bodyText = await input.text()
      }
      const payload = bodyText ? JSON.parse(bodyText) : undefined

      const handle = (req: any) => {
        const method = req?.method
        if (method === 'eth_chainId') {
          const chainId = chainIdByRpc[urlKey]
          return { jsonrpc: '2.0', id: req.id, result: toHexQuantity(BigInt(chainId)) }
        }

        if (method === 'eth_getBalance') {
          const native = nativeByRpc[urlKey] ?? 0n
          return { jsonrpc: '2.0', id: req.id, result: toHexQuantity(native) }
        }

        if (method === 'eth_call') {
          const to = String(req?.params?.[0]?.to ?? '').toLowerCase()
          const value = tokenBalancesByRpc[urlKey]?.[to] ?? 0n
          return { jsonrpc: '2.0', id: req.id, result: toHex32(value) }
        }

        return {
          jsonrpc: '2.0',
          id: req?.id ?? null,
          error: { code: -32601, message: `Method not mocked: ${String(method)}` },
        }
      }

      const json = Array.isArray(payload) ? payload.map(handle) : handle(payload)
      return mockOkResponse(json)
    })

    const originalFetch = globalThis.fetch
    ;(globalThis as any).fetch = fetchMock
    try {
      const ok = vi.fn((data: any) => ({ ok: true, data }))
      const error = vi.fn((err: any) => ({ ok: false, err }))

      const result = await balance.run({
        options: { address },
        env: {},
        ok,
        error,
      })

      expect(result.ok).toBe(true)
      expect(result.data.address).toBe(address)
      expect(result.data.chains).toHaveLength(EARNO_CHAINS.length)

      const eth = result.data.chains.find((c: any) => c.chainId === 1)
      expect(eth.native.balance).toBe('1')
      const ethUsdc = eth.tokens.find((t: any) =>
        (t.symbols ?? []).includes('USDC'),
      )
      expect(ethUsdc.balance).toBe('123.45')

      const bera = result.data.chains.find((c: any) => c.chainId === 80094)
      const beraUsdt0 = bera.tokens.find((t: any) =>
        (t.symbols ?? []).includes('USDT0'),
      )
      expect(beraUsdt0.balance).toBe('7')
    } finally {
      ;(globalThis as any).fetch = originalFetch
    }
  })
})
