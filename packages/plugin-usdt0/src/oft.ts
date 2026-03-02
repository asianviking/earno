import { createPublicClient, encodeFunctionData, http, type Hex } from 'viem'
import { OFT_ABI, ERC20_ABI, type Usdt0Deployment } from './contracts.js'

/** Fee buffer — quote + 20% to account for fee fluctuations (excess refunded) */
const FEE_BUFFER_BPS = 2_000n // 20%

/** Left-pad an EVM address to bytes32 */
export function addressToBytes32(addr: `0x${string}`): `0x${string}` {
  return `0x${addr.slice(2).toLowerCase().padStart(64, '0')}` as `0x${string}`
}

export type SendParams = {
  srcDeployment: Usdt0Deployment
  dstDeployment: Usdt0Deployment
  srcChainKey: string
  dstChainKey: string
  amountWei: bigint
  to: `0x${string}`
  sender: `0x${string}`
  rpcUrl: string
}

export type SendResult = {
  /** Encoded send() calldata */
  sendCalldata: `0x${string}`
  /** Native value to send with the tx (messaging fee + buffer) */
  sendValueWei: string
  /** Encoded approve() calldata for token → OFT */
  approveCalldata: `0x${string}`
  /** The OFT/adapter contract to call send() on */
  oftAddress: `0x${string}`
  /** The token contract to call approve() on */
  tokenAddress: `0x${string}`
  /** Quoted native fee (before buffer) */
  quotedFee: string
  /** Fee with buffer */
  feeWithBuffer: string
}

/**
 * Quote the LayerZero messaging fee and build the send + approve calldata.
 */
export async function quoteAndBuildSend(params: SendParams): Promise<SendResult> {
  const { srcDeployment, dstDeployment, amountWei, to, sender, rpcUrl } = params

  const client = createPublicClient({
    transport: http(rpcUrl),
  })

  // USDT0 OFT contracts have enforcedOptions set on-chain (lzReceive gas).
  // Passing empty extraOptions lets the on-chain config handle gas limits.
  // Custom extraOptions would conflict with enforced options and cause a revert.
  const sendParam = {
    dstEid: dstDeployment.eid,
    to: addressToBytes32(to),
    amountLD: amountWei,
    minAmountLD: amountWei, // USDT0: 6 shared decimals = 6 local decimals, no dust
    extraOptions: '0x' as Hex,
    composeMsg: '0x' as Hex,
    oftCmd: '0x' as Hex,
  }

  // Quote the messaging fee
  const fee = (await client.readContract({
    address: srcDeployment.oft,
    abi: OFT_ABI,
    functionName: 'quoteSend',
    args: [sendParam, false], // pay in native, not LZ token
  })) as { nativeFee: bigint; lzTokenFee: bigint }

  // Add buffer to fee (excess is refunded to sender)
  const nativeFeeWithBuffer =
    fee.nativeFee + (fee.nativeFee * FEE_BUFFER_BPS) / 10_000n

  // Encode the send() call
  const sendCalldata = encodeFunctionData({
    abi: OFT_ABI,
    functionName: 'send',
    args: [
      sendParam,
      { nativeFee: nativeFeeWithBuffer, lzTokenFee: 0n },
      sender, // refund address
    ],
  })

  // Token and OFT are separate contracts on all chains — always need approval.
  // On Ethereum (adapter): approve USDT → OFT_ADAPTER
  // On other chains: approve USDT0 token → OFT proxy
  const tokenAddress = srcDeployment.token
  const approveCalldata = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [srcDeployment.oft, amountWei],
  })

  return {
    sendCalldata,
    sendValueWei: nativeFeeWithBuffer.toString(),
    approveCalldata,
    oftAddress: srcDeployment.oft,
    tokenAddress,
    quotedFee: fee.nativeFee.toString(),
    feeWithBuffer: nativeFeeWithBuffer.toString(),
  }
}
