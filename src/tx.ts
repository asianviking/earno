import { encodeFunctionData, formatEther, parseEther, type Abi } from 'viem'
import { BERACHAIN, SWBERA, WBERA } from './contracts.js'

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
  opts?: { value?: string },
): string {
  const parts = ['cast send', to, `"${fn}"`]
  parts.push(...args)
  if (opts?.value) parts.push('--value', opts.value)
  parts.push('--rpc-url', BERACHAIN.rpc)
  parts.push('--private-key', '$WALLET_PRIVATE_KEY')
  return parts.join(' ')
}

export function buildDeposit(amount: string, receiver: string): TxStep[] {
  const wei = parseEther(amount)
  const weiStr = wei.toString()

  const steps: TxStep[] = []

  // Step 1: Wrap BERA → WBERA
  const wrapData = encodeFunctionData({
    abi: WBERA.abi,
    functionName: 'deposit',
  })
  steps.push({
    label: '1. Wrap BERA → WBERA',
    to: WBERA.address,
    function: 'deposit()',
    calldata: wrapData,
    value: `${amount} ether`,
    cast: castCmd(WBERA.address, 'deposit()', [], { value: `${amount}ether` }),
  })

  // Step 2: Approve WBERA for sWBERA
  const approveData = encodeFunctionData({
    abi: WBERA.abi,
    functionName: 'approve',
    args: [SWBERA.address, wei],
  })
  steps.push({
    label: '2. Approve WBERA for sWBERA',
    to: WBERA.address,
    function: `approve(address,uint256)`,
    calldata: approveData,
    cast: castCmd(WBERA.address, 'approve(address,uint256)', [
      SWBERA.address,
      weiStr,
    ]),
  })

  // Step 3: Deposit WBERA into sWBERA
  const depositData = encodeFunctionData({
    abi: SWBERA.abi,
    functionName: 'deposit',
    args: [wei, receiver as `0x${string}`],
  })
  steps.push({
    label: '3. Deposit WBERA → sWBERA',
    to: SWBERA.address,
    function: `deposit(uint256,address)`,
    calldata: depositData,
    cast: castCmd(SWBERA.address, 'deposit(uint256,address)', [
      weiStr,
      receiver,
    ]),
  })

  return steps
}

export function buildRedeem(shares: string, receiver: string): TxStep[] {
  const wei = parseEther(shares)
  const weiStr = wei.toString()

  const steps: TxStep[] = []

  // Step 1: Redeem sWBERA → WBERA
  const redeemData = encodeFunctionData({
    abi: SWBERA.abi,
    functionName: 'redeem',
    args: [wei, receiver as `0x${string}`, receiver as `0x${string}`],
  })
  steps.push({
    label: '1. Redeem sWBERA → WBERA',
    to: SWBERA.address,
    function: `redeem(uint256,address,address)`,
    calldata: redeemData,
    cast: castCmd(SWBERA.address, 'redeem(uint256,address,address)', [
      weiStr,
      receiver,
      receiver,
    ]),
  })

  // Step 2: Unwrap WBERA → BERA
  // Note: user needs to know how much WBERA they'll receive.
  // The exact amount depends on the exchange rate at execution time.
  // We show the command with a placeholder.
  steps.push({
    label: '2. Unwrap WBERA → BERA (use actual WBERA received from step 1)',
    to: WBERA.address,
    function: `withdraw(uint256)`,
    calldata: '(depends on step 1 output)',
    cast: castCmd(WBERA.address, 'withdraw(uint256)', [
      '<WBERA_AMOUNT_FROM_STEP_1>',
    ]),
  })

  return steps
}
