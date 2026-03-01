import { Cli } from 'incur'
import { deposit } from './commands/deposit.js'
import { balance } from './commands/balance.js'
import { withdraw } from './commands/withdraw.js'
import { withdrawClaim } from './commands/withdraw-claim.js'
import { claim } from './commands/claim.js'

const bera = Cli.create('bera', {
  description: 'Berachain commands (sWBERA + Bend)',
})
  .command('deposit', deposit)
  .command('balance', balance)
  .command('withdraw', withdraw)
  .command('withdraw-claim', withdrawClaim)
  .command('claim', claim)

export const earnoPlugin = {
  id: '@earno/plugin-berachain',
  cli: bera,
}

export default earnoPlugin
