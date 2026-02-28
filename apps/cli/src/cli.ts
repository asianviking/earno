#!/usr/bin/env node
import { Cli } from 'incur'
import { deposit } from './commands/deposit.js'
import { balance } from './commands/balance.js'
import { withdraw } from './commands/withdraw.js'
import { pluginCli } from './plugin-cli.js'
import { loadConfiguredPlugins } from './plugins.js'

const cli = Cli.create('earno', {
  description: 'EVM intent CLI — build + execute transaction bundles',
  version: '0.1.0',
})
  .command('deposit', deposit)
  .command('balance', balance)
  .command('withdraw', withdraw)
  .command(pluginCli)

const { loaded, failed } = await loadConfiguredPlugins()
for (const p of loaded) {
  cli.command(p.plugin.cli as any)
}
if (failed.length > 0) {
  console.error(
    `[earno] Failed to load ${failed.length} plugin(s):\n` +
      failed.map((f) => `- ${f.spec}: ${f.error}`).join('\n'),
  )
}

cli.serve()
