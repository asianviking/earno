import { describe, expect, it } from 'vitest'
import { parseEther } from 'viem'
import { formatSwberaBalanceSummary } from '../src/balance-format.js'

describe('balance formatting', () => {
  it('formats balances + exchange rate from totals', () => {
    const out = formatSwberaBalanceSummary({
      address: '0x0000000000000000000000000000000000000003',
      shares: parseEther('10'),
      underlyingBera: parseEther('20'),
      totalAssets: parseEther('100'),
      totalSupply: parseEther('50'),
    })

    expect(out).toEqual({
      address: '0x0000000000000000000000000000000000000003',
      sWBERA: '10',
      underlyingBERA: '20',
      exchangeRate: '1 sWBERA = 2.0000 BERA',
      totalVaultAssets: '100 WBERA',
    })
  })

  it('defaults exchange rate to 1 when supply is zero', () => {
    const out = formatSwberaBalanceSummary({
      address: '0x0000000000000000000000000000000000000004',
      shares: 0n,
      underlyingBera: 0n,
      totalAssets: 0n,
      totalSupply: 0n,
    })

    expect(out.exchangeRate).toBe('1 sWBERA = 1.0000 BERA')
  })
})

