import { type Abi } from 'viem'

/**
 * USDT0 deployments per chain.
 *
 * Ethereum uses the OFT_ADAPTER pattern (locks USDT, mints USDT0 on destination).
 * All other chains use native OFT (burn/mint directly on the USDT0 token contract).
 */
export type Usdt0Deployment = {
  /** OFT or OFT_ADAPTER contract address (the contract you call send() on) */
  oft: `0x${string}`
  /** The token address for balance checks (USDT on Ethereum, USDT0 on others) */
  token: `0x${string}`
  decimals: number
  /** True for Ethereum where OFT_ADAPTER wraps native USDT */
  isAdapter: boolean
  /** LayerZero V2 endpoint ID */
  eid: number
}

export const USDT0_DEPLOYMENTS: Record<string, Usdt0Deployment> = {
  ethereum: {
    oft: '0x6C96dE32CEa08842dcc4058c14d3aaAD7Fa41dee', // OFT_ADAPTER
    token: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // native USDT
    decimals: 6,
    isAdapter: true,
    eid: 30101,
  },
  arbitrum: {
    oft: '0x14E4A1B13bf7F943c8ff7C51fb60FA964A298D92', // OFT proxy
    token: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT0 token
    decimals: 6,
    isAdapter: false,
    eid: 30110,
  },
  optimism: {
    oft: '0xF03b4d9AC1D5d1E7c4cEf54C2A313b9fe051A0aD', // OFT proxy
    token: '0x01bFF41798a0BcF287b996046Ca68b395DbC1071', // USDT0 token
    decimals: 6,
    isAdapter: false,
    eid: 30111,
  },
  berachain: {
    oft: '0x3Dc96399109df5ceb2C226664A086140bD0379cB', // OFT proxy
    token: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736', // USDT0 token
    decimals: 6,
    isAdapter: false,
    eid: 30362,
  },
} as const

export const SUPPORTED_CHAINS = Object.keys(USDT0_DEPLOYMENTS)

export function getDeployment(chainKey: string): Usdt0Deployment | undefined {
  return USDT0_DEPLOYMENTS[chainKey.toLowerCase()]
}

/** LayerZero OFT interface — quoteSend + send */
export const OFT_ABI = [
  {
    name: 'quoteSend',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      {
        name: '_sendParam',
        type: 'tuple',
        components: [
          { name: 'dstEid', type: 'uint32' },
          { name: 'to', type: 'bytes32' },
          { name: 'amountLD', type: 'uint256' },
          { name: 'minAmountLD', type: 'uint256' },
          { name: 'extraOptions', type: 'bytes' },
          { name: 'composeMsg', type: 'bytes' },
          { name: 'oftCmd', type: 'bytes' },
        ],
      },
      { name: '_payInLzToken', type: 'bool' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'nativeFee', type: 'uint256' },
          { name: 'lzTokenFee', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'send',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: '_sendParam',
        type: 'tuple',
        components: [
          { name: 'dstEid', type: 'uint32' },
          { name: 'to', type: 'bytes32' },
          { name: 'amountLD', type: 'uint256' },
          { name: 'minAmountLD', type: 'uint256' },
          { name: 'extraOptions', type: 'bytes' },
          { name: 'composeMsg', type: 'bytes' },
          { name: 'oftCmd', type: 'bytes' },
        ],
      },
      {
        name: '_fee',
        type: 'tuple',
        components: [
          { name: 'nativeFee', type: 'uint256' },
          { name: 'lzTokenFee', type: 'uint256' },
        ],
      },
      { name: '_refundAddress', type: 'address' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'guid', type: 'bytes32' },
          { name: 'nonce', type: 'uint64' },
          {
            name: 'fee',
            type: 'tuple',
            components: [
              { name: 'nativeFee', type: 'uint256' },
              { name: 'lzTokenFee', type: 'uint256' },
            ],
          },
        ],
      },
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'amountSentLD', type: 'uint256' },
          { name: 'amountReceivedLD', type: 'uint256' },
        ],
      },
    ],
  },
] satisfies Abi

/** Standard ERC20 subset for balance + approve */
export const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] satisfies Abi
