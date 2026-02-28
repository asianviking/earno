import { z } from 'incur'
import { buildRedeem } from '../tx.js'
import { BERACHAIN, SWBERA } from '../contracts.js'
import { buildEarnoWebUrl, type EarnoWebRequestV1 } from '../porto-link.js'
import { resolveCliChain } from '../chain.js'
import { startEarnoCallbackServer } from '../callback-server.js'

export const withdraw = {
  description:
    'Redeem sWBERA shares back to WBERA, then unwrap to native BERA',
  args: z.object({
    shares: z
      .string()
      .describe('Amount of sWBERA shares to redeem (e.g. "1.0")'),
  }),
  options: z.object({
    receiver: z
      .string()
      .optional()
      .describe(
        'Receiver address for the withdrawn BERA (defaults to sender — fill in your address)',
      ),
    porto: z
      .boolean()
      .optional()
      .describe(
        'Legacy alias for --web',
      ),
    web: z
      .boolean()
      .optional()
      .describe(
        'Generate a web link to sign + execute in the browser',
      ),
    webUrl: z
      .string()
      .optional()
      .describe(
        'Web client base URL (default: $EARNO_WEB_URL or http://localhost:5173)',
      ),
    chain: z
      .string()
      .optional()
      .describe('Chain key or chainId (default: berachain)'),
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
    EARNO_CHAIN: z
      .string()
      .optional()
      .describe('Default chain key/chainId (default: berachain)'),
    BEARN_CHAIN: z
      .string()
      .optional()
      .describe('Legacy alias for EARNO_CHAIN'),
    EARNO_RPC: z
      .string()
      .optional()
      .describe(`RPC URL (default: ${BERACHAIN.rpc})`),
    BEARN_RPC: z
      .string()
      .optional()
      .describe('Legacy alias for EARNO_RPC'),
    EARNO_WEB_URL: z
      .string()
      .optional()
      .describe(
        'Web client base URL for --web links (default: http://localhost:5173)',
      ),
    BEARN_WEB_URL: z
      .string()
      .optional()
      .describe('Legacy alias for EARNO_WEB_URL'),
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
    let rpcUrl = c.env.EARNO_RPC ?? c.env.BEARN_RPC ?? BERACHAIN.rpc
    const wantWeb = c.options.web ?? c.options.porto ?? false
    const wantWait = c.options.wait ?? false
    const waitTimeoutSec = c.options.waitTimeoutSec ?? 300
    const webUrl =
      c.options.webUrl ??
      c.env.EARNO_WEB_URL ??
      c.env.BEARN_WEB_URL ??
      'http://localhost:5173'

    if (wantWait && !wantWeb) {
      return c.error({
        code: 'WAIT_REQUIRES_WEB',
        message: '--wait requires --web',
        retryable: true,
      })
    }

    if (receiver === '0xYOUR_ADDRESS') {
      return c.error({
        code: 'MISSING_RECEIVER',
        message:
          'Specify --receiver with your wallet address',
        retryable: true,
        cta: {
          commands: [
            {
              command: `withdraw ${shares} --receiver 0xYourWalletAddress`,
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
        message: `withdraw is currently Berachain-only (chainId ${BERACHAIN.id})`,
        retryable: true,
      })
    }

    const steps = buildRedeem(shares, receiver, { rpcUrl })

    let executorUrl: string | undefined
    let callbackWait: Promise<{ txHash?: `0x${string}`; txHashes?: `0x${string}`[]; bundleId?: `0x${string}`; status?: string }> | undefined
    let closeCallback: (() => Promise<void>) | undefined
    let callback: { url: string; state: string } | undefined

    if (wantWeb && wantWait) {
      const server = await startEarnoCallbackServer()
      callback = server.callback
      callbackWait = server.waitForCallback
      closeCallback = server.close
    }

    if (wantWeb) {
      try {
        const executable = steps.filter((s) => s.calldata.startsWith('0x'))
        const req: EarnoWebRequestV1 = {
          v: 1,
          title: 'Withdraw sWBERA → BERA',
          chainId,
          rpcUrl,
          sender: receiver as `0x${string}`,
          receiver: receiver as `0x${string}`,
          constraints: {
            allowlistContracts: [SWBERA.address],
          },
          intent: {
            plugin: 'earno',
            action: 'withdraw',
            params: { shares, receiver, chainId, rpcUrl },
            display: { strategy: 'sWBERA → BERA' },
          },
          ...(callback ? { callback } : {}),
          calls: executable.map((s) => ({
            label: s.label,
            to: s.to as `0x${string}`,
            data: s.calldata as `0x${string}`,
          })),
        }
        executorUrl = buildEarnoWebUrl(webUrl, req)
      } catch {
        return c.error({
          code: 'INVALID_WEB_URL',
          message:
            'Invalid --webUrl / $EARNO_WEB_URL. Expected a fully-qualified URL like http://localhost:5173',
          retryable: true,
        })
      }
    }

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
            strategy: 'sWBERA → BERA',
            shares: `${shares} sWBERA`,
            receiver,
            executorUrl,
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
        strategy: 'sWBERA → BERA',
        shares: `${shares} sWBERA`,
        receiver,
        note: 'Step 2 amount depends on the exchange rate at execution time. Run `earno balance` to check current rate.',
        ...(executorUrl ? { executorUrl, portoLink: executorUrl } : {}),
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
              command: `balance --address ${receiver}`,
              description: 'Check your balance',
            },
          ],
        },
      },
    )
  },
}
