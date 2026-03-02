import { Cli } from 'incur'
import { send } from './commands/send.js'
import { bridge } from './commands/bridge.js'
import { balance } from './commands/balance.js'

const usdt0 = Cli.create('usdt0', {
  description: 'USDT0 cross-chain transfers via LayerZero (zero slippage)',
})
  .command('send', send)
  .command('bridge', bridge)
  .command('balance', balance)

export const earnoPlugin = {
  id: '@earno/plugin-usdt0',
  cli: usdt0,
}

export default earnoPlugin
