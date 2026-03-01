import { z } from 'incur'
import { createPublicClient, http, parseEther, parseUnits } from 'viem'
import { buildHoneyVaultWithdraw, buildSwberaWithdrawRequest } from '../tx.js'
import {
  BERACHAIN,
  HONEY,
  NATIVE_ADDRESS,
  RE7_HONEY_VAULT,
  REWARD_VAULT,
  SWBERA,
  USDC_E,
  USDT0,
} from '../contracts.js'
import { findEarnoChainById } from '@earno/core/chains'
import {
  buildEarnoWebUrl,
  buildExecutorUrl,
  type EarnoRelayStep,
  type EarnoWebRequestV1,
  type EarnoWebRequestV2,
} from '@earno/core/earnoRequest'
import { resolveCliChain } from '../chain.js'
import { startEarnoCallbackServer } from '../callback-server.js'
import { resolveRewardVault } from '../reward-vault.js'
import { isRelayTxData, relayExecuteSwapMultiInput } from '../relay.js'

export const withdraw = {
  description:
    'Withdraw from sWBERA (delayed: 7-day cooldown; instant: sell on market) or Bend Honey Vault',
  args: z.object({
    amount: z
      .string()
      .describe(
        'Amount to withdraw (sWBERA shares for --from swbera; HONEY assets for --from honey)',
      ),
  }),
  options: z.object({
    from: z
      .enum(['swbera', 'honey'])
      .optional()
      .describe('Withdraw source (default: swbera)'),
    receiver: z
      .string()
      .optional()
      .describe(
        'Receiver address for withdrawn assets (defaults to sender — fill in your address)',
      ),
    sender: z
      .string()
      .optional()
      .describe('Sender/owner wallet address (defaults to receiver)'),
    mode: z
      .enum(['delayed', 'instant'])
      .optional()
      .describe('Withdrawal mode (default: delayed)'),
    to: z
      .enum(['bera', 'honey', 'usdc.e', 'usdt0'])
      .optional()
      .describe('Instant withdraw output currency (default: bera)'),
    slippageBps: z
      .number()
      .optional()
      .describe('Slippage tolerance for instant sell in basis points (default: 100 = 1.00%)'),
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
    RELAY_API_KEY: z
      .string()
      .optional()
      .describe('Relay API key (optional; set if you hit rate limits)'),
  }),
  examples: [
    {
      args: { amount: '1.0' },
      options: { from: 'swbera' as const, receiver: '0xYourAddress' },
      description: 'Redeem 1 sWBERA back to BERA (delayed)',
    },
    {
      args: { amount: '1.0' },
      options: {
        from: 'swbera' as const,
        mode: 'instant' as const,
        to: 'bera' as const,
        receiver: '0xYourAddress',
      },
      description: 'Instant sell 1 sWBERA on market (Relay; slippage possible)',
    },
    {
      args: { amount: '10' },
      options: {
        from: 'honey' as const,
        receiver: '0xYourAddress',
        sender: '0xYourAddress',
      },
      description: 'Withdraw 10 HONEY from Bend Re7 Honey Vault',
    },
  ],
  async run(c: any) {
    const { amount } = c.args
    const from = c.options.from ?? 'swbera'
    const receiver = c.options.receiver ?? '0xYOUR_ADDRESS'
    const sender = c.options.sender ?? receiver
    const mode = c.options.mode ?? 'delayed'
    let chainId = BERACHAIN.id
    let rpcUrl = c.env.EARNO_RPC ?? BERACHAIN.rpc
    const wantWait = c.options.wait ?? false
    const waitTimeoutSec = c.options.waitTimeoutSec ?? 300
    const webUrl = c.var?.webUrl ?? 'https://earno.sh'

    if (receiver === '0xYOUR_ADDRESS') {
      return c.error({
        code: 'MISSING_RECEIVER',
        message: 'Specify --receiver with your wallet address',
        retryable: true,
        cta: {
          commands: [
            {
              command: `bera withdraw ${amount} --from ${from} --receiver 0xYourWalletAddress --mode ${mode}`,
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

    if (from === 'honey') {
      let assets: bigint
      try {
        assets = parseUnits(amount, HONEY.decimals)
      } catch (e) {
        return c.error({
          code: 'INVALID_AMOUNT',
          message: e instanceof Error ? e.message : 'Invalid amount',
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

      const requiredShares = (await client.readContract({
        address: RE7_HONEY_VAULT.address,
        abi: RE7_HONEY_VAULT.abi,
        functionName: 'previewWithdraw',
        args: [assets],
      })) as bigint

      const walletShares = (await client.readContract({
        address: RE7_HONEY_VAULT.address,
        abi: RE7_HONEY_VAULT.abi,
        functionName: 'balanceOf',
        args: [sender as `0x${string}`],
      })) as bigint

      let stakedShares = 0n
      if (rewardVaultAddr) {
        stakedShares = (await client.readContract({
          address: rewardVaultAddr,
          abi: REWARD_VAULT.abi,
          functionName: 'balanceOf',
          args: [sender as `0x${string}`],
        })) as bigint
      }

      const totalShares = walletShares + stakedShares
      if (totalShares < requiredShares) {
        return c.error({
          code: 'INSUFFICIENT_SHARES',
          message: 'Not enough Re7 Honey Vault shares to withdraw that amount of HONEY.',
          retryable: true,
          details: {
            requiredShares: requiredShares.toString(),
            walletShares: walletShares.toString(),
            stakedShares: stakedShares.toString(),
          },
        })
      }

      const missingShares = requiredShares > walletShares ? requiredShares - walletShares : 0n

      if (missingShares > 0n && !rewardVaultAddr) {
        return c.error({
          code: 'MISSING_REWARD_VAULT',
          message:
            'Some shares appear to be missing from the wallet, but no Reward Vault was found to unstake from.',
          retryable: true,
        })
      }

      const steps = buildHoneyVaultWithdraw({
        assets,
        receiver,
        owner: sender,
        rewardVault: rewardVaultAddr,
        ...(missingShares > 0n ? { unstakeShares: missingShares } : {}),
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

      const allowlist = new Set<`0x${string}`>([RE7_HONEY_VAULT.address])
      if (missingShares > 0n && rewardVaultAddr) allowlist.add(rewardVaultAddr)

      const req = {
        title: 'Withdraw HONEY from Bend (Re7)',
        chainId,
        rpcUrl,
        sender: sender as `0x${string}`,
        receiver: receiver as `0x${string}`,
        constraints: {
          allowlistContracts: Array.from(allowlist),
        },
        intent: {
          plugin: '@earno/plugin-berachain',
          action: 'withdraw',
          params: { from, amount, receiver, sender, chainId, rpcUrl },
          display: { strategy: 'Re7 Honey Vault → HONEY' },
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
              strategy: 'Re7 Honey Vault → HONEY',
              amount: `${amount} HONEY`,
              from,
              sender,
              receiver,
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
          strategy: 'Re7 Honey Vault → HONEY',
          amount: `${amount} HONEY`,
          from,
          sender,
          receiver,
          rewardVault: rewardVaultAddr,
          ...(executorUrl ? { executorUrl } : {}),
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
                description: 'Check your balances after withdraw',
              },
            ],
          },
        },
      )
    }

    if (mode === 'instant') {
      const to = (c.options.to ?? 'bera') as 'bera' | 'honey' | 'usdc.e' | 'usdt0'

      let destinationCurrency: `0x${string}`
      let toLabel: string
      if (to === 'bera') {
        destinationCurrency = NATIVE_ADDRESS
        toLabel = 'BERA'
      } else if (to === 'honey') {
        destinationCurrency = HONEY.address
        toLabel = 'HONEY'
      } else if (to === 'usdc.e') {
        destinationCurrency = USDC_E.address
        toLabel = 'USDC.e'
      } else {
        destinationCurrency = USDT0.address
        toLabel = 'USDT0'
      }

      let amountWei: string
      try {
        amountWei = parseEther(amount).toString()
      } catch (e) {
        return c.error({
          code: 'INVALID_AMOUNT',
          message: e instanceof Error ? e.message : 'Invalid amount',
          retryable: true,
        })
      }

      const slippageBpsRaw = c.options.slippageBps ?? 100
      const slippageTolerance = String(Math.max(0, Math.floor(Number(slippageBpsRaw))))

      let relay: Awaited<ReturnType<typeof relayExecuteSwapMultiInput>>
      try {
        relay = await relayExecuteSwapMultiInput({
          apiKey: c.env.RELAY_API_KEY,
          body: {
            user: sender,
            origins: [
              {
                chainId: BERACHAIN.id,
                currency: SWBERA.address,
                amount: amountWei,
                user: sender,
              },
            ],
            destinationCurrency,
            destinationChainId: BERACHAIN.id,
            tradeType: 'EXACT_INPUT',
            slippageTolerance,
            recipient: receiver,
            refundTo: sender,
          },
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Relay request failed'
        return c.error({
          code: 'RELAY_FAILED',
          message,
          retryable: true,
        })
      }

      const allowlist = new Set<`0x${string}`>()
      const rpcUrls: Record<string, string> = {}
      const relayRequestIds: string[] = []
      const hasSignatureSteps = relay.steps.some((s) => s.kind === 'signature')

      for (const step of relay.steps) {
        if (step.kind !== 'transaction' && step.kind !== 'signature') {
          return c.error({
            code: 'UNSUPPORTED_RELAY_STEP',
            message: `Relay returned unsupported step kind '${step.kind}'.`,
            retryable: true,
            details: { step },
          })
        }

        if (step.requestId) relayRequestIds.push(step.requestId)
        if (step.kind === 'signature') continue

        for (const item of step.items ?? []) {
          const data = item?.data
          if (!isRelayTxData(data)) {
            return c.error({
              code: 'INVALID_RELAY_ITEM',
              message: 'Relay returned invalid transaction data',
              retryable: true,
              details: { step, item },
            })
          }

          const chain = findEarnoChainById(data.chainId)
          if (chain?.rpcUrls?.[0]) rpcUrls[String(data.chainId)] = chain.rpcUrls[0]
          allowlist.add(data.to as `0x${string}`)
        }
      }

      rpcUrls[String(BERACHAIN.id)] = rpcUrl

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

      const relaySteps = relay.steps as unknown as EarnoRelayStep[]

      const req: EarnoWebRequestV2 = {
        v: 2,
        title: `Instant sell ${amount} sWBERA → ${toLabel}`,
        sender: sender as `0x${string}`,
        receiver: receiver as `0x${string}`,
        constraints: {
          allowlistContracts: Array.from(allowlist),
        },
        rpcUrls,
        intent: {
          plugin: '@earno/plugin-berachain',
          action: 'withdraw',
          params: {
            from,
            mode,
            amount,
            amountWei,
            to,
            destinationCurrency,
            sender,
            receiver,
            slippageTolerance,
            relayRequestIds,
            hasSignatureSteps,
            chainId,
            rpcUrl,
          },
          display: { strategy: `sWBERA → ${toLabel} (instant via Relay)` },
        },
        ...(callback ? { callback } : {}),
        relay: {
          steps: relaySteps,
        },
      }

      const executorUrl = buildEarnoWebUrl(webUrl, req)

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
              strategy: `sWBERA → ${toLabel} (instant via Relay)`,
              amount: `${amount} sWBERA`,
              to,
              slippageTolerance,
              sender,
              receiver,
              relayRequestIds,
              executorUrl,
              portoLink: executorUrl,
              callback: { ...callback },
              txHash: result.txHash ?? null,
              txHashes: result.txHashes ?? null,
              bundleId: result.bundleId ?? null,
              status: result.status ?? null,
              note: 'Instant sells use open-market liquidity and may incur slippage.',
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
          strategy: `sWBERA → ${toLabel} (instant via Relay)`,
          amount: `${amount} sWBERA`,
          to,
          slippageTolerance,
          sender,
          receiver,
          relayRequestIds,
          hasSignatureSteps,
          executorUrl,
          portoLink: executorUrl,
          relaySteps: relay.steps.length,
          note: 'Instant sells use open-market liquidity and may incur slippage.',
        },
        {
          cta: {
            commands: [
              {
                command: `bera balance --address ${receiver}`,
                description: 'Check your balances',
              },
            ],
          },
        },
      )
    }

    const steps = buildSwberaWithdrawRequest(amount, receiver, sender, { rpcUrl })

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

    const executable = steps.filter((s) => s.calldata.startsWith('0x'))
    const req = {
      title: 'Withdraw sWBERA (request)',
      chainId,
      rpcUrl,
      sender: sender as `0x${string}`,
      receiver: receiver as `0x${string}`,
      constraints: {
        allowlistContracts: [SWBERA.address],
      },
      intent: {
        plugin: '@earno/plugin-berachain',
        action: 'withdraw',
        params: { from, amount, receiver, sender, mode, chainId, rpcUrl },
        display: { strategy: 'sWBERA → BERA (delayed)' },
      },
      ...(callback ? { callback } : {}),
      calls: executable.map((s) => ({
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
        return c.ok(
          {
            strategy: 'sWBERA → BERA',
            amount: `${amount} sWBERA`,
            receiver,
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

    return c.ok(
      {
        strategy: 'sWBERA → BERA (delayed)',
        amount: `${amount} sWBERA`,
        from,
        mode,
        sender,
        receiver,
        note: 'This creates a withdrawal request (cooldown ~7 days). After the cooldown, claim with `bera withdraw-claim <requestId> --sender <yourAddress>`.',
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
