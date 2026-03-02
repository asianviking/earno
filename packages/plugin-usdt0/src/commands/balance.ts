import { z } from 'incur'
import { createPublicClient, formatUnits, getAddress, http } from 'viem'
import { findEarnoChainByKey } from '@earno/core/chains'
import { USDT0_DEPLOYMENTS, ERC20_ABI, SUPPORTED_CHAINS } from '../contracts.js'

export const balance = {
  description: 'Check USDT0 balance across all supported chains',
  args: z.object({}),
  options: z.object({
    address: z
      .string()
      .describe('Wallet address to check'),
    chain: z
      .string()
      .optional()
      .describe('Check a single chain only (default: all)'),
  }),
  examples: [
    {
      args: {},
      options: { address: '0xYourAddress' },
      description: 'Check USDT0 balance across all chains',
    },
    {
      args: {},
      options: { address: '0xYourAddress', chain: 'berachain' },
      description: 'Check USDT0 balance on Berachain only',
    },
  ],
  async run(c: any) {
    let address: string
    try {
      address = getAddress(c.options.address as string)
    } catch {
      return c.error({
        code: 'INVALID_ADDRESS',
        message: 'Invalid address. Provide a valid EVM address.',
        retryable: true,
      })
    }
    const singleChain = c.options.chain as string | undefined

    if (!address || address === '0xYOUR_ADDRESS') {
      return c.error({
        code: 'MISSING_ADDRESS',
        message: 'Specify --address with your wallet address',
        retryable: true,
      })
    }

    const chainsToCheck = singleChain
      ? { [singleChain.toLowerCase()]: USDT0_DEPLOYMENTS[singleChain.toLowerCase()] }
      : USDT0_DEPLOYMENTS

    const results: Record<string, { balance: string; raw: string }> = {}
    const errors: Record<string, string> = {}

    const entries = Object.entries(chainsToCheck).filter(([, d]) => d !== undefined)

    await Promise.all(
      entries.map(async ([chainKey, deployment]) => {
        if (!deployment) return

        const chain = findEarnoChainByKey(chainKey)
        const rpcUrl = chain?.rpcUrls[0]
        if (!rpcUrl) {
          errors[chainKey] = 'No RPC URL configured'
          return
        }

        try {
          const client = createPublicClient({ transport: http(rpcUrl) })
          const raw = (await client.readContract({
            address: deployment.token,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address as `0x${string}`],
          })) as bigint

          const label = deployment.isAdapter ? 'USDT' : 'USDT0'
          results[chainKey] = {
            balance: `${formatUnits(raw, deployment.decimals)} ${label}`,
            raw: raw.toString(),
          }
        } catch (e) {
          errors[chainKey] = e instanceof Error ? e.message : 'RPC call failed'
        }
      }),
    )

    if (singleChain && !chainsToCheck[singleChain.toLowerCase()]) {
      return c.error({
        code: 'UNSUPPORTED_CHAIN',
        message: `USDT0 not supported on '${singleChain}'. Supported: ${SUPPORTED_CHAINS.join(', ')}`,
        retryable: true,
      })
    }

    return c.ok({
      address,
      balances: results,
      ...(Object.keys(errors).length > 0 ? { errors } : {}),
    })
  },
}
