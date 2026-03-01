import { Cli, z } from 'incur'
import { parseEther } from 'viem'
import {
  EARNO_DEFAULT_CHAIN,
  findEarnoChainById,
  findEarnoChainByKey,
  type EarnoChain,
} from '@earno/core/chains'
import { buildExecutorUrl, type EarnoWebRequestV1 } from '@earno/core/earnoRequest'

function parseChainSelector(selector: string): { kind: 'id'; id: number } | { kind: 'key'; key: string } {
  const trimmed = selector.trim()
  const asNumber = Number(trimmed)
  if (Number.isFinite(asNumber) && Number.isInteger(asNumber) && asNumber > 0) {
    return { kind: 'id', id: asNumber }
  }
  return { kind: 'key', key: trimmed }
}

function resolveChain(args: {
  chain?: string
  rpcUrl?: string
  env?: { EARNO_CHAIN?: string; EARNO_RPC?: string }
}): { chain: EarnoChain; rpcUrl: string } {
  const selector = args.chain ?? args.env?.EARNO_CHAIN
  let chain: EarnoChain | undefined

  if (!selector) {
    chain = EARNO_DEFAULT_CHAIN
  } else {
    const parsed = parseChainSelector(selector)
    if (parsed.kind === 'id') {
      chain =
        findEarnoChainById(parsed.id) ??
        ({
          id: parsed.id,
          key: `chain-${parsed.id}`,
          name: `Chain ${parsed.id}`,
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [],
        } satisfies EarnoChain)
    } else {
      chain = findEarnoChainByKey(parsed.key)
      if (!chain) throw new Error(`Unknown chain '${parsed.key}'`)
    }
  }

  const rpcUrl = args.rpcUrl ?? args.env?.EARNO_RPC ?? chain.rpcUrls[0]
  if (!rpcUrl) {
    throw new Error(
      `Missing RPC URL for chainId ${chain.id}. Provide --rpc or set $EARNO_RPC.`,
    )
  }

  return { chain, rpcUrl }
}

const example = Cli.create('example', {
  description: 'Example strategies (demo plugin)',
}).command('send', {
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
    EARNO_CHAIN: z
      .string()
      .optional()
      .describe('Default chain key/chainId (default: ethereum)'),
    EARNO_RPC: z
      .string()
      .optional()
      .describe('RPC URL (default: chain default)'),
  }),
  async run(c: any) {
    const { amount } = c.args
    const to = c.options.to as string
    const webUrl = c.var?.webUrl ?? 'https://earno.sh'

    const { chain, rpcUrl } = resolveChain({
      chain: c.options.chain,
      rpcUrl: c.options.rpc,
      env: c.env,
    })

    const valueWei = parseEther(amount).toString()

    const req = {
      title: `Send ${amount} ${chain.nativeCurrency.symbol}`,
      chainId: chain.id,
      rpcUrl,
      sender: c.options.sender as `0x${string}` | undefined,
      receiver: to as `0x${string}`,
      intent: {
        plugin: '@earno/plugin-example',
        action: 'send',
        params: { amount, to, chainId: chain.id, rpcUrl },
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
        chainId: chain.id,
        rpcUrl,
        to,
        amount: `${amount} ${chain.nativeCurrency.symbol}`,
        executorUrl,
        portoLink: executorUrl,
        cast: `cast send ${to} --value ${amount}ether --rpc-url ${rpcUrl} --private-key $WALLET_PRIVATE_KEY`,
      },
      {
        cta: {
          commands: [
            {
              command: executorUrl,
              description: 'Open executorUrl',
            },
          ],
        },
      },
    )
  },
})

export const earnoPlugin = {
  id: '@earno/plugin-example',
  cli: example,
}

export default earnoPlugin
