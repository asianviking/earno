import { z } from 'incur'
import { createPublicClient, formatEther, http } from 'viem'
import { BERACHAIN, SWBERA } from '../contracts.js'
import { formatSwberaBalanceSummary } from '../balance-format.js'
import { resolveCliChain } from '../chain.js'

export const balance = {
  description: 'Check sWBERA balance and underlying BERA value',
  options: z.object({
    address: z.string().describe('Wallet address to check'),
    chain: z
      .string()
      .optional()
      .describe('Chain key or chainId (default: berachain)'),
    rpc: z
      .string()
      .optional()
      .describe('RPC URL override (default: $EARNO_RPC or chain default)'),
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
      .describe(
        `RPC URL (default: ${BERACHAIN.rpc})`,
      ),
    BEARN_RPC: z
      .string()
      .optional()
      .describe('Legacy alias for EARNO_RPC'),
  }),
  examples: [
    {
      options: { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
      description: 'Check sWBERA balance for an address',
    },
  ],
  async run(c: any) {
    const { address } = c.options
    let chainId = BERACHAIN.id
    let rpcUrl = c.env.EARNO_RPC ?? c.env.BEARN_RPC ?? BERACHAIN.rpc

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
        message: `balance is currently Berachain-only (chainId ${BERACHAIN.id})`,
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

    const [shares, totalAssets, totalSupply] = await Promise.all([
      client.readContract({
        address: SWBERA.address,
        abi: SWBERA.abi,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      }) as Promise<bigint>,
      client.readContract({
        address: SWBERA.address,
        abi: SWBERA.abi,
        functionName: 'totalAssets',
      }) as Promise<bigint>,
      client.readContract({
        address: SWBERA.address,
        abi: SWBERA.abi,
        functionName: 'totalSupply',
      }) as Promise<bigint>,
    ])

    let underlyingBera = 0n
    if (shares > 0n) {
      underlyingBera = (await client.readContract({
        address: SWBERA.address,
        abi: SWBERA.abi,
        functionName: 'convertToAssets',
        args: [shares],
      })) as bigint
    }

    return c.ok(
      formatSwberaBalanceSummary({
        address,
        shares,
        underlyingBera,
        totalAssets,
        totalSupply,
      }),
      {
        cta: {
          commands:
            shares > 0n
              ? [
                  {
                    command: `withdraw ${formatEther(shares)} --receiver ${address}`,
                    description: 'Withdraw your sWBERA',
                  },
                ]
              : [
                  {
                    command: `deposit 1.0 --receiver ${address}`,
                    description: 'Deposit BERA into sWBERA',
                  },
                ],
        },
      },
    )
  },
}
