import { z } from 'incur'
import { createPublicClient, http } from 'viem'
import { buildSwberaWithdrawClaim } from '../tx.js'
import { BERACHAIN, SWBERA } from '../contracts.js'
import { buildExecutorUrl, type EarnoWebRequestV1 } from '@earno/core/earnoRequest'
import { resolveCliChain } from '../chain.js'
import { startEarnoCallbackServer } from '../callback-server.js'

export const withdrawClaim = {
  description: 'Claim a pending sWBERA withdrawal request after the cooldown',
  args: z.object({
    requestId: z.string().describe('Withdrawal requestId (uint256)'),
  }),
  options: z.object({
    sender: z
      .string()
      .optional()
      .describe('Sender wallet address (must own the withdrawal request NFT)'),
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
    EARNO_RPC: z
      .string()
      .optional()
      .describe(`RPC URL (default: ${BERACHAIN.rpc})`),
  }),
  examples: [
    {
      args: { requestId: '123' },
      options: { sender: '0xYourAddress' },
      description: 'Claim withdrawal request #123 after cooldown',
    },
  ],
  async run(c: any) {
    const { requestId } = c.args
    const sender = c.options.sender ?? '0xYOUR_ADDRESS'
    let chainId = BERACHAIN.id
    let rpcUrl = c.env.EARNO_RPC ?? BERACHAIN.rpc
    const wantWait = c.options.wait ?? false
    const waitTimeoutSec = c.options.waitTimeoutSec ?? 300
    const webUrl = c.var?.webUrl ?? 'https://earno.sh'

    if (sender === '0xYOUR_ADDRESS') {
      return c.error({
        code: 'MISSING_SENDER',
        message: 'Specify --sender with the address that owns the withdrawal request NFT',
        retryable: true,
        cta: {
          commands: [
            {
              command: `bera withdraw-claim ${requestId} --sender 0xYourWalletAddress`,
              description: 'Claim with your address',
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
        message: `withdraw-claim is Berachain-only (chainId ${BERACHAIN.id})`,
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

    const withdrawalRequestContract = (await client.readContract({
      address: SWBERA.address,
      abi: SWBERA.abi,
      functionName: 'withdrawalRequests721',
    })) as `0x${string}`

    const steps = buildSwberaWithdrawClaim({
      requestId,
      withdrawalRequestContract,
      rpcUrl,
    })

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
      title: 'Claim sWBERA withdrawal',
      chainId,
      rpcUrl,
      sender: sender as `0x${string}`,
      receiver: sender as `0x${string}`,
      constraints: {
        allowlistContracts: [withdrawalRequestContract],
      },
      intent: {
        plugin: '@earno/plugin-berachain',
        action: 'withdraw-claim',
        params: { requestId, sender, chainId, rpcUrl },
        display: { strategy: 'sWBERA withdrawal claim' },
      },
      ...(callback ? { callback } : {}),
      calls: steps.map((s) => ({
        label: s.label,
        to: s.to as `0x${string}`,
        data: s.calldata as `0x${string}`,
      })),
    } satisfies Omit<EarnoWebRequestV1, 'v'>

    const executorUrl = buildExecutorUrl(webUrl, req)

    if (wantWait && executorUrl && callbackWait && closeCallback) {
      if (!c.agent) {
        console.error(
          `Open in browser:\n${executorUrl}\n\nWaiting for callback…`,
        )
      }

      try {
        const timeoutMs = Math.max(1, Number(waitTimeoutSec)) * 1000
        const timeout = new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('Timed out waiting for callback')), timeoutMs),
        )
        const result = await Promise.race([callbackWait, timeout])
        return c.ok({
          strategy: 'sWBERA withdrawal claim',
          requestId,
          sender,
          withdrawalRequestContract,
          executorUrl,
          portoLink: executorUrl,
          callback: { ...callback },
          txHash: result.txHash ?? null,
          txHashes: result.txHashes ?? null,
          bundleId: result.bundleId ?? null,
          status: result.status ?? null,
        })
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Failed waiting for callback'
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

    return c.ok({
      strategy: 'sWBERA withdrawal claim',
      requestId,
      sender,
      withdrawalRequestContract,
      executorUrl,
      portoLink: executorUrl,
      steps: steps.map((s) => ({
        label: s.label,
        to: s.to,
        function: s.function,
        calldata: s.calldata,
        cast: s.cast,
      })),
    })
  },
}

