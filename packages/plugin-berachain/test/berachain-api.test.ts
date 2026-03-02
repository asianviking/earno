import { describe, expect, it, vi } from 'vitest'
import { berachainGraphql } from '../src/berachain-api.js'

describe('berachainGraphql', () => {
  it('returns data on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { ok: true } }),
      })),
    )

    const data = await berachainGraphql<{ ok: boolean }>({ query: 'query { ok }' })
    expect(data).toEqual({ ok: true })
  })

  it('throws on graphql errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ errors: [{ message: 'Nope' }], data: { ok: false } }),
      })),
    )

    await expect(berachainGraphql<{ ok: boolean }>({ query: 'query { ok }' })).rejects.toThrow(
      'Nope',
    )
  })

  it('throws on non-ok http responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ errors: [{ message: 'Server down' }] }),
      })),
    )

    await expect(berachainGraphql({ query: 'query { ok }' })).rejects.toThrow('Server down')
  })
})

