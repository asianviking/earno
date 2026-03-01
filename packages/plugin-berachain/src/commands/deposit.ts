import { z } from 'incur'
import { createPublicClient, http, parseEther, parseUnits } from 'viem'
import { buildHoneyVaultDepositAndStake, buildSwberaDepositNative } from '../tx.js'
import {
  BERACHAIN,
  HONEY,
  NATIVE_ADDRESS,
  RE7_HONEY_VAULT,
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
import {
  isRelayTxData,
  parseCurrencySelector,
  relayExecuteSwapMultiInput,
  resolveChainId,
  resolveCurrency,
} from '../relay.js'

export const deposit = {
  description: 'Deposit into sWBERA (BERA) or Bend Honey Vault (HONEY)',
  args: z.object({
    amount: z
      .string()
      .describe('Amount to deposit (BERA for --into swbera; HONEY for --into honey)'),
  }),
  options: z.object({
    into: z
      .enum(['swbera', 'honey'])
      .optional()
      .describe('Deposit target (default: swbera)'),
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
    from: z
      .string()
      .optional()
      .describe(
        "Origin currency for Relay swap when depositing into honey (default: 'honey' on Berachain; otherwise 'native')",
      ),
    originChain: z
      .string()
      .optional()
      .describe('Origin chain for Relay swap (ethereum|optimism|arbitrum|base|berachain)'),
    originRpc: z
      .string()
      .optional()
      .describe('Origin RPC URL override for Relay origin chain (default: chain default)'),
    maxInput: z
      .string()
      .optional()
      .describe(
        'Max amount to spend on origin chain when swapping/bridging with Relay (required when --from is not honey)',
      ),
    slippageBps: z
      .number()
      .optional()
      .describe('Slippage tolerance in basis points (e.g. 50 = 0.50%)'),
    refundTo: z
      .string()
      .optional()
      .describe('Refund address on origin chain (default: sender)'),
    stakeBufferBps: z
      .number()
      .optional()
      .describe(
        'Stake slightly less than previewed shares to avoid rounding reverts (default: 50 = 0.50%)',
      ),
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
      options: { into: 'swbera' as const, receiver: '0xYourAddress' },
      description: 'Deposit 1 BERA into sWBERA',
    },
    {
      args: { amount: '10' },
      options: { into: 'honey' as const, receiver: '0xYourAddress' },
      description: 'Deposit 10 HONEY into Bend Re7 Honey Vault (auto-stake for BGT)',
    },
    {
      args: { amount: '10' },
      options: {
        into: 'honey' as const,
        receiver: '0xYourAddress',
        sender: '0xYourAddress',
        originChain: 'base',
        from: 'usdc.e',
        maxInput: '50',
      },
      description: 'Swap/bridge via Relay, then deposit 10 HONEY into Bend on Berachain',
    },
  ],
  async run(c: any) {
    const { amount } = c.args
    const into = c.options.into ?? 'swbera'
    const receiver = c.options.receiver ?? '0xYOUR_ADDRESS'
    const sender = c.options.sender ?? receiver
    let chainId = BERACHAIN.id
    let rpcUrl = c.env.EARNO_RPC ?? BERACHAIN.rpc
    const wantWait = c.options.wait ?? false
    const waitTimeoutSec = c.options.waitTimeoutSec ?? 300
    const webUrl = c.var?.webUrl ?? 'https://earno.sh'

    if (receiver === '0xYOUR_ADDRESS') {
      return c.error({
        code: 'MISSING_RECEIVER',
        message:
          'Specify --receiver with your wallet address (or the address to receive the deposit)',
        retryable: true,
        cta: {
          commands: [
            {
              command: `bera deposit ${amount} --into ${into} --receiver 0xYourWalletAddress`,
              description: 'Retry with your address',
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

    if (into === 'honey') {
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

      if (!rewardVaultAddr) {
        return c.error({
          code: 'REWARD_VAULT_NOT_FOUND',
          message: 'Could not find a Reward Vault for the Re7 Honey Vault shares.',
          retryable: true,
        })
      }

      const previewShares = (await client.readContract({
        address: RE7_HONEY_VAULT.address,
        abi: RE7_HONEY_VAULT.abi,
        functionName: 'previewDeposit',
        args: [assets],
      })) as bigint

      const stakeBufferBpsRaw = c.options.stakeBufferBps ?? 50
      const stakeBufferBps = Math.max(0, Math.min(9999, Math.floor(Number(stakeBufferBpsRaw))))
      const stakeBps = 10_000 - stakeBufferBps
      const sharesToStake = (previewShares * BigInt(stakeBps)) / 10_000n

      if (sharesToStake <= 0n) {
        return c.error({
          code: 'STAKE_TOO_SMALL',
          message:
            'Deposit is too small to stake (previewed shares rounded to 0 after buffer). Try a larger amount.',
          retryable: true,
          details: { previewShares: previewShares.toString(), stakeBufferBps },
        })
      }

      const steps = buildHoneyVaultDepositAndStake({
        assets,
        receiver,
        rewardVault: rewardVaultAddr,
        sharesToStake,
        rpcUrl,
      })

      let originChainId = BERACHAIN.id
      try {
        originChainId = resolveChainId(c.options.originChain) ?? BERACHAIN.id
      } catch (e) {
        return c.error({
          code: 'INVALID_ORIGIN_CHAIN',
          message: e instanceof Error ? e.message : 'Invalid origin chain',
          retryable: true,
        })
      }

      const originChain = findEarnoChainById(originChainId)
      if (!originChain) {
        return c.error({
          code: 'UNSUPPORTED_ORIGIN_CHAIN',
          message:
            'Unsupported origin chain. Supported: ethereum, optimism, arbitrum, base, berachain.',
          retryable: true,
          details: { originChainId },
        })
      }

      const originRpcUrl = c.options.originRpc ?? originChain.rpcUrls[0] ?? rpcUrl
      const fromInputRaw =
        (c.options.from ??
          (originChainId === BERACHAIN.id ? 'honey' : 'native')) as string
      const fromLower = fromInputRaw.trim().toLowerCase()
      const isDirectHoney =
        originChainId === BERACHAIN.id &&
        (!fromLower || fromLower === 'honey' || fromLower === HONEY.address.toLowerCase())

      if (!isDirectHoney) {
        const maxInput = c.options.maxInput as string | undefined
        if (!maxInput) {
          return c.error({
            code: 'MISSING_MAX_INPUT',
            message:
              'Missing --maxInput. It is required when using Relay (when --from is not honey or --originChain is not berachain).',
            retryable: true,
            cta: {
              commands: [
                {
                  command: `bera deposit ${amount} --into honey --receiver ${receiver} --sender ${sender} --originChain ${originChain.key} --from ${fromInputRaw} --maxInput 100`,
                  description: 'Example (edit --maxInput)',
                },
              ],
            },
          })
        }

        const nativeSymbol = originChain.nativeCurrency.symbol ?? 'NATIVE'

        let originCurrency: { address: `0x${string}`; decimals: number | null; label: string }
        if (originChainId === BERACHAIN.id) {
          if (fromLower === 'honey') {
            originCurrency = { address: HONEY.address, decimals: HONEY.decimals, label: 'HONEY' }
          } else if (fromLower === 'usdc.e' || fromLower === 'usdce' || fromLower === 'usdc') {
            originCurrency = {
              address: USDC_E.address,
              decimals: USDC_E.decimals,
              label: 'USDC.e',
            }
          } else if (fromLower === 'usdt0' || fromLower === 'usdt') {
            originCurrency = {
              address: USDT0.address,
              decimals: USDT0.decimals,
              label: 'USDT0',
            }
          } else if (fromLower === 'bera' || fromLower === 'native') {
            originCurrency = { address: NATIVE_ADDRESS, decimals: 18, label: nativeSymbol }
          } else {
            const selector = parseCurrencySelector({ input: fromInputRaw, chainId: originChainId })
            let resolved: Awaited<ReturnType<typeof resolveCurrency>>
            try {
              resolved = await resolveCurrency({
                selector,
                chainId: originChainId,
                rpcUrl: originRpcUrl,
                apiKey: c.env.RELAY_API_KEY,
              })
            } catch (e) {
              return c.error({
                code: 'CURRENCY_RESOLVE_FAILED',
                message: e instanceof Error ? e.message : 'Failed resolving token',
                retryable: true,
              })
            }
            originCurrency = {
              address: resolved.address,
              decimals: resolved.decimals,
              label: resolved.symbol ?? resolved.address,
            }
          }
        } else {
          let selector = parseCurrencySelector({ input: fromInputRaw, chainId: originChainId })
          if (fromLower === 'bera') selector = { kind: 'native' }
          if (fromLower === 'usdc.e' || fromLower === 'usdce') selector = { kind: 'term', term: 'USDC' }
          if (fromLower === 'honey') selector = { kind: 'term', term: 'HONEY' }

          let resolved: Awaited<ReturnType<typeof resolveCurrency>>
          try {
            if (fromLower === 'usdt0') {
              try {
                resolved = await resolveCurrency({
                  selector: { kind: 'term', term: 'USDT0' },
                  chainId: originChainId,
                  rpcUrl: originRpcUrl,
                  apiKey: c.env.RELAY_API_KEY,
                })
              } catch {
                resolved = await resolveCurrency({
                  selector: { kind: 'term', term: 'USDT' },
                  chainId: originChainId,
                  rpcUrl: originRpcUrl,
                  apiKey: c.env.RELAY_API_KEY,
                })
              }
            } else {
              resolved = await resolveCurrency({
                selector,
                chainId: originChainId,
                rpcUrl: originRpcUrl,
                apiKey: c.env.RELAY_API_KEY,
              })
            }
          } catch (e) {
            return c.error({
              code: 'CURRENCY_RESOLVE_FAILED',
              message: e instanceof Error ? e.message : 'Failed resolving token',
              retryable: true,
            })
          }

          originCurrency = {
            address: resolved.address,
            decimals: resolved.decimals,
            label: resolved.symbol ?? resolved.address,
          }
        }

        let maxInputWei: string
        try {
          if (originCurrency.address.toLowerCase() === NATIVE_ADDRESS.toLowerCase()) {
            maxInputWei = parseEther(maxInput).toString()
          } else {
            const decimals = originCurrency.decimals
            if (decimals === undefined || decimals === null) {
              return c.error({
                code: 'MISSING_FROM_DECIMALS',
                message:
                  `Could not determine decimals for ${originCurrency.label} on ${originChain.key}. ` +
                  'Try a well-known token symbol/address.',
                retryable: true,
              })
            }
            maxInputWei = parseUnits(maxInput, Number(decimals)).toString()
          }
        } catch (e) {
          return c.error({
            code: 'INVALID_MAX_INPUT',
            message: e instanceof Error ? e.message : 'Invalid --maxInput',
            retryable: true,
          })
        }

        const slippageBpsRaw = c.options.slippageBps
        const slippageTolerance =
          slippageBpsRaw === undefined || slippageBpsRaw === null
            ? undefined
            : String(Math.max(0, Math.floor(Number(slippageBpsRaw))))

        let relay: Awaited<ReturnType<typeof relayExecuteSwapMultiInput>>
        try {
          relay = await relayExecuteSwapMultiInput({
            apiKey: c.env.RELAY_API_KEY,
            body: {
              user: sender,
              origins: [
                {
                  chainId: originChainId,
                  currency: originCurrency.address,
                  amount: maxInputWei,
                  user: sender,
                },
              ],
              destinationCurrency: HONEY.address,
              destinationChainId: BERACHAIN.id,
              tradeType: 'EXACT_OUTPUT',
              amount: assets.toString(),
              ...(slippageTolerance ? { slippageTolerance } : {}),
              recipient: sender,
              refundTo: (c.options.refundTo ?? sender) as string,
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

        rpcUrls[String(originChainId)] = originRpcUrl
        rpcUrls[String(BERACHAIN.id)] = rpcUrl

        const bendDepositStep: EarnoRelayStep = {
          id: 'bend-deposit',
          kind: 'transaction',
          action: 'Deposit',
          description: 'Deposit into Re7 Honey Vault + stake for BGT',
          items: steps.map((s) => ({
            data: {
              to: s.to as `0x${string}`,
              data: s.calldata as `0x${string}`,
              value: '0',
              chainId: BERACHAIN.id,
            },
          })),
        }

        allowlist.add(HONEY.address)
        allowlist.add(RE7_HONEY_VAULT.address)
        allowlist.add(rewardVaultAddr)

        const relaySteps = relay.steps as unknown as EarnoRelayStep[]

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

        const req: EarnoWebRequestV2 = {
          v: 2,
          title: `Deposit ${amount} HONEY → Bend (Re7)`,
          sender: sender as `0x${string}`,
          receiver: receiver as `0x${string}`,
          constraints: {
            allowlistContracts: Array.from(allowlist),
          },
          rpcUrls,
          intent: {
            plugin: '@earno/plugin-berachain',
            action: 'deposit',
            params: {
              into,
              amount,
              sender,
              receiver,
              originChainId,
              originRpcUrl,
              originCurrency: originCurrency.address,
              maxInput,
              maxInputWei,
              slippageTolerance: slippageTolerance ?? null,
              rewardVault: rewardVaultAddr,
              relayRequestIds,
              hasSignatureSteps,
            },
            display: { strategy: 'Relay → HONEY → Re7 Honey Vault (staked)' },
          },
          ...(callback ? { callback } : {}),
          relay: {
            steps: [...relaySteps, bendDepositStep],
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
                strategy: 'Relay → HONEY → Re7 Honey Vault (staked)',
                amount: `${amount} HONEY`,
                into,
                sender,
                receiver,
                originChainId,
                originCurrency: originCurrency.label,
                maxInput,
                rewardVault: rewardVaultAddr,
                relayRequestIds,
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
            strategy: 'Relay → HONEY → Re7 Honey Vault (staked)',
            amount: `${amount} HONEY`,
            into,
            sender,
            receiver,
            originChainId,
            originCurrency: originCurrency.label,
            maxInput,
            rewardVault: rewardVaultAddr,
            relayRequestIds,
            hasSignatureSteps,
            executorUrl,
            portoLink: executorUrl,
            relaySteps: relay.steps.length,
          },
          {
            cta: {
              commands: [
                {
                  command: `bera balance --address ${receiver}`,
                  description: 'Check your balances after deposit',
                },
              ],
            },
          },
        )
      }

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
        title: 'Deposit HONEY → Bend (Re7) + stake (BGT)',
        chainId,
        rpcUrl,
        sender: sender as `0x${string}`,
        receiver: receiver as `0x${string}`,
        constraints: {
          allowlistContracts: [HONEY.address, RE7_HONEY_VAULT.address, rewardVaultAddr],
        },
        intent: {
          plugin: '@earno/plugin-berachain',
          action: 'deposit',
          params: { into, amount, sender, receiver, chainId, rpcUrl, stakeBufferBps },
          display: { strategy: 'HONEY → Re7 Honey Vault (staked)' },
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
              strategy: 'HONEY → Re7 Honey Vault (staked)',
              amount: `${amount} HONEY`,
              into,
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
          strategy: 'HONEY → Re7 Honey Vault (staked)',
          amount: `${amount} HONEY`,
          into,
          sender,
          receiver,
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
                command: `bera balance --address ${receiver}`,
                description: 'Check your balances after deposit',
              },
            ],
          },
        },
      )
    }

    const wei = parseEther(amount)

    const steps = buildSwberaDepositNative(amount, receiver, { rpcUrl })

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
      title: 'Deposit BERA → sWBERA',
      chainId,
      rpcUrl,
      sender: sender as `0x${string}`,
      receiver: receiver as `0x${string}`,
      constraints: {
        allowlistContracts: [SWBERA.address],
      },
      intent: {
        plugin: '@earno/plugin-berachain',
        action: 'deposit',
        params: { into, amount, sender, receiver, chainId, rpcUrl },
        display: { strategy: 'BERA → sWBERA' },
      },
      ...(callback ? { callback } : {}),
      calls: steps.map((s) => ({
        label: s.label,
        to: s.to as `0x${string}`,
        data: s.calldata as `0x${string}`,
        ...(s.value ? { valueWei: wei.toString() } : {}),
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
            strategy: 'BERA → sWBERA',
            amount: `${amount} BERA`,
            sender,
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
        into,
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
