import { describe, expect, it, vi } from 'vitest'
import { swap } from '../src/commands/swap.js'

function mockOkResponse(json: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(json),
  } as any
}

describe('swap', () => {
  it('resolves token symbols via Relay currencies', async () => {
    const usdcBase = '0x1111111111111111111111111111111111111111' as const
    const txTarget = '0x2222222222222222222222222222222222222222' as const
    const sender = '0x3333333333333333333333333333333333333333'

    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url

      if (typeof url === 'string' && url.endsWith('/currencies/v2')) {
        return mockOkResponse([
          {
            chainId: 8453,
            address: usdcBase,
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            metadata: { verified: true },
          },
        ])
      }

      if (typeof url === 'string' && url.endsWith('/execute/swap/multi-input')) {
        const body = init?.body ? JSON.parse(String(init.body)) : {}
        expect(body?.origins?.[0]?.chainId).toBe(8453)
        expect(body?.destinationCurrency).toBe(usdcBase)

        return mockOkResponse({
          steps: [
            {
              id: 'swap',
              kind: 'transaction',
              items: [
                {
                  data: {
                    to: txTarget,
                    data: '0x',
                    value: '0',
                    chainId: 8453,
                  },
                },
              ],
            },
          ],
        })
      }

      throw new Error(`Unexpected fetch url: ${String(url)}`)
    })

    const originalFetch = globalThis.fetch
    ;(globalThis as any).fetch = fetchMock
    try {
      const ok = vi.fn((data: any) => ({ ok: true, data }))
      const error = vi.fn((err: any) => ({ ok: false, err }))

      const result = await swap.run({
        args: { amount: '0.01' },
        options: {
          from: 'native',
          to: 'USDC',
          chain: 'base',
          toChain: 'base',
          sender,
        },
        env: {},
        var: { webUrl: 'https://earno.sh' },
        ok,
        error,
      })

      expect(result.ok).toBe(true)
      expect(result.data.toCurrency).toBe(usdcBase)
      expect(result.data.toSymbol).toBe('USDC')
      expect(result.data.executorUrl).toMatch(/#r=/)
    } finally {
      ;(globalThis as any).fetch = originalFetch
    }
  })

  it('does not require --fromDecimals when an ERC20 address is provided', async () => {
    const usdcBase = '0x1111111111111111111111111111111111111111' as const
    const txTarget = '0x2222222222222222222222222222222222222222' as const
    const sender = '0x3333333333333333333333333333333333333333'

    const fetchMock = vi.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input?.url

      if (typeof url === 'string' && url.endsWith('/currencies/v2')) {
        return mockOkResponse([
          {
            chainId: 8453,
            address: usdcBase,
            symbol: 'USDC',
            decimals: 6,
            metadata: { verified: true },
          },
        ])
      }

      if (typeof url === 'string' && url.endsWith('/execute/swap/multi-input')) {
        return mockOkResponse({
          steps: [
            {
              id: 'swap',
              kind: 'transaction',
              items: [
                {
                  data: {
                    to: txTarget,
                    data: '0x',
                    value: '0',
                    chainId: 8453,
                  },
                },
              ],
            },
          ],
        })
      }

      throw new Error(`Unexpected fetch url: ${String(url)}`)
    })

    const originalFetch = globalThis.fetch
    ;(globalThis as any).fetch = fetchMock
    try {
      const ok = vi.fn((data: any) => ({ ok: true, data }))
      const error = vi.fn((err: any) => ({ ok: false, err }))

      const result = await swap.run({
        args: { amount: '1' },
        options: {
          from: usdcBase,
          to: 'native',
          chain: 'base',
          toChain: 'base',
          sender,
        },
        env: {},
        var: { webUrl: 'https://earno.sh' },
        ok,
        error,
      })

      expect(result.ok).toBe(true)
      expect(result.data.fromCurrency).toBe(usdcBase)
      expect(result.data.fromSymbol).toBe('USDC')
    } finally {
      ;(globalThis as any).fetch = originalFetch
    }
  })
})

