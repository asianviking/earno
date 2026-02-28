import { z } from 'incur'
import { createPublicClient, formatEther, http, parseEther } from 'viem'
import { BERACHAIN, SWBERA } from '../contracts.js'

const berachain = {
  id: BERACHAIN.id,
  name: 'Berachain',
  nativeCurrency: { name: 'BERA', symbol: 'BERA', decimals: 18 },
  rpcUrls: { default: { http: [BERACHAIN.rpc] } },
} as const

export const balance = {
  description: 'Check sWBERA balance and underlying BERA value',
  options: z.object({
    address: z.string().describe('Wallet address to check'),
  }),
  env: z.object({
    BEARN_RPC: z
      .string()
      .optional()
      .describe(
        `Berachain RPC URL (default: ${BERACHAIN.rpc})`,
      ),
  }),
  examples: [
    {
      options: { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
      description: 'Check sWBERA balance for an address',
    },
  ],
  async run(c: any) {
    const { address } = c.options
    const rpc = c.env.BEARN_RPC ?? BERACHAIN.rpc

    const client = createPublicClient({
      chain: { ...berachain, rpcUrls: { default: { http: [rpc] } } },
      transport: http(rpc),
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

    const exchangeRate =
      totalSupply > 0n
        ? Number(formatEther(totalAssets)) / Number(formatEther(totalSupply))
        : 1

    return c.ok(
      {
        address,
        sWBERA: formatEther(shares),
        underlyingBERA: formatEther(underlyingBera),
        exchangeRate: `1 sWBERA = ${exchangeRate.toFixed(4)} BERA`,
        totalVaultAssets: `${formatEther(totalAssets)} WBERA`,
      },
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
} as const
