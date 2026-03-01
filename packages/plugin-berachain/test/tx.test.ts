import { describe, expect, it } from 'vitest'
import { encodeFunctionData, parseEther } from 'viem'
import { buildDeposit, buildRedeem } from '../src/tx.js'
import { SWBERA, WBERA } from '../src/contracts.js'

describe('tx encoding', () => {
  it('buildDeposit encodes wrap + approve + deposit', () => {
    const receiver = '0x0000000000000000000000000000000000000001' as const
    const steps = buildDeposit('1.5', receiver)

    expect(steps).toHaveLength(3)

    const wei = parseEther('1.5')

    expect(steps[0]?.to).toBe(WBERA.address)
    expect(steps[0]?.function).toBe('deposit()')
    expect(steps[0]?.value).toBe('1.5 ether')
    expect(steps[0]?.calldata).toBe(
      encodeFunctionData({ abi: WBERA.abi, functionName: 'deposit' }),
    )

    expect(steps[1]?.to).toBe(WBERA.address)
    expect(steps[1]?.function).toBe('approve(address,uint256)')
    expect(steps[1]?.calldata).toBe(
      encodeFunctionData({
        abi: WBERA.abi,
        functionName: 'approve',
        args: [SWBERA.address, wei],
      }),
    )

    expect(steps[2]?.to).toBe(SWBERA.address)
    expect(steps[2]?.function).toBe('deposit(uint256,address)')
    expect(steps[2]?.calldata).toBe(
      encodeFunctionData({
        abi: SWBERA.abi,
        functionName: 'deposit',
        args: [wei, receiver],
      }),
    )
  })

  it('buildRedeem encodes redeem and leaves unwrap as placeholder', () => {
    const receiver = '0x0000000000000000000000000000000000000002' as const
    const steps = buildRedeem('2.0', receiver)

    expect(steps).toHaveLength(2)

    const wei = parseEther('2.0')

    expect(steps[0]?.to).toBe(SWBERA.address)
    expect(steps[0]?.function).toBe('redeem(uint256,address,address)')
    expect(steps[0]?.calldata).toBe(
      encodeFunctionData({
        abi: SWBERA.abi,
        functionName: 'redeem',
        args: [wei, receiver, receiver],
      }),
    )

    expect(steps[1]?.to).toBe(WBERA.address)
    expect(steps[1]?.function).toBe('withdraw(uint256)')
    expect(steps[1]?.calldata).toBe('(depends on step 1 output)')
  })
})

