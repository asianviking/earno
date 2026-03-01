import { formatEther } from 'viem'

export function formatSwberaBalanceSummary(args: {
  address: string
  shares: bigint
  underlyingBera: bigint
  totalAssets: bigint
  totalSupply: bigint
}): {
  address: string
  sWBERA: string
  underlyingBERA: string
  exchangeRate: string
  totalVaultAssets: string
} {
  const { address, shares, underlyingBera, totalAssets, totalSupply } = args

  const exchangeRate =
    totalSupply > 0n
      ? Number(formatEther(totalAssets)) / Number(formatEther(totalSupply))
      : 1

  return {
    address,
    sWBERA: formatEther(shares),
    underlyingBERA: formatEther(underlyingBera),
    exchangeRate: `1 sWBERA = ${exchangeRate.toFixed(4)} BERA`,
    totalVaultAssets: `${formatEther(totalAssets)} WBERA`,
  }
}

