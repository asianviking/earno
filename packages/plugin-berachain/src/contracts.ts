import { type Abi } from 'viem'
import { BERACHAIN_MAINNET } from '@earno/core/chains'

export const BERACHAIN = {
  id: BERACHAIN_MAINNET.id,
  rpc: BERACHAIN_MAINNET.rpcUrls[0],
} as const

export const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000' as const

export const WBERA = {
  address: '0x6969696969696969696969696969696969696969' as const,
  abi: [
    {
      name: 'deposit',
      type: 'function',
      stateMutability: 'payable',
      inputs: [],
      outputs: [],
    },
    {
      name: 'withdraw',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [{ name: 'amount', type: 'uint256' }],
      outputs: [],
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
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
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
  ] satisfies Abi,
}

export const SWBERA = {
  address: '0x118D2cEeE9785eaf70C15Cd74CD84c9f8c3EeC9a' as const,
  abi: [
    {
      type: 'function',
      name: 'depositNative',
      stateMutability: 'payable',
      inputs: [
        { name: 'assets', type: 'uint256' },
        { name: 'receiver', type: 'address' },
      ],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'redeem',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'shares', type: 'uint256' },
        { name: 'receiver', type: 'address' },
        { name: 'owner', type: 'address' },
      ],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'withdraw',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'assets', type: 'uint256' },
        { name: 'receiver', type: 'address' },
        { name: 'owner', type: 'address' },
      ],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'balanceOf',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'convertToAssets',
      stateMutability: 'view',
      inputs: [{ name: 'shares', type: 'uint256' }],
      outputs: [{ name: 'assets', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'totalAssets',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: 'assets', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'totalSupply',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: 'assets', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'getERC721WithdrawalRequestIds',
      stateMutability: 'view',
      inputs: [{ name: 'user', type: 'address' }],
      outputs: [{ name: '', type: 'uint256[]' }],
    },
    {
      type: 'function',
      name: 'getERC721WithdrawalRequestIds',
      stateMutability: 'view',
      inputs: [
        { name: 'user', type: 'address' },
        { name: 'offset', type: 'uint256' },
        { name: 'limit', type: 'uint256' },
      ],
      outputs: [{ name: 'ids', type: 'uint256[]' }],
    },
    {
      type: 'function',
      name: 'getERC721WithdrawalRequest',
      stateMutability: 'view',
      inputs: [{ name: 'requestId', type: 'uint256' }],
      outputs: [
        {
          name: '',
          type: 'tuple',
          components: [
            { name: 'assets', type: 'uint256' },
            { name: 'shares', type: 'uint256' },
            { name: 'requestTime', type: 'uint256' },
            { name: 'owner', type: 'address' },
            { name: 'receiver', type: 'address' },
          ],
        },
      ],
    },
    {
      type: 'function',
      name: 'withdrawalRequests721',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'address' }],
    },
  ] satisfies Abi,
}

export const SWBERA_WITHDRAWAL_REQUEST = {
  abi: [
    {
      type: 'function',
      name: 'WITHDRAWAL_COOLDOWN',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'getRequest',
      stateMutability: 'view',
      inputs: [{ name: 'requestId', type: 'uint256' }],
      outputs: [
        {
          name: '',
          type: 'tuple',
          components: [
            { name: 'assets', type: 'uint256' },
            { name: 'shares', type: 'uint256' },
            { name: 'requestTime', type: 'uint256' },
            { name: 'owner', type: 'address' },
            { name: 'receiver', type: 'address' },
          ],
        },
      ],
    },
    {
      type: 'function',
      name: 'burn',
      stateMutability: 'nonpayable',
      inputs: [{ name: 'requestId', type: 'uint256' }],
      outputs: [],
    },
  ] satisfies Abi,
} as const

export const USDC_E = {
  address: '0x549943e04f40284185054145c6e4e9568c1d3241' as const,
  decimals: 6,
} as const

export const USDT0 = {
  address: '0x779ded0c9e1022225f8e0630b35a9b54be713736' as const,
  decimals: 6,
} as const

export const HONEY = {
  address: '0xfcbd14dc51f0a4d49d5e53c2e0950e0bc26d0dce' as const,
  decimals: 18,
} as const

export const BGT = {
  address: '0x656b95E550C07a9ffe548bd4085c72418Ceb1dba' as const,
  decimals: 18,
  abi: [
    {
      type: 'function',
      name: 'redeem',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'receiver', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [],
    },
  ] satisfies Abi,
} as const

export const RE7_HONEY_VAULT = {
  address: '0x30BbA9CD9Eb8c95824aa42Faa1Bb397b07545bc1' as const,
  abi: [
    {
      type: 'function',
      name: 'deposit',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'assets', type: 'uint256' },
        { name: 'receiver', type: 'address' },
      ],
      outputs: [{ name: 'shares', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'withdraw',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'assets', type: 'uint256' },
        { name: 'receiver', type: 'address' },
        { name: 'owner', type: 'address' },
      ],
      outputs: [{ name: 'shares', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'previewDeposit',
      stateMutability: 'view',
      inputs: [{ name: 'assets', type: 'uint256' }],
      outputs: [{ name: 'shares', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'previewWithdraw',
      stateMutability: 'view',
      inputs: [{ name: 'assets', type: 'uint256' }],
      outputs: [{ name: 'shares', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'convertToShares',
      stateMutability: 'view',
      inputs: [{ name: 'assets', type: 'uint256' }],
      outputs: [{ name: 'shares', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'decimals',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'uint8' }],
    },
    {
      type: 'function',
      name: 'balanceOf',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'allowance',
      stateMutability: 'view',
      inputs: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
      ],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'approve',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
    },
  ] satisfies Abi,
} as const

export const BERA_CHEF = {
  // https://docs.berachain.com/validators/guides/manage-reward-allocations
  address: '0xdf960E8F3F19C481dDE769edEDD439ea1a63426a' as const,
  abi: [
    {
      type: 'function',
      name: 'factory',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'address' }],
    },
  ] satisfies Abi,
} as const

export const REWARD_VAULT_FACTORY = {
  abi: [
    {
      type: 'function',
      name: 'getVault',
      stateMutability: 'view',
      inputs: [{ name: 'stakingToken', type: 'address' }],
      outputs: [{ name: 'vault', type: 'address' }],
    },
  ] satisfies Abi,
} as const

export const REWARD_VAULT = {
  abi: [
    {
      type: 'function',
      name: 'earned',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'balanceOf',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'getPartialReward',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'account', type: 'address' },
        { name: 'recipient', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [],
    },
    {
      type: 'function',
      name: 'withdraw',
      stateMutability: 'nonpayable',
      inputs: [{ name: 'amount', type: 'uint256' }],
      outputs: [],
    },
    {
      type: 'function',
      name: 'stakeOnBehalf',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'account', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [],
    },
    {
      type: 'function',
      name: 'stakeToken',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'address' }],
    },
  ] satisfies Abi,
} as const
