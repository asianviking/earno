import { describe, expect, it } from 'vitest'
import { startEarnoCallbackServer } from '../src/callback-server.js'

describe('callback server', () => {
  it('resolves when callback is received', async () => {
    const server = await startEarnoCallbackServer()
    const { url, state } = server.callback

    const txHash = (`0x${'11'.repeat(32)}`) as const
    const res = await fetch(`${url}?state=${state}&txHash=${txHash}`)
    expect(res.status).toBe(200)

    const result = await server.waitForCallback
    expect(result.txHash).toBe(txHash)

    await server.close()
  })
})

