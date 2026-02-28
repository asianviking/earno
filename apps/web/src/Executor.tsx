import { Porto } from 'porto'
import { createPublicClient, formatEther, http } from 'viem'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EarnoWebRequestV1 } from './earnoRequest'
import { EARNO_DEFAULT_CHAIN, findEarnoChainById } from '@earno/core/chains'

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>
}

function buildCallbackUrl(
  baseUrl: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(baseUrl)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    url.searchParams.set(key, value)
  }
  return url.toString()
}

type CallsStatus = {
  status: number
  id: string
  atomic?: boolean
  receipts?: Array<{ transactionHash?: `0x${string}` }> | unknown
}

function chainIdToHex(chainId: number): `0x${string}` {
  return (`0x${chainId.toString(16)}`) as `0x${string}`
}

function weiDecimalToHex(valueWei: string): `0x${string}` {
  return (`0x${BigInt(valueWei).toString(16)}`) as `0x${string}`
}

function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

const APPROVE_SELECTOR = '0x095ea7b3'
const MAX_UINT256 = (1n << 256n) - 1n

function readApproveAmount(data: `0x${string}`): bigint | null {
  if (!data.startsWith(APPROVE_SELECTOR)) return null
  const payload = data.slice(2)
  const expectedLen = 8 + 64 + 64
  if (payload.length < expectedLen) return null
  const amountHex = payload.slice(8 + 64, 8 + 64 + 64)
  try {
    return BigInt(`0x${amountHex}`)
  } catch {
    return null
  }
}

function statusLabel(code: number): string {
  if (code >= 200 && code < 300) return 'Confirmed'
  if (code >= 100 && code < 200) return 'Pending'
  if (code >= 400 && code < 500) return 'Offchain failure'
  if (code >= 500 && code < 600) return 'Reverted'
  if (code >= 600 && code < 700) return 'Partial revert'
  return `Unknown (${code})`
}

async function ensureWalletOnChain(args: {
  provider: Eip1193Provider
  chainIdHex: `0x${string}`
  chainName: string
  rpcUrl?: string
  nativeCurrencySymbol?: string
}) {
  const { provider, chainIdHex, chainName, rpcUrl, nativeCurrencySymbol } = args

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    })
  } catch (e) {
    const code = (e as { code?: number } | undefined)?.code
    if (code !== 4902) return
    if (!rpcUrl) return

    try {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: chainIdHex,
            chainName,
            nativeCurrency: {
              name: nativeCurrencySymbol ?? chainName,
              symbol: nativeCurrencySymbol ?? 'ETH',
              decimals: 18,
            },
            rpcUrls: [rpcUrl],
          },
        ],
      })
    } catch {
      // Ignore; some wallets block programmatic adds.
    }
  }
}

export function Executor({ request }: { request: EarnoWebRequestV1 }) {
  const [account, setAccount] = useState<`0x${string}` | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [sending, setSending] = useState(false)
  const [bundleId, setBundleId] = useState<`0x${string}` | null>(null)
  const [callsStatus, setCallsStatus] = useState<CallsStatus | null>(null)
  const [txHashes, setTxHashes] = useState<`0x${string}`[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null)
  const [ackRisks, setAckRisks] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [simulation, setSimulation] = useState<
    Array<{ label: string; ok: boolean; error?: string }>
  >([])

  const [walletId, setWalletId] = useState<'porto' | 'injected'>('porto')

  const chain = useMemo(() => findEarnoChainById(request.chainId), [request.chainId])
  const rpcUrl = request.rpcUrl ?? chain?.rpcUrls[0] ?? EARNO_DEFAULT_CHAIN.rpcUrls[0]
  const chainIdHex = useMemo(() => chainIdToHex(request.chainId), [request.chainId])
  const chainName = chain?.name ?? `Chain ${request.chainId}`
  const nativeCurrencySymbol = chain?.nativeCurrency.symbol ?? 'ETH'

  const porto = useMemo(() => {
    return Porto.create({
      chains: [
        {
          id: request.chainId,
          name: chainName,
          nativeCurrency: { name: nativeCurrencySymbol, symbol: nativeCurrencySymbol, decimals: 18 },
          rpcUrls: { default: { http: [rpcUrl] } },
        },
      ],
      transports: {
        [request.chainId]: http(rpcUrl),
      },
    })
  }, [chainName, nativeCurrencySymbol, request.chainId, rpcUrl])

  const injectedProvider = useMemo<Eip1193Provider | null>(() => {
    const eth = (globalThis as unknown as { ethereum?: unknown }).ethereum
    if (!eth || typeof eth !== 'object') return null
    const p = eth as Partial<Eip1193Provider>
    if (typeof p.request !== 'function') return null
    return p as Eip1193Provider
  }, [])

  const provider = useMemo<Eip1193Provider>(() => {
    return walletId === 'injected' && injectedProvider ? injectedProvider : (porto.provider as Eip1193Provider)
  }, [injectedProvider, porto.provider, walletId])

  const senderMismatch =
    request.sender && account ? request.sender.toLowerCase() !== account.toLowerCase() : false

  const allowlistSet = useMemo(() => {
    const allowlist = request.constraints?.allowlistContracts
    if (!allowlist || allowlist.length === 0) return null
    return new Set(allowlist.map((a) => a.toLowerCase()))
  }, [request.constraints?.allowlistContracts])
  const allowlistViolations = useMemo(() => {
    if (!allowlistSet) return []
    const unique = new Map<string, `0x${string}`>()
    for (const call of request.calls) {
      const key = call.to.toLowerCase()
      if (!allowlistSet.has(key)) unique.set(key, call.to)
    }
    return Array.from(unique.values())
  }, [allowlistSet, request.calls])
  const unlimitedApproveCalls = useMemo(() => {
    const labels: string[] = []
    for (const call of request.calls) {
      const amount = readApproveAmount(call.data)
      if (amount === null) continue
      if (amount === MAX_UINT256) labels.push(call.label)
    }
    return labels
  }, [request.calls])

  const needsRiskAck = !allowlistSet || unlimitedApproveCalls.length > 0

  useEffect(() => {
    setAckRisks(false)
    setSimulation([])
  }, [request])

  const connect = useCallback(async () => {
    setError(null)
    setConnecting(true)
    try {
      const accounts = (await provider.request({
        method: 'eth_requestAccounts',
      })) as string[]
      const first = accounts[0]
      if (!first) throw new Error('No account returned by wallet')
      setAccount(first as `0x${string}`)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to connect'
      setError(message)
    } finally {
      setConnecting(false)
    }
  }, [provider])

  const simulateCalls = useCallback(async () => {
    setError(null)
    setSimulating(true)
    setSimulation([])
    try {
      const client = createPublicClient({
        transport: http(rpcUrl),
      })

      const from = (account ?? request.sender ?? undefined) as `0x${string}` | undefined

      const results: Array<{ label: string; ok: boolean; error?: string }> = []
      for (const call of request.calls) {
        try {
          await client.call({
            ...(from ? { account: from } : {}),
            to: call.to,
            data: call.data,
            ...(call.valueWei ? { value: BigInt(call.valueWei) } : {}),
          })
          results.push({ label: call.label, ok: true })
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Simulation failed'
          results.push({ label: call.label, ok: false, error: message })
        }
      }
      setSimulation(results)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Simulation failed'
      setError(message)
    } finally {
      setSimulating(false)
    }
  }, [account, provider, request.calls, request.sender, rpcUrl])

  const sendCalls = useCallback(async () => {
    setError(null)
    setSending(true)
    setCallsStatus(null)
    setBundleId(null)
    setTxHashes(null)
    try {
      if (allowlistViolations.length > 0) {
        throw new Error('This request includes calls to contracts outside the allowlist')
      }
      if (needsRiskAck && !ackRisks) {
        throw new Error('Acknowledge the security warnings before executing')
      }

      await ensureWalletOnChain({
        provider,
        chainIdHex,
        chainName,
        rpcUrl,
        nativeCurrencySymbol,
      })

      const activeAccount =
        account ??
        (((await provider.request({
          method: 'eth_accounts',
        })) as string[])[0] as `0x${string}` | undefined)

      if (!activeAccount) {
        await connect()
        return
      }
      if (request.sender && request.sender.toLowerCase() !== activeAccount.toLowerCase()) {
        throw new Error(
          `Connected wallet ${shortAddress(activeAccount)} does not match expected sender ${shortAddress(
            request.sender,
          )}`,
        )
      }

      const calls = request.calls.map((c) => ({
        to: c.to,
        data: c.data,
        ...(c.valueWei ? { value: weiDecimalToHex(c.valueWei) } : {}),
      }))

      try {
        const result = (await provider.request({
          method: 'wallet_sendCalls',
          params: [
            {
              version: '2.0.0',
              from: activeAccount,
              chainId: chainIdHex,
              calls,
            },
          ],
        })) as { id: `0x${string}` }
        setBundleId(result.id)
        return
      } catch (e) {
        const message = e instanceof Error ? e.message : 'wallet_sendCalls failed'
        // Fallback: send each call individually.
        if (!/wallet_sendCalls|Method not found|does not exist|unsupported/i.test(message)) {
          throw e
        }
      }

      const hashes: `0x${string}`[] = []
      const publicClient = createPublicClient({ transport: http(rpcUrl) })
      for (const call of calls) {
        const hash = (await provider.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from: activeAccount,
              to: call.to,
              data: call.data,
              ...(call.value ? { value: call.value } : {}),
            },
          ],
        })) as `0x${string}`
        hashes.push(hash)
        setTxHashes([...hashes])
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status === 'reverted') throw new Error(`Transaction reverted: ${hash}`)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to send'
      setError(message)
    } finally {
      setSending(false)
    }
  }, [
    account,
    ackRisks,
    allowlistViolations.length,
    chainIdHex,
    chainName,
    connect,
    needsRiskAck,
    nativeCurrencySymbol,
    provider,
    request.calls,
    request.sender,
    rpcUrl,
  ])

  const polling = useRef(false)
  useEffect(() => {
    if (!bundleId) return
    if (polling.current) return
    polling.current = true

    let canceled = false
    const run = async () => {
      while (!canceled) {
        try {
          const status = (await provider.request({
            method: 'wallet_getCallsStatus',
            params: [bundleId],
          })) as CallsStatus
          setCallsStatus(status)
          if (status.status !== 100) break
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Failed to fetch status'
          setError(message)
          break
        }
        await new Promise((r) => setTimeout(r, 1000))
      }
    }

    void run()
    return () => {
      canceled = true
      polling.current = false
    }
  }, [bundleId, provider])

  const callbackSent = useRef(false)
  useEffect(() => {
    if (!request.callback) return
    if (callbackSent.current) return

    const hashes =
      txHashes ??
      (callsStatus && Array.isArray(callsStatus.receipts)
        ? (callsStatus.receipts
            .map((r) => (r as { transactionHash?: `0x${string}` }).transactionHash)
            .filter(Boolean) as `0x${string}`[])
        : null)

    if (!hashes || hashes.length === 0) return
    if (txHashes && txHashes.length < request.calls.length) return

    const primary = hashes[hashes.length - 1]!
    const url = buildCallbackUrl(request.callback.url, {
      state: request.callback.state,
      txHash: primary,
      txHashes: hashes.join(','),
      bundleId: bundleId ?? undefined,
      status: callsStatus ? String(callsStatus.status) : undefined,
    })

    callbackSent.current = true
    setCallbackUrl(url)

    // Use navigation instead of fetch to avoid https→http localhost mixed-content issues.
    setTimeout(() => {
      window.location.assign(url)
    }, 500)
  }, [bundleId, callsStatus, request.callback, txHashes])

  const totalValue = useMemo(() => {
    let total = 0n
    for (const call of request.calls) {
      if (!call.valueWei) continue
      total += BigInt(call.valueWei)
    }
    return total
  }, [request.calls])

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium text-zinc-200">{request.title}</div>
        <div className="text-sm text-zinc-400">
          Chain <span className="text-zinc-200">{chainName}</span> ·{' '}
          <span className="text-zinc-200">{request.chainId}</span> · {request.calls.length} call
          {request.calls.length === 1 ? '' : 's'} ·{' '}
          <span className="text-zinc-200">{formatEther(totalValue)}</span> {nativeCurrencySymbol} total value
        </div>
        <div className="text-xs text-zinc-500">
          RPC <span className="font-mono text-zinc-300">{rpcUrl}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {!allowlistSet ? (
          <div className="rounded-md border border-amber-900/60 bg-amber-950/30 p-3 text-sm text-amber-200">
            No contract allowlist provided. Only execute if you trust the source of this link.
          </div>
        ) : null}

        {allowlistViolations.length > 0 ? (
          <div className="rounded-md border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
            This request includes calls to contracts outside the allowlist:{' '}
            <span className="font-mono text-xs">{allowlistViolations.join(', ')}</span>
          </div>
        ) : null}

        {unlimitedApproveCalls.length > 0 ? (
          <div className="rounded-md border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
            Unlimited token approval detected ({unlimitedApproveCalls.join(', ')}). Double-check spender + contract.
          </div>
        ) : null}

        <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-200">
          <div className="flex flex-col gap-2">
            {request.calls.map((call, i) => (
              <div
                key={`${call.to}-${i}`}
                className={`flex flex-col gap-1 rounded-md p-2 ${
                  allowlistSet && !allowlistSet.has(call.to.toLowerCase())
                    ? 'border border-red-900/60 bg-red-950/20'
                    : 'border border-transparent'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-zinc-100">{call.label}</div>
                  <div className="text-zinc-400">{shortAddress(call.to)}</div>
                </div>
                <div className="text-zinc-400">
                  {call.valueWei
                    ? `${formatEther(BigInt(call.valueWei))} ${nativeCurrencySymbol} value`
                    : `0 ${nativeCurrencySymbol} value`}
                </div>
                {call.valueWei && BigInt(call.valueWei) > 0n ? (
                  <div className="text-amber-300">Native value transfer</div>
                ) : null}
                {call.data.startsWith(APPROVE_SELECTOR) ? (
                  <div className="text-amber-300">Token approval</div>
                ) : null}
                {readApproveAmount(call.data) === MAX_UINT256 ? (
                  <div className="text-red-300">Unlimited approval</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setWalletId('porto')}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                walletId === 'porto' ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-900 text-zinc-200'
              }`}
            >
              Porto
            </button>
            <button
              type="button"
              onClick={() => setWalletId('injected')}
              disabled={!injectedProvider}
              className={`rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60 ${
                walletId === 'injected' ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-900 text-zinc-200'
              }`}
            >
              Injected
            </button>
          </div>
          <button
            type="button"
            onClick={connect}
            disabled={connecting}
            className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-60"
          >
            {account
              ? `Connected: ${shortAddress(account)}`
              : connecting
                ? 'Connecting…'
                : `Connect ${walletId === 'porto' ? 'Porto' : 'Wallet'}`}
          </button>
          <button
            type="button"
            onClick={simulateCalls}
            disabled={simulating}
            className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-60"
          >
            {simulating ? 'Simulating…' : 'Simulate'}
          </button>
          <button
            type="button"
            onClick={sendCalls}
            disabled={
              sending ||
              senderMismatch ||
              allowlistViolations.length > 0 ||
              (needsRiskAck && !ackRisks)
            }
            className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-emerald-950 disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Execute'}
          </button>
          {senderMismatch ? (
            <div className="text-sm text-red-300">
              Expected sender {request.sender ? shortAddress(request.sender) : ''}.
            </div>
          ) : null}
        </div>

        {needsRiskAck && allowlistViolations.length === 0 ? (
          <label className="flex items-start gap-2 text-sm text-zinc-200">
            <input
              type="checkbox"
              className="mt-1"
              checked={ackRisks}
              onChange={(e) => setAckRisks(e.target.checked)}
            />
            <span>I understand the warnings above and want to proceed.</span>
          </label>
        ) : null}

        {error ? (
          <div className="rounded-md border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {simulation.length > 0 ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3 text-sm text-zinc-200">
            <div className="text-zinc-400">Preflight simulation</div>
            <div className="mt-2 flex flex-col gap-2">
              {simulation.map((r) => (
                <div key={r.label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-zinc-100">{r.label}</div>
                    <div className={r.ok ? 'text-emerald-300' : 'text-red-300'}>
                      {r.ok ? 'OK' : 'Failed'}
                    </div>
                  </div>
                  {!r.ok && r.error ? (
                    <div className="break-words font-mono text-xs text-red-200">{r.error}</div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-zinc-500">
              Simulation uses <span className="font-mono">{rpcUrl}</span>. Calls are simulated independently, so later
              steps may fail if they depend on earlier steps.
            </div>
          </div>
        ) : null}

        {callbackUrl ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3 text-sm text-zinc-200">
            <div className="text-zinc-400">Returning to CLI</div>
            <a
              href={callbackUrl}
              className="mt-2 block break-all font-mono text-xs text-emerald-300 underline"
            >
              {callbackUrl}
            </a>
          </div>
        ) : null}

        {bundleId ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3 text-sm text-zinc-200">
            <div className="text-zinc-400">Call bundle</div>
            <div className="mt-1 break-all font-mono text-xs">{bundleId}</div>
            {callsStatus ? (
              <div className="mt-3 text-sm">
                Status: <span className="text-zinc-100">{statusLabel(callsStatus.status)}</span>
              </div>
            ) : (
              <div className="mt-3 text-sm text-zinc-400">Fetching status…</div>
            )}
            {callsStatus && Array.isArray(callsStatus.receipts) ? (
              <div className="mt-3 flex flex-col gap-1">
                <div className="text-zinc-400">Transactions</div>
                {callsStatus.receipts.map((r, i) => (
                  <div key={i} className="break-all font-mono text-xs text-zinc-200">
                    {r.transactionHash ?? '(missing hash)'}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {txHashes ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3 text-sm text-zinc-200">
            <div className="text-zinc-400">Transactions (fallback)</div>
            <div className="mt-2 flex flex-col gap-1">
              {txHashes.map((h) => (
                <div key={h} className="break-all font-mono text-xs">
                  {h}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
