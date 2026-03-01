import { BERA_CHEF, REWARD_VAULT_FACTORY } from './contracts.js'

export function isZeroAddress(addr: string): boolean {
  return addr.toLowerCase() === '0x0000000000000000000000000000000000000000'
}

export async function resolveRewardVault(args: {
  client: any
  stakingToken: `0x${string}`
}): Promise<`0x${string}` | null> {
  const factoryAddr = (await args.client.readContract({
    address: BERA_CHEF.address,
    abi: BERA_CHEF.abi,
    functionName: 'factory',
  })) as `0x${string}`

  const rewardVaultAddr = (await args.client.readContract({
    address: factoryAddr,
    abi: REWARD_VAULT_FACTORY.abi,
    functionName: 'getVault',
    args: [args.stakingToken],
  })) as `0x${string}`

  return isZeroAddress(rewardVaultAddr) ? null : rewardVaultAddr
}

