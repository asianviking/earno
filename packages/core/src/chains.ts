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

export const ETHEREUM_MAINNET: EarnoChain = {
  id: 1,
  key: 'ethereum',
  name: 'Ethereum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://cloudflare-eth.com'],
} as const

export const BASE_MAINNET: EarnoChain = {
  id: 8453,
  key: 'base',
  name: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://mainnet.base.org'],
} as const

export const OPTIMISM_MAINNET: EarnoChain = {
  id: 10,
  key: 'optimism',
  name: 'Optimism',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://mainnet.optimism.io'],
} as const

export const ARBITRUM_ONE: EarnoChain = {
  id: 42161,
  key: 'arbitrum',
  name: 'Arbitrum One',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://arb1.arbitrum.io/rpc'],
} as const

export const BERACHAIN_MAINNET: EarnoChain = {
  id: 80094,
  key: 'berachain',
  name: 'Berachain',
  nativeCurrency: { name: 'BERA', symbol: 'BERA', decimals: 18 },
  rpcUrls: ['https://rpc.berachain.com/'],
} as const

export const EARNO_DEFAULT_CHAIN = ETHEREUM_MAINNET

export const EARNO_CHAINS: EarnoChain[] = [
  ETHEREUM_MAINNET,
  BASE_MAINNET,
  OPTIMISM_MAINNET,
  ARBITRUM_ONE,
  BERACHAIN_MAINNET,
]

export function findEarnoChainById(chainId: number): EarnoChain | undefined {
  return EARNO_CHAINS.find((c) => c.id === chainId)
}

export function findEarnoChainByKey(key: string): EarnoChain | undefined {
  const lower = key.toLowerCase()
  return EARNO_CHAINS.find((c) => c.key === lower)
}
