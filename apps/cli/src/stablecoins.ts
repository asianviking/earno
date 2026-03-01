export type StablecoinFamily = 'USDC' | 'USDT'

export type StablecoinVariant = {
  family: StablecoinFamily
  symbol: string
  aliases?: string[]
  address: `0x${string}`
  decimals: number
}

export const STABLECOIN_VARIANTS_BY_CHAIN_ID: Record<number, StablecoinVariant[]> = {
  // Ethereum
  1: [
    {
      family: 'USDC',
      symbol: 'USDC',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
    },
    {
      family: 'USDT',
      symbol: 'USDT',
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
    },
  ],

  // Base
  8453: [
    {
      family: 'USDC',
      symbol: 'USDC',
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
    },
    {
      family: 'USDC',
      symbol: 'USDbC',
      address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
      decimals: 6,
    },
    {
      family: 'USDT',
      symbol: 'USDT',
      address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
      decimals: 6,
    },
  ],

  // Optimism
  10: [
    {
      family: 'USDC',
      symbol: 'USDC',
      address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      decimals: 6,
    },
    {
      family: 'USDC',
      symbol: 'USDC.e',
      address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
      decimals: 6,
    },
    {
      family: 'USDT',
      symbol: 'USDT',
      address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
      decimals: 6,
    },
    {
      family: 'USDT',
      symbol: 'USDT0',
      address: '0x01bFF41798a0BcF287b996046Ca68b395DbC1071',
      decimals: 6,
    },
  ],

  // Arbitrum One
  42161: [
    {
      family: 'USDC',
      symbol: 'USDC',
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      decimals: 6,
    },
    {
      family: 'USDC',
      symbol: 'USDC.e',
      address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
      decimals: 6,
    },
    {
      family: 'USDT',
      symbol: 'USDT0',
      aliases: ['USDT'],
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      decimals: 6,
    },
  ],

  // Berachain
  80094: [
    {
      family: 'USDC',
      symbol: 'USDC.e',
      address: '0x549943e04f40284185054145c6E4e9568C1D3241',
      decimals: 6,
    },
    {
      family: 'USDT',
      symbol: 'USDT0',
      aliases: ['USDT'],
      address: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
      decimals: 6,
    },
  ],
}
