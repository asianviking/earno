import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export type EarnoUserConfig = {
  plugins?: string[]
}

export function getEarnoConfigPath(): string {
  const base =
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config')
  return path.join(base, 'earno', 'config.json')
}

export async function readEarnoConfig(): Promise<EarnoUserConfig> {
  const configPath = getEarnoConfigPath()
  try {
    const raw = await fs.readFile(configPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const cfg = parsed as EarnoUserConfig
    if (cfg.plugins && !Array.isArray(cfg.plugins)) return {}
    return cfg
  } catch {
    return {}
  }
}

export async function writeEarnoConfig(config: EarnoUserConfig): Promise<void> {
  const configPath = getEarnoConfigPath()
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
}

export function normalizePlugins(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const items = input
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter(Boolean)
  return Array.from(new Set(items))
}

