import { z } from 'incur'
import { createPublicClient, http, parseEther } from 'viem'
import { buildDeposit } from '../tx.js'
import { BERACHAIN, SWBERA, WBERA } from '../contracts.js'

const berachain = {
  id: BERACHAIN.id,
  name: 'Berachain',
  nativeCurrency: { name: 'BERA', symbol: 'BERA', decimals: 18 },
  rpcUrls: { default: { http: [BERACHAIN.rpc] } },
} as const

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
  }),
  env: z.object({
    BEARN_RPC: z
      .string()
      .optional()
      .describe(`Berachain RPC URL (default: ${BERACHAIN.rpc})`),
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
    const rpc = c.env.BEARN_RPC ?? BERACHAIN.rpc

    if (receiver === '0xYOUR_ADDRESS') {
      return c.error({
        code: 'MISSING_RECEIVER',
        message:
          'Specify --receiver with your wallet address (or the address to receive sWBERA)',
        retryable: true,
        cta: {
          commands: [
            {
              command: `deposit ${amount} --receiver 0xYourWalletAddress`,
              description: 'Deposit with your address',
            },
          ],
        },
      })
    }

    const client = createPublicClient({
      chain: { ...berachain, rpcUrls: { default: { http: [rpc] } } },
      transport: http(rpc),
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

    const steps = buildDeposit(amount, receiver, { includeApprove })

    return c.ok(
      {
        strategy: 'BERA → sWBERA',
        amount: `${amount} BERA`,
        sender,
        receiver,
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
              command: `balance --address ${receiver}`,
              description: 'Check your sWBERA balance after deposit',
            },
          ],
        },
      },
    )
  },
}
