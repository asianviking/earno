import { type Abi } from 'viem'

export const BERACHAIN = {
  id: 80094,
  rpc: 'https://rpc.berachain.com/',
} as const

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
  ] satisfies Abi,
}

export const SWBERA = {
  address: '0x118D2cEeE9785eaf70C15Cd74CD84c9f8c3EeC9a' as const,
  abi: [
    // ERC-4626 core
    {
      name: 'deposit',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'assets', type: 'uint256' },
        { name: 'receiver', type: 'address' },
      ],
      outputs: [{ name: 'shares', type: 'uint256' }],
    },
    {
      name: 'redeem',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'shares', type: 'uint256' },
        { name: 'receiver', type: 'address' },
        { name: 'owner', type: 'address' },
      ],
      outputs: [{ name: 'assets', type: 'uint256' }],
    },
    // Read functions
    {
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      name: 'convertToAssets',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'shares', type: 'uint256' }],
      outputs: [{ name: 'assets', type: 'uint256' }],
    },
    {
      name: 'convertToShares',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'assets', type: 'uint256' }],
      outputs: [{ name: 'shares', type: 'uint256' }],
    },
    {
      name: 'previewDeposit',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'assets', type: 'uint256' }],
      outputs: [{ name: 'shares', type: 'uint256' }],
    },
    {
      name: 'previewRedeem',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'shares', type: 'uint256' }],
      outputs: [{ name: 'assets', type: 'uint256' }],
    },
    {
      name: 'totalAssets',
      type: 'function',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      name: 'totalSupply',
      type: 'function',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'uint256' }],
    },
  ] satisfies Abi,
}
