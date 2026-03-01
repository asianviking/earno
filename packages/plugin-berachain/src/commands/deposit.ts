import { z } from 'incur'
import { createPublicClient, http, parseEther } from 'viem'
import { buildDeposit } from '../tx.js'
import { BERACHAIN, SWBERA, WBERA } from '../contracts.js'
import { buildExecutorUrl, type EarnoWebRequestV1 } from '@earno/core/earnoRequest'
import { resolveCliChain } from '../chain.js'

export const deposit = {
  description: 'Deposit BERA into sWBERA (wraps BERA → WBERA → sWBERA)',
  args: z.object({
    amount: z.string().describe('Amount of BERA to deposit (e.g. "1.5")'),
  }),
  options: z.object({
    receiver: z
      .string()
      .optional()
      .describe('Receiver address (defaults to sender — fill in your address)'),
    sender: z
      .string()
      .optional()
      .describe(
        'Sender wallet address (defaults to receiver; required for smart approvals when depositing to a different receiver)',
      ),
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
      args: { amount: '1.0' },
      options: { receiver: '0xYourAddress' },
      description: 'Deposit 1 BERA into sWBERA',
    },
  ],
  async run(c: any) {
    const { amount } = c.args
    const receiver = c.options.receiver ?? '0xYOUR_ADDRESS'
    const sender = c.options.sender ?? receiver
    let chainId = BERACHAIN.id
    let rpcUrl = c.env.EARNO_RPC ?? BERACHAIN.rpc
    const webUrl = c.var?.webUrl ?? 'https://earno.sh'

    if (receiver === '0xYOUR_ADDRESS') {
      return c.error({
        code: 'MISSING_RECEIVER',
        message:
          'Specify --receiver with your wallet address (or the address to receive sWBERA)',
        retryable: true,
        cta: {
          commands: [
            {
              command: `bera deposit ${amount} --receiver 0xYourWalletAddress`,
              description: 'Deposit with your address',
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
        message: `deposit is Berachain-only (chainId ${BERACHAIN.id})`,
        retryable: true,
      })
    }

    const chain = {
      id: BERACHAIN.id,
      name: 'Berachain',
      nativeCurrency: { name: 'BERA', symbol: 'BERA', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    } as const

    const client = createPublicClient({
      chain,
      transport: http(rpcUrl),
    })

    const wei = parseEther(amount)

    let includeApprove = true
    try {
      const allowance = (await client.readContract({
        address: WBERA.address,
        abi: WBERA.abi,
        functionName: 'allowance',
        args: [sender as `0x${string}`, SWBERA.address],
      })) as bigint

      includeApprove = allowance < wei
    } catch {
      includeApprove = true
    }

    const steps = buildDeposit(amount, receiver, { includeApprove, rpcUrl })

    const req = {
      title: 'Deposit BERA → sWBERA',
      chainId,
      rpcUrl,
      sender: sender as `0x${string}`,
      receiver: receiver as `0x${string}`,
      constraints: {
        allowlistContracts: [WBERA.address, SWBERA.address],
      },
      intent: {
        plugin: '@earno/plugin-berachain',
        action: 'deposit',
        params: { amount, sender, receiver, chainId, rpcUrl },
        display: { strategy: 'BERA → sWBERA' },
      },
      calls: steps.map((s) => ({
        label: s.label,
        to: s.to as `0x${string}`,
        data: s.calldata as `0x${string}`,
        ...(s.value ? { valueWei: wei.toString() } : {}),
      })),
    } satisfies Omit<EarnoWebRequestV1, 'v'>

    const executorUrl = buildExecutorUrl(webUrl, req)

    return c.ok(
      {
        strategy: 'BERA → sWBERA',
        amount: `${amount} BERA`,
        sender,
        receiver,
        executorUrl,
        portoLink: executorUrl,
        steps: steps.map((s) => ({
          label: s.label,
          to: s.to,
          function: s.function,
          calldata: s.calldata,
          ...(s.value ? { value: s.value } : {}),
          cast: s.cast,
        })),
      },
      {
        cta: {
          commands: [
            {
              command: `bera balance --address ${receiver}`,
              description: 'Check your sWBERA balance after deposit',
            },
          ],
        },
      },
    )
  },
}
