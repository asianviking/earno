import { z } from 'incur'
import { parseEther } from 'viem'
import { resolveCliChain } from '../chain.js'
import { buildExecutorUrl, type EarnoWebRequestV1 } from '../porto-link.js'

export const send = {
  description: 'Send native token (single-call request)',
  args: z.object({
    amount: z.string().describe('Amount of native token (e.g. "0.01")'),
  }),
  options: z.object({
    to: z.string().describe('Recipient address'),
    sender: z
      .string()
      .optional()
      .describe('Expected sender address (wallet must match)'),
    chain: z
      .string()
      .optional()
      .describe('Chain key or chainId (default: ethereum)'),
    rpc: z
      .string()
      .optional()
      .describe('RPC URL override (default: $EARNO_RPC or chain default)'),
  }),
  env: z.object({
    EARNO_CHAIN: z.string().optional().describe('Default chain key/chainId'),
    EARNO_RPC: z.string().optional().describe('RPC URL (default: chain default)'),
  }),
  async run(c: any) {
    const { amount } = c.args
    const to = c.options.to as string
    const webUrl = c.var?.webUrl ?? 'https://earno.sh'

    let chainId: number
    let rpcUrl: string
    let symbol: string
    try {
      const resolved = resolveCliChain({
        chain: c.options.chain,
        rpcUrl: c.options.rpc,
        env: c.env,
      })
      chainId = resolved.chain.id
      rpcUrl = resolved.rpcUrl
      symbol = resolved.chain.nativeCurrency.symbol
    } catch (e) {
      return c.error({
        code: 'INVALID_CHAIN',
        message: e instanceof Error ? e.message : 'Invalid chain configuration',
        retryable: true,
      })
    }

    const valueWei = parseEther(amount).toString()

    const req = {
      title: `Send ${amount} ${symbol}`,
      chainId,
      rpcUrl,
      sender: c.options.sender as `0x${string}` | undefined,
      receiver: to as `0x${string}`,
      intent: {
        plugin: 'earno',
        action: 'send',
        params: { amount, to, chainId, rpcUrl },
        display: { kind: 'transfer' },
      },
      calls: [
        {
          label: `Send to ${to}`,
          to: to as `0x${string}`,
          data: '0x',
          valueWei,
        },
      ],
    } satisfies Omit<EarnoWebRequestV1, 'v'>

    const executorUrl = buildExecutorUrl(webUrl, req)

    return c.ok(
      {
        chainId,
        rpcUrl,
        to,
        amount: `${amount} ${symbol}`,
        ...(executorUrl ? { executorUrl } : {}),
        portoLink: executorUrl,
        cast: `cast send ${to} --value ${amount}ether --rpc-url ${rpcUrl} --private-key $WALLET_PRIVATE_KEY`,
      },
    )
  },
}
