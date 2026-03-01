import { z } from 'incur'
import { createPublicClient, formatUnits, http, parseUnits } from 'viem'
import { buildExecutorUrl, type EarnoWebRequestV1 } from '@earno/core/earnoRequest'
import { resolveCliChain } from '../chain.js'
import { startEarnoCallbackServer } from '../callback-server.js'
import { BERACHAIN, BGT, RE7_HONEY_VAULT, REWARD_VAULT } from '../contracts.js'
import { resolveRewardVault } from '../reward-vault.js'
import { buildBgtClaimAndRedeem } from '../tx.js'

export const claim = {
  description: 'Claim unclaimed BGT (from Bend Re7 Honey Vault); optionally redeem to BERA',
  args: z.object({
    amount: z
      .string()
      .optional()
      .describe('Amount of BGT to claim (default: claim all pending)'),
  }),
  options: z.object({
    sender: z.string().optional().describe('Sender wallet address (must be the staker)'),
    redeem: z
      .boolean()
      .optional()
      .describe('Redeem claimed BGT to BERA (default: false)'),
    receiver: z
      .string()
      .optional()
      .describe('Receiver for redeemed BERA (default: sender; only used with --redeem)'),
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
      options: { sender: '0xYourAddress' },
      description: 'Claim all pending BGT',
    },
    {
      options: { sender: '0xYourAddress', redeem: true },
      description: 'Claim all pending BGT and redeem to BERA',
    },
  ],
  async run(c: any) {
    const sender = (c.options.sender ?? '0xYOUR_ADDRESS') as string
    const redeem = c.options.redeem ?? false
    const receiver = (c.options.receiver ?? sender) as string
    const wantWait = c.options.wait ?? false
    const waitTimeoutSec = c.options.waitTimeoutSec ?? 300
    const webUrl = c.var?.webUrl ?? 'https://earno.sh'

    if (sender === '0xYOUR_ADDRESS') {
      return c.error({
        code: 'MISSING_SENDER',
        message: 'Specify --sender with your wallet address',
        retryable: true,
        cta: {
          commands: [
            {
              command: `bera claim --sender 0xYourWalletAddress${redeem ? ' --redeem' : ''}`,
              description: 'Retry with your address',
            },
          ],
        },
      })
    }

    let chainId = BERACHAIN.id
    let rpcUrl = c.env.EARNO_RPC ?? BERACHAIN.rpc
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
        message: `claim is Berachain-only (chainId ${BERACHAIN.id})`,
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

    let rewardVaultAddr: `0x${string}` | null = null
    try {
      rewardVaultAddr = await resolveRewardVault({
        client,
        stakingToken: RE7_HONEY_VAULT.address,
      })
    } catch (e) {
      return c.error({
        code: 'REWARD_VAULT_RESOLVE_FAILED',
        message: e instanceof Error ? e.message : 'Failed to resolve reward vault',
        retryable: true,
      })
    }

    if (!rewardVaultAddr) {
      return c.error({
        code: 'REWARD_VAULT_NOT_FOUND',
        message: 'Could not find a Reward Vault for the Re7 Honey Vault shares.',
        retryable: true,
      })
    }

    const pending = (await client.readContract({
      address: rewardVaultAddr,
      abi: REWARD_VAULT.abi,
      functionName: 'earned',
      args: [sender as `0x${string}`],
    })) as bigint

    if (pending <= 0n) {
      return c.error({
        code: 'NOTHING_TO_CLAIM',
        message: 'No pending BGT to claim.',
        retryable: false,
        details: { pendingBGT: formatUnits(pending, BGT.decimals) },
      })
    }

    let claimAmount = pending
    if (c.args.amount) {
      try {
        claimAmount = parseUnits(String(c.args.amount), BGT.decimals)
      } catch (e) {
        return c.error({
          code: 'INVALID_AMOUNT',
          message: e instanceof Error ? e.message : 'Invalid amount',
          retryable: true,
        })
      }
    }

    if (claimAmount <= 0n) {
      return c.error({
        code: 'INVALID_AMOUNT',
        message: 'Claim amount must be > 0.',
        retryable: true,
      })
    }

    if (claimAmount > pending) {
      return c.error({
        code: 'AMOUNT_TOO_LARGE',
        message: 'Claim amount exceeds pending BGT.',
        retryable: true,
        details: {
          pendingBGT: formatUnits(pending, BGT.decimals),
          requestedBGT: formatUnits(claimAmount, BGT.decimals),
        },
      })
    }

    const steps = buildBgtClaimAndRedeem({
      rewardVault: rewardVaultAddr,
      account: sender,
      amount: claimAmount,
      ...(redeem ? { redeem: { receiver } } : {}),
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

    const allowlist = new Set<`0x${string}`>([rewardVaultAddr])
    if (redeem) allowlist.add(BGT.address)

    const req = {
      title: redeem ? 'Claim BGT + redeem to BERA' : 'Claim BGT',
      chainId,
      rpcUrl,
      sender: sender as `0x${string}`,
      receiver: sender as `0x${string}`,
      constraints: {
        allowlistContracts: Array.from(allowlist),
      },
      intent: {
        plugin: '@earno/plugin-berachain',
        action: 'claim',
        params: {
          pendingBGT: pending.toString(),
          amount: claimAmount.toString(),
          redeem,
          sender,
          receiver,
          rewardVault: rewardVaultAddr,
          chainId,
          rpcUrl,
        },
        display: { strategy: redeem ? 'Claim BGT + redeem → BERA' : 'Claim BGT' },
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
            strategy: redeem ? 'Claim BGT + redeem → BERA' : 'Claim BGT',
            pendingBGT: formatUnits(pending, BGT.decimals),
            claimBGT: formatUnits(claimAmount, BGT.decimals),
            redeem,
            sender,
            ...(redeem ? { receiver } : {}),
            rewardVault: rewardVaultAddr,
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
        strategy: redeem ? 'Claim BGT + redeem → BERA' : 'Claim BGT',
        pendingBGT: formatUnits(pending, BGT.decimals),
        claimBGT: formatUnits(claimAmount, BGT.decimals),
        redeem,
        sender,
        ...(redeem ? { receiver } : {}),
        rewardVault: rewardVaultAddr,
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
              command: `bera balance --address ${sender}`,
              description: 'Check your balances',
            },
          ],
        },
      },
    )
  },
}

