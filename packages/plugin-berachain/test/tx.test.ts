import { describe, expect, it } from 'vitest'
import { encodeFunctionData, erc20Abi, parseEther } from 'viem'
import {
  buildBgtClaimAndRedeem,
  buildHoneyVaultDepositAndStake,
  buildHoneyVaultWithdraw,
  buildSwberaDepositNative,
  buildSwberaWithdrawClaim,
  buildSwberaWithdrawRequest,
} from '../src/tx.js'
import {
  BGT,
  HONEY,
  RE7_HONEY_VAULT,
  REWARD_VAULT,
  SWBERA,
  SWBERA_WITHDRAWAL_REQUEST,
} from '../src/contracts.js'

describe('tx encoding', () => {
  it('buildSwberaDepositNative encodes depositNative', () => {
    const receiver = '0x0000000000000000000000000000000000000001' as const
    const steps = buildSwberaDepositNative('1.5', receiver)

    expect(steps).toHaveLength(1)

    const wei = parseEther('1.5')

    expect(steps[0]?.to).toBe(SWBERA.address)
    expect(steps[0]?.function).toBe('depositNative(uint256,address)')
    expect(steps[0]?.value).toBe('1.5 ether')
    expect(steps[0]?.calldata).toBe(
      encodeFunctionData({
        abi: SWBERA.abi,
        functionName: 'depositNative',
        args: [wei, receiver],
      }),
    )
  })

  it('buildSwberaWithdrawRequest encodes redeem request', () => {
    const receiver = '0x0000000000000000000000000000000000000002' as const
    const owner = '0x0000000000000000000000000000000000000003' as const
    const steps = buildSwberaWithdrawRequest('2.0', receiver, owner)

    expect(steps).toHaveLength(1)

    const wei = parseEther('2.0')

    expect(steps[0]?.to).toBe(SWBERA.address)
    expect(steps[0]?.function).toBe('redeem(uint256,address,address)')
    expect(steps[0]?.calldata).toBe(
      encodeFunctionData({
        abi: SWBERA.abi,
        functionName: 'redeem',
        args: [wei, receiver, owner],
      }),
    )
  })

  it('buildSwberaWithdrawClaim encodes burn(requestId)', () => {
    const requestId = '123'
    const contract = '0x0000000000000000000000000000000000000004' as const
    const steps = buildSwberaWithdrawClaim({
      requestId,
      withdrawalRequestContract: contract,
    })

    expect(steps).toHaveLength(1)
    expect(steps[0]?.to).toBe(contract)
    expect(steps[0]?.function).toBe('burn(uint256)')
    expect(steps[0]?.calldata).toBe(
      encodeFunctionData({
        abi: SWBERA_WITHDRAWAL_REQUEST.abi,
        functionName: 'burn',
        args: [123n],
      }),
    )
  })

  it('buildHoneyVaultDepositAndStake encodes approve + deposit + approve shares + stake', () => {
    const receiver = '0x0000000000000000000000000000000000000005' as const
    const rewardVault = '0x0000000000000000000000000000000000000006' as const
    const assets = parseEther('10')
    const sharesToStake = parseEther('9.5')

    const steps = buildHoneyVaultDepositAndStake({
      assets,
      receiver,
      rewardVault,
      sharesToStake,
    })

    expect(steps).toHaveLength(4)

    expect(steps[0]?.to).toBe(HONEY.address)
    expect(steps[0]?.function).toBe('approve(address,uint256)')
    expect(steps[0]?.calldata).toBe(
      encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [RE7_HONEY_VAULT.address, assets],
      }),
    )

    expect(steps[1]?.to).toBe(RE7_HONEY_VAULT.address)
    expect(steps[1]?.function).toBe('deposit(uint256,address)')
    expect(steps[1]?.calldata).toBe(
      encodeFunctionData({
        abi: RE7_HONEY_VAULT.abi,
        functionName: 'deposit',
        args: [assets, receiver],
      }),
    )

    expect(steps[2]?.to).toBe(RE7_HONEY_VAULT.address)
    expect(steps[2]?.function).toBe('approve(address,uint256)')
    expect(steps[2]?.calldata).toBe(
      encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [rewardVault, sharesToStake],
      }),
    )

    expect(steps[3]?.to).toBe(rewardVault)
    expect(steps[3]?.function).toBe('stakeOnBehalf(address,uint256)')
    expect(steps[3]?.calldata).toBe(
      encodeFunctionData({
        abi: REWARD_VAULT.abi,
        functionName: 'stakeOnBehalf',
        args: [receiver, sharesToStake],
      }),
    )
  })

  it('buildHoneyVaultWithdraw encodes vault withdraw (and optional unstake)', () => {
    const receiver = '0x0000000000000000000000000000000000000007' as const
    const owner = '0x0000000000000000000000000000000000000008' as const
    const rewardVault = '0x0000000000000000000000000000000000000009' as const
    const assets = parseEther('1')
    const unstakeShares = parseEther('0.2')

    const noUnstake = buildHoneyVaultWithdraw({
      assets,
      receiver,
      owner,
      rewardVault,
    })
    expect(noUnstake).toHaveLength(1)
    expect(noUnstake[0]?.to).toBe(RE7_HONEY_VAULT.address)
    expect(noUnstake[0]?.function).toBe('withdraw(uint256,address,address)')

    const withUnstake = buildHoneyVaultWithdraw({
      assets,
      receiver,
      owner,
      rewardVault,
      unstakeShares,
    })
    expect(withUnstake).toHaveLength(2)
    expect(withUnstake[0]?.to).toBe(rewardVault)
    expect(withUnstake[0]?.function).toBe('withdraw(uint256)')
    expect(withUnstake[0]?.calldata).toBe(
      encodeFunctionData({
        abi: REWARD_VAULT.abi,
        functionName: 'withdraw',
        args: [unstakeShares],
      }),
    )
    expect(withUnstake[1]?.to).toBe(RE7_HONEY_VAULT.address)
    expect(withUnstake[1]?.calldata).toBe(
      encodeFunctionData({
        abi: RE7_HONEY_VAULT.abi,
        functionName: 'withdraw',
        args: [assets, receiver, owner],
      }),
    )
  })

  it('buildBgtClaimAndRedeem encodes getPartialReward and optional redeem', () => {
    const rewardVault = '0x0000000000000000000000000000000000000010' as const
    const account = '0x0000000000000000000000000000000000000011' as const
    const receiver = '0x0000000000000000000000000000000000000012' as const
    const amount = parseEther('3')

    const claimOnly = buildBgtClaimAndRedeem({
      rewardVault,
      account,
      amount,
    })
    expect(claimOnly).toHaveLength(1)
    expect(claimOnly[0]?.to).toBe(rewardVault)
    expect(claimOnly[0]?.function).toBe('getPartialReward(address,address,uint256)')
    expect(claimOnly[0]?.calldata).toBe(
      encodeFunctionData({
        abi: REWARD_VAULT.abi,
        functionName: 'getPartialReward',
        args: [account, account, amount],
      }),
    )

    const claimAndRedeem = buildBgtClaimAndRedeem({
      rewardVault,
      account,
      amount,
      redeem: { receiver },
    })
    expect(claimAndRedeem).toHaveLength(2)
    expect(claimAndRedeem[1]?.to).toBe(BGT.address)
    expect(claimAndRedeem[1]?.function).toBe('redeem(address,uint256)')
    expect(claimAndRedeem[1]?.calldata).toBe(
      encodeFunctionData({
        abi: BGT.abi,
        functionName: 'redeem',
        args: [receiver, amount],
      }),
    )
  })
})
