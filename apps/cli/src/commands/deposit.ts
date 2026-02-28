import { z } from 'incur'
import { createPublicClient, http, parseEther } from 'viem'
import { buildDeposit } from '../tx.js'
import { BERACHAIN, SWBERA, WBERA } from '../contracts.js'
import { buildEarnoWebUrl, type EarnoWebRequestV1 } from '../porto-link.js'
import { resolveCliChain } from '../chain.js'
import { startEarnoCallbackServer } from '../callback-server.js'

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
        message: `deposit is currently Berachain-only (chainId ${BERACHAIN.id})`,
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
        const req: EarnoWebRequestV1 = {
          v: 1,
          title: 'Deposit BERA → sWBERA',
          chainId,
          rpcUrl,
          sender: sender as `0x${string}`,
          receiver: receiver as `0x${string}`,
          constraints: {
            allowlistContracts: [WBERA.address, SWBERA.address],
          },
          intent: {
            plugin: 'earno',
            action: 'deposit',
            params: { amount, sender, receiver, chainId, rpcUrl },
            display: { strategy: 'BERA → sWBERA' },
          },
          ...(callback ? { callback } : {}),
          calls: steps.map((s) => ({
            label: s.label,
            to: s.to as `0x${string}`,
            data: s.calldata as `0x${string}`,
            ...(s.value ? { valueWei: wei.toString() } : {}),
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
            strategy: 'BERA → sWBERA',
            amount: `${amount} BERA`,
            sender,
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
        strategy: 'BERA → sWBERA',
        amount: `${amount} BERA`,
        sender,
        receiver,
        ...(executorUrl ? { executorUrl, portoLink: executorUrl } : {}),
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
