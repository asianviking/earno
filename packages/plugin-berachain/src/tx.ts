import { encodeFunctionData, erc20Abi, parseEther } from 'viem'
import {
  BGT,
  BERACHAIN,
  HONEY,
  RE7_HONEY_VAULT,
  REWARD_VAULT,
  SWBERA,
  SWBERA_WITHDRAWAL_REQUEST,
} from './contracts.js'

export interface TxStep {
  label: string
  to: string
  function: string
  calldata: string
  value?: string
  cast: string
}

function castCmd(
  to: string,
  fn: string,
  args: string[],
  opts?: { value?: string; rpcUrl?: string },
): string {
  const parts = ['cast send', to, `"${fn}"`]
  parts.push(...args)
  if (opts?.value) parts.push('--value', opts.value)
  parts.push('--rpc-url', opts?.rpcUrl ?? BERACHAIN.rpc)
  parts.push('--private-key', '$WALLET_PRIVATE_KEY')
  return parts.join(' ')
}

export function buildSwberaDepositNative(
  amount: string,
  receiver: string,
  opts?: { rpcUrl?: string },
): TxStep[] {
  const wei = parseEther(amount)
  const weiStr = wei.toString()

  const rpcUrl = opts?.rpcUrl ?? BERACHAIN.rpc

  const depositNativeData = encodeFunctionData({
    abi: SWBERA.abi,
    functionName: 'depositNative',
    args: [wei, receiver as `0x${string}`],
  })

  return [
    {
      label: '1. Deposit BERA → sWBERA',
      to: SWBERA.address,
      function: `depositNative(uint256,address)`,
      calldata: depositNativeData,
      value: `${amount} ether`,
      cast: castCmd(
        SWBERA.address,
        'depositNative(uint256,address)',
        [weiStr, receiver],
        { value: `${amount}ether`, rpcUrl },
      ),
    },
  ]
}

export function buildSwberaWithdrawRequest(
  shares: string,
  receiver: string,
  owner: string,
  opts?: { rpcUrl?: string },
): TxStep[] {
  const wei = parseEther(shares)
  const weiStr = wei.toString()

  const rpcUrl = opts?.rpcUrl ?? BERACHAIN.rpc

  const redeemData = encodeFunctionData({
    abi: SWBERA.abi,
    functionName: 'redeem',
    args: [wei, receiver as `0x${string}`, owner as `0x${string}`],
  })

  return [
    {
      label: '1. Request withdrawal (sWBERA → BERA, 7-day cooldown)',
      to: SWBERA.address,
      function: `redeem(uint256,address,address)`,
      calldata: redeemData,
      cast: castCmd(
        SWBERA.address,
        'redeem(uint256,address,address)',
        [weiStr, receiver, owner],
        { rpcUrl },
      ),
    },
  ]
}

export function buildSwberaWithdrawClaim(args: {
  requestId: string
  withdrawalRequestContract: string
  rpcUrl?: string
}): TxStep[] {
  const rpcUrl = args.rpcUrl ?? BERACHAIN.rpc

  const burnData = encodeFunctionData({
    abi: SWBERA_WITHDRAWAL_REQUEST.abi,
    functionName: 'burn',
    args: [BigInt(args.requestId)],
  })

  return [
    {
      label: '1. Claim withdrawal (burn request NFT)',
      to: args.withdrawalRequestContract,
      function: `burn(uint256)`,
      calldata: burnData,
      cast: castCmd(
        args.withdrawalRequestContract,
        'burn(uint256)',
        [String(BigInt(args.requestId))],
        { rpcUrl },
      ),
    },
  ]
}

export function buildHoneyVaultDepositAndStake(args: {
  assets: bigint
  receiver: string
  rewardVault: string
  sharesToStake: bigint
  rpcUrl?: string
}): TxStep[] {
  const rpcUrl = args.rpcUrl ?? BERACHAIN.rpc

  const approveHoneyData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [RE7_HONEY_VAULT.address, args.assets],
  })

  const depositData = encodeFunctionData({
    abi: RE7_HONEY_VAULT.abi,
    functionName: 'deposit',
    args: [args.assets, args.receiver as `0x${string}`],
  })

  const approveSharesData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [args.rewardVault as `0x${string}`, args.sharesToStake],
  })

  const stakeData = encodeFunctionData({
    abi: REWARD_VAULT.abi,
    functionName: 'stakeOnBehalf',
    args: [args.receiver as `0x${string}`, args.sharesToStake],
  })

  return [
    {
      label: '1. Approve HONEY → Re7 Honey Vault',
      to: HONEY.address,
      function: `approve(address,uint256)`,
      calldata: approveHoneyData,
      cast: castCmd(
        HONEY.address,
        'approve(address,uint256)',
        [RE7_HONEY_VAULT.address, args.assets.toString()],
        { rpcUrl },
      ),
    },
    {
      label: '2. Deposit HONEY → Re7 Honey Vault (mint shares)',
      to: RE7_HONEY_VAULT.address,
      function: `deposit(uint256,address)`,
      calldata: depositData,
      cast: castCmd(
        RE7_HONEY_VAULT.address,
        'deposit(uint256,address)',
        [args.assets.toString(), args.receiver],
        { rpcUrl },
      ),
    },
    {
      label: '3. Approve vault shares → Reward Vault',
      to: RE7_HONEY_VAULT.address,
      function: `approve(address,uint256)`,
      calldata: approveSharesData,
      cast: castCmd(
        RE7_HONEY_VAULT.address,
        'approve(address,uint256)',
        [args.rewardVault, args.sharesToStake.toString()],
        { rpcUrl },
      ),
    },
    {
      label: '4. Stake vault shares (earn BGT)',
      to: args.rewardVault,
      function: `stakeOnBehalf(address,uint256)`,
      calldata: stakeData,
      cast: castCmd(
        args.rewardVault,
        'stakeOnBehalf(address,uint256)',
        [args.receiver, args.sharesToStake.toString()],
        { rpcUrl },
      ),
    },
  ]
}

export function buildHoneyVaultWithdraw(args: {
  assets: bigint
  receiver: string
  owner: string
  rewardVault: string | null
  unstakeShares?: bigint
  rpcUrl?: string
}): TxStep[] {
  const rpcUrl = args.rpcUrl ?? BERACHAIN.rpc

  const steps: TxStep[] = []

  const unstakeShares = args.unstakeShares ?? 0n
  if (unstakeShares > 0n) {
    if (!args.rewardVault) {
      throw new Error('Missing rewardVault for unstake step')
    }

    const withdrawStakeData = encodeFunctionData({
      abi: REWARD_VAULT.abi,
      functionName: 'withdraw',
      args: [unstakeShares],
    })

    steps.push({
      label: `${steps.length + 1}. Unstake vault shares`,
      to: args.rewardVault,
      function: `withdraw(uint256)`,
      calldata: withdrawStakeData,
      cast: castCmd(args.rewardVault, 'withdraw(uint256)', [unstakeShares.toString()], {
        rpcUrl,
      }),
    })
  }

  const withdrawData = encodeFunctionData({
    abi: RE7_HONEY_VAULT.abi,
    functionName: 'withdraw',
    args: [args.assets, args.receiver as `0x${string}`, args.owner as `0x${string}`],
  })

  steps.push({
    label: `${steps.length + 1}. Withdraw HONEY from Re7 Honey Vault`,
    to: RE7_HONEY_VAULT.address,
    function: `withdraw(uint256,address,address)`,
    calldata: withdrawData,
    cast: castCmd(
      RE7_HONEY_VAULT.address,
      'withdraw(uint256,address,address)',
      [args.assets.toString(), args.receiver, args.owner],
      { rpcUrl },
    ),
  })

  return steps
}

export function buildBgtClaimAndRedeem(args: {
  rewardVault: string
  account: string
  amount: bigint
  redeem?: { receiver: string }
  rpcUrl?: string
}): TxStep[] {
  const rpcUrl = args.rpcUrl ?? BERACHAIN.rpc

  const claimData = encodeFunctionData({
    abi: REWARD_VAULT.abi,
    functionName: 'getPartialReward',
    args: [
      args.account as `0x${string}`,
      args.account as `0x${string}`,
      args.amount,
    ],
  })

  const steps: TxStep[] = [
    {
      label: '1. Claim BGT',
      to: args.rewardVault,
      function: `getPartialReward(address,address,uint256)`,
      calldata: claimData,
      cast: castCmd(
        args.rewardVault,
        'getPartialReward(address,address,uint256)',
        [args.account, args.account, args.amount.toString()],
        { rpcUrl },
      ),
    },
  ]

  if (args.redeem) {
    const redeemData = encodeFunctionData({
      abi: BGT.abi,
      functionName: 'redeem',
      args: [args.redeem.receiver as `0x${string}`, args.amount],
    })

    steps.push({
      label: '2. Redeem BGT → BERA',
      to: BGT.address,
      function: `redeem(address,uint256)`,
      calldata: redeemData,
      cast: castCmd(
        BGT.address,
        'redeem(address,uint256)',
        [args.redeem.receiver, args.amount.toString()],
        { rpcUrl },
      ),
    })
  }

  return steps
}
