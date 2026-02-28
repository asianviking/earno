#!/usr/bin/env node
import { Cli } from 'incur'
import { deposit } from './commands/deposit.js'
import { balance } from './commands/balance.js'
import { withdraw } from './commands/withdraw.js'

const cli = Cli.create('bearn', {
  description: 'Berachain yield CLI — earn from your terminal',
  version: '0.1.0',
})
  .command('deposit', deposit)
  .command('balance', balance)
  .command('withdraw', withdraw)

cli.serve()
