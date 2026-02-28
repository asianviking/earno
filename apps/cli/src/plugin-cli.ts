import { Cli, z } from 'incur'
import {
  getEarnoConfigPath,
  normalizePlugins,
  readEarnoConfig,
  writeEarnoConfig,
} from './user-config.js'

export const pluginCli = Cli.create('plugin', {
  description: 'Manage earno plugins',
})
  .command('list', {
    description: 'List configured plugins',
    async run(c: any) {
      const cfg = await readEarnoConfig()
      const plugins = normalizePlugins(cfg.plugins)
      return c.ok({
        configPath: getEarnoConfigPath(),
        plugins,
        env: {
          EARNO_PLUGINS: process.env.EARNO_PLUGINS ?? null,
        },
        note: 'Plugins must be installed in the same Node.js environment as earno (resolvable by import).',
      })
    },
  })
  .command('add', {
    description: 'Add a plugin spec (does not install it)',
    args: z.object({
      spec: z
        .string()
        .describe(
          "Plugin import spec (e.g. '@ayvee/bend' or './path/to/plugin.js')",
        ),
    }),
    async run(c: any) {
      const cfg = await readEarnoConfig()
      const plugins = normalizePlugins(cfg.plugins)
      const spec = String(c.args.spec).trim()
      const next = Array.from(new Set([...plugins, spec]))
      await writeEarnoConfig({ ...cfg, plugins: next })
      return c.ok({
        added: spec,
        plugins: next,
        configPath: getEarnoConfigPath(),
        installHint:
          'Make sure the plugin is installed (or use a file path). For pnpm workspaces: pnpm add <spec> --filter earno',
      })
    },
  })
  .command('remove', {
    description: 'Remove a plugin spec',
    args: z.object({
      spec: z.string().describe('Plugin import spec to remove'),
    }),
    async run(c: any) {
      const cfg = await readEarnoConfig()
      const plugins = normalizePlugins(cfg.plugins)
      const spec = String(c.args.spec).trim()
      const next = plugins.filter((p) => p !== spec)
      await writeEarnoConfig({ ...cfg, plugins: next })
      return c.ok({
        removed: spec,
        plugins: next,
        configPath: getEarnoConfigPath(),
      })
    },
  })

