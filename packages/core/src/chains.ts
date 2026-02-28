export type EarnoChain = {
  id: number
  key: string
  name: string
  nativeCurrency: {
    name: string
    symbol: string
    decimals: number
  }
  rpcUrls: string[]
}

export const BERACHAIN_MAINNET: EarnoChain = {
  id: 80094,
  key: 'berachain',
  name: 'Berachain',
  nativeCurrency: { name: 'BERA', symbol: 'BERA', decimals: 18 },
  rpcUrls: ['https://rpc.berachain.com/'],
} as const

export const EARNO_DEFAULT_CHAIN = BERACHAIN_MAINNET

export const EARNO_CHAINS: EarnoChain[] = [BERACHAIN_MAINNET]

export function findEarnoChainById(chainId: number): EarnoChain | undefined {
  return EARNO_CHAINS.find((c) => c.id === chainId)
}

export function findEarnoChainByKey(key: string): EarnoChain | undefined {
  const lower = key.toLowerCase()
  return EARNO_CHAINS.find((c) => c.key === lower)
}

