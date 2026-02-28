import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { normalizePlugins, readEarnoConfig } from './user-config.js'

export type EarnoPlugin = {
  id: string
  cli: unknown
}

export type LoadedEarnoPlugin = {
  spec: string
  plugin: EarnoPlugin
}

function isCliLike(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.command === 'function' && typeof v.serve === 'function'
}

async function importPluginModule(spec: string): Promise<any> {
  const trimmed = spec.trim()
  if (!trimmed) throw new Error('Empty plugin spec')

  const isPathLike =
    trimmed.startsWith('.') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('file:')

  if (trimmed.startsWith('file:')) return import(trimmed)
  if (isPathLike) {
    const abs = path.resolve(process.cwd(), trimmed)
    return import(pathToFileURL(abs).href)
  }
  return import(trimmed)
}

function parsePluginExport(mod: any, spec: string): EarnoPlugin {
  const candidate = mod?.earnoPlugin ?? mod?.default ?? mod?.plugin

  if (isCliLike(candidate)) {
    return { id: spec, cli: candidate }
  }

  if (candidate && typeof candidate === 'object') {
    const maybe = candidate as Partial<EarnoPlugin>
    if (typeof maybe.id !== 'string' || !maybe.id.trim()) {
      throw new Error('Plugin missing id')
    }
    if (!isCliLike(maybe.cli)) {
      throw new Error('Plugin missing cli (expected incur Cli instance)')
    }
    return { id: maybe.id, cli: maybe.cli }
  }

  throw new Error(
    "Plugin must export an incur Cli (default) or { earnoPlugin: { id, cli } }",
  )
}

function parseEnvPluginList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

export async function loadConfiguredPlugins(): Promise<{
  loaded: LoadedEarnoPlugin[]
  failed: Array<{ spec: string; error: string }>
}> {
  const cfg = await readEarnoConfig()
  const fromConfig = normalizePlugins(cfg.plugins)
  const fromEnv = parseEnvPluginList(process.env.EARNO_PLUGINS)
  const specs = Array.from(new Set([...fromConfig, ...fromEnv]))

  const loaded: LoadedEarnoPlugin[] = []
  const failed: Array<{ spec: string; error: string }> = []

  for (const spec of specs) {
    try {
      const mod = await importPluginModule(spec)
      const plugin = parsePluginExport(mod, spec)
      loaded.push({ spec, plugin })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      failed.push({ spec, error: message })
    }
  }

  return { loaded, failed }
}

