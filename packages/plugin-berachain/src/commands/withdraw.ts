import { z } from 'incur'
import { buildRedeem } from '../tx.js'
import { BERACHAIN, SWBERA } from '../contracts.js'
import { buildExecutorUrl, type EarnoWebRequestV1 } from '@earno/core/earnoRequest'
import { resolveCliChain } from '../chain.js'

export const withdraw = {
  description: 'Redeem sWBERA shares back to WBERA, then unwrap to native BERA',
  args: z.object({
    shares: z.string().describe('Amount of sWBERA shares to redeem (e.g. "1.0")'),
  }),
  options: z.object({
    receiver: z
      .string()
      .optional()
      .describe('Receiver address for the withdrawn BERA (defaults to sender — fill in your address)'),
    chain: z
      .string()
      .optional()
      .describe('Chain key or chainId (default: berachain)'),
    rpc: z
      .string()
      .optional()
      .describe('RPC URL override (default: $EARNO_RPC or chain default)'),
  }),
  env: z.object({
    EARNO_CHAIN: z
      .string()
      .optional()
      .describe('Default chain key/chainId (default: berachain)'),
    EARNO_RPC: z
      .string()
      .optional()
      .describe(`RPC URL (default: ${BERACHAIN.rpc})`),
  }),
  examples: [
    {
      args: { shares: '1.0' },
      options: { receiver: '0xYourAddress' },
      description: 'Redeem 1 sWBERA back to BERA',
    },
  ],
  async run(c: any) {
    const { shares } = c.args
    const receiver = c.options.receiver ?? '0xYOUR_ADDRESS'
    let chainId = BERACHAIN.id
    let rpcUrl = c.env.EARNO_RPC ?? BERACHAIN.rpc
    const webUrl = c.var?.webUrl ?? 'https://earno.sh'

    if (receiver === '0xYOUR_ADDRESS') {
      return c.error({
        code: 'MISSING_RECEIVER',
        message: 'Specify --receiver with your wallet address',
        retryable: true,
        cta: {
          commands: [
            {
              command: `bera withdraw ${shares} --receiver 0xYourWalletAddress`,
              description: 'Withdraw with your address',
            },
          ],
        },
      })
    }

    try {
      const resolved = resolveCliChain({
        chain: c.options.chain,
        rpcUrl: c.options.rpc,
        env: c.env,
      })
      chainId = resolved.chain.id
      rpcUrl = resolved.rpcUrl
    } catch (e) {
      return c.error({
        code: 'INVALID_CHAIN',
        message: e instanceof Error ? e.message : 'Invalid chain configuration',
        retryable: true,
      })
    }

    if (chainId !== BERACHAIN.id) {
      return c.error({
        code: 'UNSUPPORTED_CHAIN',
        message: `withdraw is Berachain-only (chainId ${BERACHAIN.id})`,
        retryable: true,
      })
    }

    const steps = buildRedeem(shares, receiver, { rpcUrl })

    const executable = steps.filter((s) => s.calldata.startsWith('0x'))
    const req = {
      title: 'Withdraw sWBERA → BERA',
      chainId,
      rpcUrl,
      sender: receiver as `0x${string}`,
      receiver: receiver as `0x${string}`,
      constraints: {
        allowlistContracts: [SWBERA.address],
      },
      intent: {
        plugin: '@earno/plugin-berachain',
        action: 'withdraw',
        params: { shares, receiver, chainId, rpcUrl },
        display: { strategy: 'sWBERA → BERA' },
      },
      calls: executable.map((s) => ({
        label: s.label,
        to: s.to as `0x${string}`,
        data: s.calldata as `0x${string}`,
      })),
    } satisfies Omit<EarnoWebRequestV1, 'v'>

    const executorUrl = buildExecutorUrl(webUrl, req)

    return c.ok(
      {
        strategy: 'sWBERA → BERA',
        shares: `${shares} sWBERA`,
        receiver,
        note: 'Step 2 amount depends on the exchange rate at execution time. Run `earno bera balance` to check current rate.',
        executorUrl,
        portoLink: executorUrl,
        steps: steps.map((s) => ({
          label: s.label,
          to: s.to,
          function: s.function,
          calldata: s.calldata,
          cast: s.cast,
        })),
      },
      {
        cta: {
          commands: [
            {
              command: `bera balance --address ${receiver}`,
              description: 'Check your balance',
            },
          ],
        },
      },
    )
  },
}
