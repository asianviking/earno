import { z } from 'incur'
import { parseEther } from 'viem'
import { resolveCliChain } from '../chain.js'
import { buildExecutorUrl, type EarnoWebRequestV1 } from '../porto-link.js'
import { startEarnoCallbackServer } from '../callback-server.js'

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
    wait: z
      .boolean()
      .optional()
      .describe('Wait for the browser executor to callback with a tx hash'),
    waitTimeoutSec: z
      .number()
      .optional()
      .describe('Timeout in seconds for --wait (default: 300)'),
  }),
  env: z.object({
    EARNO_CHAIN: z.string().optional().describe('Default chain key/chainId'),
    EARNO_RPC: z.string().optional().describe('RPC URL (default: chain default)'),
  }),
  async run(c: any) {
    const { amount } = c.args
    const to = c.options.to as string
    const wantWait = c.options.wait ?? false
    const waitTimeoutSec = c.options.waitTimeoutSec ?? 300
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

    let callbackWait:
      | Promise<{
          txHash?: `0x${string}`
          txHashes?: `0x${string}`[]
          bundleId?: `0x${string}`
          status?: string
        }>
      | undefined
    let closeCallback: (() => Promise<void>) | undefined
    let callback: { url: string; state: string } | undefined

    if (wantWait) {
      const server = await startEarnoCallbackServer()
      callback = server.callback
      callbackWait = server.waitForCallback
      closeCallback = server.close
    }

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
      ...(callback ? { callback } : {}),
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

    if (wantWait && executorUrl && callbackWait && closeCallback) {
      if (!c.agent) {
        console.error(`Open in browser:\n${executorUrl}\n\nWaiting for callback…`)
      }

      try {
        const timeoutMs = Math.max(1, Number(waitTimeoutSec)) * 1000
        const timeout = new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('Timed out waiting for callback')), timeoutMs),
        )
        const result = await Promise.race([callbackWait, timeout])
        return c.ok(
          {
            chainId,
            rpcUrl,
            to,
            amount: `${amount} ${symbol}`,
            executorUrl,
            portoLink: executorUrl,
            callback: { ...callback },
            txHash: result.txHash ?? null,
            txHashes: result.txHashes ?? null,
            bundleId: result.bundleId ?? null,
            status: result.status ?? null,
          },
          {
            cta: result.txHash
              ? {
                  commands: [
                    {
                      command: `cast receipt ${result.txHash} --rpc-url ${rpcUrl}`,
                      description: 'Check tx receipt',
                    },
                  ],
                }
              : undefined,
          },
        )
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed waiting for callback'
        return c.error({
          code: 'WAIT_FAILED',
          message,
          retryable: true,
          details: { executorUrl },
        })
      } finally {
        await closeCallback()
      }
    }

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
