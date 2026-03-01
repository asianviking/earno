import { z } from 'incur'
import { createPublicClient, formatEther, formatUnits, http, erc20Abi } from 'viem'
import {
  BGT,
  BERA_CHEF,
  BERACHAIN,
  HONEY,
  RE7_HONEY_VAULT,
  REWARD_VAULT,
  REWARD_VAULT_FACTORY,
  SWBERA,
  USDC_E,
  USDT0,
} from '../contracts.js'
import { formatSwberaBalanceSummary } from '../balance-format.js'
import { resolveCliChain } from '../chain.js'

export const balance = {
  description:
    'Check Berachain balances (BERA, sWBERA, HONEY, USDT0, USDC.e, BGT) and pending BGT',
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
    EARNO_RPC: z
      .string()
      .optional()
      .describe(`RPC URL (default: ${BERACHAIN.rpc})`),
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
        message: `balance is Berachain-only (chainId ${BERACHAIN.id})`,
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

    const wallet = address as `0x${string}`

    const [beraBalanceWei, shares, totalAssets, totalSupply, honeyBal, usdtBal, usdcBal, bgtBal] =
      await Promise.all([
        client.getBalance({ address: wallet }),
        client.readContract({
          address: SWBERA.address,
          abi: SWBERA.abi,
          functionName: 'balanceOf',
          args: [wallet],
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
        client.readContract({
          address: HONEY.address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [wallet],
        }) as Promise<bigint>,
        client.readContract({
          address: USDT0.address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [wallet],
        }) as Promise<bigint>,
        client.readContract({
          address: USDC_E.address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [wallet],
        }) as Promise<bigint>,
        client.readContract({
          address: BGT.address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [wallet],
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

    let pendingBgt: bigint | null = null
    let re7StakedShares: bigint | null = null
    try {
      const factoryAddr = (await client.readContract({
        address: BERA_CHEF.address,
        abi: BERA_CHEF.abi,
        functionName: 'factory',
      })) as `0x${string}`

      const rewardVaultAddr = (await client.readContract({
        address: factoryAddr,
        abi: REWARD_VAULT_FACTORY.abi,
        functionName: 'getVault',
        args: [RE7_HONEY_VAULT.address],
      })) as `0x${string}`

      if (rewardVaultAddr && rewardVaultAddr !== '0x0000000000000000000000000000000000000000') {
        ;[pendingBgt, re7StakedShares] = (await Promise.all([
          client.readContract({
            address: rewardVaultAddr,
            abi: REWARD_VAULT.abi,
            functionName: 'earned',
            args: [wallet],
          }) as Promise<bigint>,
          client.readContract({
            address: rewardVaultAddr,
            abi: REWARD_VAULT.abi,
            functionName: 'balanceOf',
            args: [wallet],
          }) as Promise<bigint>,
        ])) as [bigint, bigint]
      }
    } catch {
      pendingBgt = null
      re7StakedShares = null
    }

    const swbera = formatSwberaBalanceSummary({
      address,
      shares,
      underlyingBera,
      totalAssets,
      totalSupply,
    })

    const ctaCommands: Array<{ command: string; description: string }> = []
    if (shares > 0n) {
      ctaCommands.push({
        command: `bera withdraw ${formatEther(shares)} --from swbera --receiver ${address}`,
        description: 'Withdraw your sWBERA',
      })
    } else {
      ctaCommands.push(
        {
          command: `bera deposit 1.0 --into swbera --receiver ${address}`,
          description: 'Deposit BERA into sWBERA',
        },
        {
          command: `bera deposit 1.0 --into honey --receiver ${address} --sender ${address}`,
          description: 'Deposit HONEY into Bend (auto-stake for BGT)',
        },
      )
    }

    if (pendingBgt !== null && pendingBgt > 0n) {
      ctaCommands.push({
        command: `bera claim --sender ${address}`,
        description: 'Claim your pending BGT',
      })
    }

    return c.ok(
      {
        ...swbera,
        BERA: formatEther(beraBalanceWei),
        HONEY: formatUnits(honeyBal, HONEY.decimals),
        USDT0: formatUnits(usdtBal, USDT0.decimals),
        'USDC.e': formatUnits(usdcBal, USDC_E.decimals),
        BGT: formatUnits(bgtBal, BGT.decimals),
        ...(pendingBgt !== null ? { pendingBGT: formatEther(pendingBgt) } : {}),
        ...(re7StakedShares !== null
          ? { re7HoneyVaultSharesStaked: formatEther(re7StakedShares) }
          : {}),
      },
      {
        cta: {
          commands: ctaCommands,
        },
      },
    )
  },
}
