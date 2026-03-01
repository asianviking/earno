import { Cli } from 'incur'
import { deposit } from './commands/deposit.js'
import { balance } from './commands/balance.js'
import { withdraw } from './commands/withdraw.js'

const bera = Cli.create('bera', {
  description: 'Berachain commands (sWBERA)',
})
  .command('deposit', deposit)
  .command('balance', balance)
  .command('withdraw', withdraw)

export const earnoPlugin = {
  id: '@earno/plugin-berachain',
  cli: bera,
}

export default earnoPlugin

