import { z } from 'incur'
import { parseUnits, formatUnits, getAddress } from 'viem'
import { findEarnoChainByKey } from '@earno/core/chains'
import { buildExecutorUrl, type EarnoWebCall, type EarnoWebRequestV1 } from '@earno/core/earnoRequest'
import { getDeployment, SUPPORTED_CHAINS } from '../contracts.js'
import { quoteAndBuildSend } from '../oft.js'

export const bridge = {
  description: 'Bridge USDT0 to yourself on another chain (zero slippage)',
  args: z.object({
    amount: z.string().describe('Amount of USDT to bridge (e.g. "100")'),
  }),
  options: z.object({
    chain: z
      .string()
      .describe(`Source chain (${SUPPORTED_CHAINS.join(', ')})`),
    toChain: z
      .string()
      .describe(`Destination chain (${SUPPORTED_CHAINS.join(', ')})`),
    sender: z
      .string()
      .describe('Your wallet address (receives on both chains)'),
    rpc: z
      .string()
      .optional()
      .describe('Source chain RPC URL override'),
  }),
  env: z.object({
    EARNO_RPC: z
      .string()
      .optional()
      .describe('RPC URL override for source chain'),
  }),
  examples: [
    {
      args: { amount: '500' },
      options: {
        chain: 'berachain',
        toChain: 'arbitrum',
        sender: '0xYourAddress',
      },
      description: 'Bridge 500 USDT0 from Berachain to yourself on Arbitrum',
    },
  ],
  async run(c: any) {
    const { amount } = c.args
    const srcChainKey = (c.options.chain as string).toLowerCase()
    const dstChainKey = (c.options.toChain as string).toLowerCase()
    const senderRaw = c.options.sender as string
    const webUrl = c.var?.webUrl ?? 'https://earno.sh'

    if (!senderRaw || senderRaw === '0xYOUR_ADDRESS') {
      return c.error({
        code: 'MISSING_SENDER',
        message: 'Specify --sender with your wallet address',
        retryable: true,
        cta: {
          commands: [
            {
              command: `usdt0 bridge ${amount} --chain ${srcChainKey} --to-chain ${dstChainKey} --sender 0xYourWalletAddress`,
              description: 'Retry with your address',
            },
          ],
        },
      })
    }

    let sender: string
    try {
      sender = getAddress(senderRaw)
    } catch {
      return c.error({ code: 'INVALID_ADDRESS', message: 'Invalid --sender address', retryable: true })
    }

    if (srcChainKey === dstChainKey) {
      return c.error({
        code: 'SAME_CHAIN',
        message: 'Source and destination chains must be different.',
        retryable: true,
      })
    }

    const srcDeployment = getDeployment(srcChainKey)
    if (!srcDeployment) {
      return c.error({
        code: 'UNSUPPORTED_SRC_CHAIN',
        message: `USDT0 not supported on '${srcChainKey}'. Supported: ${SUPPORTED_CHAINS.join(', ')}`,
        retryable: true,
      })
    }

    const dstDeployment = getDeployment(dstChainKey)
    if (!dstDeployment) {
      return c.error({
        code: 'UNSUPPORTED_DST_CHAIN',
        message: `USDT0 not supported on '${dstChainKey}'. Supported: ${SUPPORTED_CHAINS.join(', ')}`,
        retryable: true,
      })
    }

    const srcChain = findEarnoChainByKey(srcChainKey)
    if (!srcChain) {
      return c.error({
        code: 'UNKNOWN_CHAIN',
        message: `Chain '${srcChainKey}' not found in earno chain registry`,
        retryable: true,
      })
    }

    const rpcUrl = c.options.rpc ?? c.env?.EARNO_RPC ?? srcChain.rpcUrls[0]
    if (!rpcUrl) {
      return c.error({
        code: 'MISSING_RPC',
        message: `No RPC URL for ${srcChainKey}. Provide --rpc or set $EARNO_RPC.`,
        retryable: true,
      })
    }

    let amountWei: bigint
    try {
      amountWei = parseUnits(amount, srcDeployment.decimals)
    } catch (e) {
      return c.error({
        code: 'INVALID_AMOUNT',
        message: e instanceof Error ? e.message : 'Invalid amount',
        retryable: true,
      })
    }

    if (amountWei <= 0n) {
      return c.error({
        code: 'ZERO_AMOUNT',
        message: 'Amount must be greater than 0',
        retryable: true,
      })
    }

    let result: Awaited<ReturnType<typeof quoteAndBuildSend>>
    try {
      result = await quoteAndBuildSend({
        srcDeployment,
        dstDeployment,
        srcChainKey,
        dstChainKey,
        amountWei,
        to: sender as `0x${string}`,
        sender: sender as `0x${string}`,
        rpcUrl,
      })
    } catch (e) {
      return c.error({
        code: 'QUOTE_FAILED',
        message: e instanceof Error ? e.message : 'Failed to quote LayerZero fee',
        retryable: true,
      })
    }

    const tokenLabel = srcDeployment.isAdapter ? 'USDT' : 'USDT0'
    const calls: EarnoWebCall[] = []

    calls.push({
      label: `Approve ${tokenLabel} for LayerZero bridge`,
      to: result.tokenAddress,
      data: result.approveCalldata,
    })

    calls.push({
      label: `Bridge ${amount} ${tokenLabel} → ${dstChainKey}`,
      to: result.oftAddress,
      data: result.sendCalldata,
      valueWei: result.sendValueWei,
    })

    const req = {
      title: `Bridge ${amount} ${tokenLabel} → ${dstChainKey}`,
      chainId: srcChain.id,
      rpcUrl,
      sender: sender as `0x${string}`,
      receiver: sender as `0x${string}`,
      constraints: {
        allowlistContracts: [result.tokenAddress, result.oftAddress],
      },
      intent: {
        plugin: '@earno/plugin-usdt0',
        action: 'bridge',
        params: {
          amount,
          sender,
          srcChain: srcChainKey,
          dstChain: dstChainKey,
          srcEid: srcDeployment.eid,
          dstEid: dstDeployment.eid,
          isAdapter: srcDeployment.isAdapter,
        },
        display: {
          kind: 'transfer',
          strategy: `USDT0 bridge via LayerZero (zero slippage)`,
        },
      },
      calls,
    } satisfies Omit<EarnoWebRequestV1, 'v'>

    const executorUrl = buildExecutorUrl(webUrl, req)

    const quotedFeeFormatted = formatUnits(BigInt(result.quotedFee), 18)
    const nativeSymbol = srcChain.nativeCurrency.symbol

    return c.ok(
      {
        amount: `${amount} ${tokenLabel}`,
        from: srcChainKey,
        to: dstChainKey,
        wallet: sender,
        lzFee: `~${quotedFeeFormatted} ${nativeSymbol} (+ 20% buffer, excess refunded)`,
        executorUrl,
      },
      {
        cta: {
          commands: [
            {
              command: executorUrl,
              description: 'Open executorUrl',
            },
          ],
        },
      },
    )
  },
}
