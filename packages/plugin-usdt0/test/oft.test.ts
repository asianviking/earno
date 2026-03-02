import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeFunctionData } from 'viem'
import { ERC20_ABI, OFT_ABI, type Usdt0Deployment } from '../src/contracts.js'

const { readContractMock, createPublicClientMock } = vi.hoisted(() => {
  const readContractMock = vi.fn()
  const createPublicClientMock = vi.fn(() => ({ readContract: readContractMock }))
  return { readContractMock, createPublicClientMock }
})

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem')
  return {
    ...actual,
    createPublicClient: createPublicClientMock,
  }
})

function tupleValue(tuple: any, key: string, index: number) {
  if (tuple && typeof tuple === 'object' && key in tuple) return tuple[key]
  return tuple?.[index]
}

beforeEach(() => {
  readContractMock.mockReset()
  createPublicClientMock.mockClear()
})

describe('addressToBytes32', () => {
  it('left-pads and lowercases', async () => {
    const { addressToBytes32 } = await import('../src/oft.js')

    const addr = '0xAaBbCcDdEeFf00112233445566778899AaBbCcDd' as const
    const out = addressToBytes32(addr)

    expect(out).toBe(
      '0x000000000000000000000000aabbccddeeff00112233445566778899aabbccdd',
    )
    expect(out.length).toBe(66) // 0x + 64 hex chars
  })
})

describe('quoteAndBuildSend', () => {
  it('quotes fee and builds approve + send calldata (with 20% buffer)', async () => {
    readContractMock.mockResolvedValue({ nativeFee: 10n, lzTokenFee: 0n })

    const { quoteAndBuildSend, addressToBytes32 } = await import('../src/oft.js')

    const srcDeployment: Usdt0Deployment = {
      oft: '0x00000000000000000000000000000000000000aa',
      token: '0x00000000000000000000000000000000000000bb',
      decimals: 6,
      isAdapter: false,
      eid: 30110,
    }

    const dstDeployment: Usdt0Deployment = {
      oft: '0x00000000000000000000000000000000000000cc',
      token: '0x00000000000000000000000000000000000000dd',
      decimals: 6,
      isAdapter: false,
      eid: 30362,
    }

    const amountWei = 1_000_000n
    const to = '0x0000000000000000000000000000000000000001' as const
    const sender = '0x0000000000000000000000000000000000000002' as const

    const out = await quoteAndBuildSend({
      srcDeployment,
      dstDeployment,
      srcChainKey: 'arbitrum',
      dstChainKey: 'berachain',
      amountWei,
      to,
      sender,
      rpcUrl: 'https://example.invalid',
    })

    // ensure we called quoteSend with the right target + args
    expect(readContractMock).toHaveBeenCalledTimes(1)
    expect(readContractMock.mock.calls[0]?.[0]).toMatchObject({
      address: srcDeployment.oft,
      functionName: 'quoteSend',
    })
    expect(readContractMock.mock.calls[0]?.[0]?.args?.[1]).toBe(false)

    // fee = 10, buffer = +20% => 12
    expect(out.quotedFee).toBe('10')
    expect(out.feeWithBuffer).toBe('12')
    expect(out.sendValueWei).toBe('12')

    // approve(spender=oft, amount=amountWei)
    const approveDecoded = decodeFunctionData({
      abi: ERC20_ABI,
      data: out.approveCalldata,
    })
    expect(approveDecoded.functionName).toBe('approve')
    const [spender, approveAmount] = approveDecoded.args as any[]
    expect(String(spender).toLowerCase()).toBe(srcDeployment.oft.toLowerCase())
    expect(approveAmount).toBe(amountWei)

    // send(sendParam, fee, refundAddress)
    const sendDecoded = decodeFunctionData({
      abi: OFT_ABI,
      data: out.sendCalldata,
    })
    expect(sendDecoded.functionName).toBe('send')

    const [sendParam, fee, refundAddress] = sendDecoded.args as any[]
    expect(BigInt(tupleValue(sendParam, 'dstEid', 0))).toBe(BigInt(dstDeployment.eid))
    expect(tupleValue(sendParam, 'to', 1)).toBe(addressToBytes32(to))
    expect(tupleValue(sendParam, 'amountLD', 2)).toBe(amountWei)
    expect(tupleValue(sendParam, 'minAmountLD', 3)).toBe(amountWei)
    expect(tupleValue(sendParam, 'extraOptions', 4)).toBe('0x')

    expect(tupleValue(fee, 'nativeFee', 0)).toBe(12n)
    expect(tupleValue(fee, 'lzTokenFee', 1)).toBe(0n)
    expect(String(refundAddress).toLowerCase()).toBe(sender.toLowerCase())
  })
})
