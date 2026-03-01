#!/usr/bin/env node
import { Cli, Errors, z } from 'incur'
import { balance } from './commands/balance.js'
import { send } from './commands/send.js'
import { swap } from './commands/swap.js'
import { pluginCli } from './plugin-cli.js'
import { loadConfiguredPlugins } from './plugins.js'

const DEFAULT_WEB_URL = 'https://earno.sh'

function stripGlobalWebUrlFlag(argv: string[]): { argv: string[]; webUrl?: string } {
  const nextArgv: string[] = []
  let webUrl: string | undefined

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!

    if (token === '--webUrl' || token === '--web-url') {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('-')) {
        webUrl = ''
        continue
      }
      webUrl = value
      i++
      continue
    }

    if (token.startsWith('--webUrl=') || token.startsWith('--web-url=')) {
      const value = token.split('=', 2)[1] ?? ''
      webUrl = value
      continue
    }

    nextArgv.push(token)
  }

  return { argv: nextArgv, webUrl }
}

const argvInput = process.argv.slice(2)
const { argv: argv, webUrl: webUrlFlag } = stripGlobalWebUrlFlag(argvInput)

const cli = Cli.create('earno', {
  description: 'EVM intent CLI — build + execute transaction bundles',
  version: '0.1.0',
  vars: z.object({
    webUrl: z.string().default(DEFAULT_WEB_URL),
  }),
})
  .use(async (c, next) => {
    const raw =
      webUrlFlag !== undefined ? webUrlFlag : (process.env.EARNO_WEB_URL ?? DEFAULT_WEB_URL)
    if (!raw) {
      throw new Errors.IncurError({
        code: 'INVALID_WEB_URL',
        message:
          'Missing --web-url value. Expected a fully-qualified URL like https://earno.sh (or http://localhost:5173 for local dev).',
        retryable: true,
      })
    }

    let url: URL
    try {
      url = new URL(raw)
    } catch (e) {
      throw new Errors.IncurError({
        code: 'INVALID_WEB_URL',
        message:
          'Invalid --web-url / $EARNO_WEB_URL. Expected a fully-qualified URL like https://earno.sh (or http://localhost:5173 for local dev).',
        retryable: true,
        cause: e instanceof Error ? e : undefined,
      })
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Errors.IncurError({
        code: 'INVALID_WEB_URL',
        message:
          'Invalid --web-url / $EARNO_WEB_URL. Expected an http(s) URL like https://earno.sh (or http://localhost:5173 for local dev).',
        retryable: true,
      })
    }

    c.set('webUrl', url.toString())
    await next()
  })
  .command('balance', balance)
  .command('send', send)
  .command('swap', swap)
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

cli.serve(argv)
