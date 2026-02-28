import { z } from 'incur'
import { createPublicClient, http, parseEther } from 'viem'
import { buildDeposit } from '../tx.js'
import { BERACHAIN, SWBERA, WBERA } from '../contracts.js'
import { buildEarnoWebUrl, type EarnoWebRequestV1 } from '../porto-link.js'

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
    porto: z
      .boolean()
      .optional()
      .describe(
        'Generate a web link to sign + execute with Porto in the browser',
      ),
    webUrl: z
      .string()
      .optional()
      .describe(
        'Web client base URL (default: $EARNO_WEB_URL or http://localhost:5173)',
      ),
  }),
  env: z.object({
    EARNO_RPC: z
      .string()
      .optional()
      .describe(`Berachain RPC URL (default: ${BERACHAIN.rpc})`),
    BEARN_RPC: z
      .string()
      .optional()
      .describe('Legacy alias for EARNO_RPC'),
    EARNO_WEB_URL: z
      .string()
      .optional()
      .describe(
        'Web client base URL for --porto links (default: http://localhost:5173)',
      ),
    BEARN_WEB_URL: z
      .string()
      .optional()
      .describe('Legacy alias for EARNO_WEB_URL'),
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
    const rpc = c.env.EARNO_RPC ?? c.env.BEARN_RPC ?? BERACHAIN.rpc
    const wantPorto = c.options.porto ?? false
    const webUrl =
      c.options.webUrl ??
      c.env.EARNO_WEB_URL ??
      c.env.BEARN_WEB_URL ??
      'http://localhost:5173'

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

    let portoLink: string | undefined
    if (wantPorto) {
      try {
        const req: EarnoWebRequestV1 = {
          v: 1,
          title: 'Deposit BERA → sWBERA',
          chainId: BERACHAIN.id,
          rpcUrl: rpc,
          sender: sender as `0x${string}`,
          receiver: receiver as `0x${string}`,
          calls: steps.map((s) => ({
            label: s.label,
            to: s.to as `0x${string}`,
            data: s.calldata as `0x${string}`,
            ...(s.value ? { valueWei: wei.toString() } : {}),
          })),
        }
        portoLink = buildEarnoWebUrl(webUrl, req)
      } catch {
        return c.error({
          code: 'INVALID_WEB_URL',
          message:
            'Invalid --webUrl / $EARNO_WEB_URL. Expected a fully-qualified URL like http://localhost:5173',
          retryable: true,
        })
      }
    }

    return c.ok(
      {
        strategy: 'BERA → sWBERA',
        amount: `${amount} BERA`,
        sender,
        receiver,
        ...(portoLink ? { portoLink } : {}),
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
