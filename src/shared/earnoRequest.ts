import { gunzipSync, gzipSync } from 'fflate'

export type EarnoWebCall = {
  label: string
  to: `0x${string}`
  data: `0x${string}`
  valueWei?: string
}

export type EarnoWebRequestV1 = {
  v: 1
  title: string
  chainId: number
  rpcUrl?: string
  sender?: `0x${string}`
  receiver?: `0x${string}`
  calls: EarnoWebCall[]
  intent?: {
    plugin?: string
    action?: string
    params?: unknown
    display?: Record<string, unknown>
  }
  callback?: {
    url: string
    state?: string
  }
}

export type EarnoWebUrlMode = 'fragment' | 'query'

function utf8ToBytes(input: string): Uint8Array {
  return new TextEncoder().encode(input)
}

function bytesToUtf8(input: Uint8Array): string {
  return new TextDecoder().decode(input)
}

function base64UrlEncode(input: Uint8Array): string {
  // Node
  const nodeBuffer = (globalThis as unknown as { Buffer?: any }).Buffer
  if (nodeBuffer) return nodeBuffer.from(input).toString('base64url')

  // Browser
  let binary = ''
  for (let i = 0; i < input.length; i++) binary += String.fromCharCode(input[i]!)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(input: string): Uint8Array {
  // Node
  const nodeBuffer = (globalThis as unknown as { Buffer?: any }).Buffer
  if (nodeBuffer) return new Uint8Array(nodeBuffer.from(input, 'base64url'))

  // Browser
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const padLen = (4 - (padded.length % 4)) % 4
  const base64 = padded + '='.repeat(padLen)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function isHex(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value)
}

function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
}

function assertRequestV1(req: unknown): asserts req is EarnoWebRequestV1 {
  if (!req || typeof req !== 'object') throw new Error('Invalid request payload')
  const r = req as Partial<EarnoWebRequestV1>

  if (r.v !== 1) throw new Error('Unsupported request version')
  if (typeof r.title !== 'string' || !r.title.trim()) throw new Error('Missing request title')
  if (typeof r.chainId !== 'number' || !Number.isFinite(r.chainId)) {
    throw new Error('Missing/invalid chainId')
  }
  if (!Array.isArray(r.calls) || r.calls.length === 0) throw new Error('Missing calls')

  if (r.rpcUrl !== undefined && typeof r.rpcUrl !== 'string') throw new Error('Invalid rpcUrl')
  if (r.sender !== undefined && !isAddress(r.sender)) throw new Error('Invalid sender')
  if (r.receiver !== undefined && !isAddress(r.receiver)) throw new Error('Invalid receiver')

  for (const call of r.calls) {
    if (!call || typeof call !== 'object') throw new Error('Invalid call')
    const c = call as Partial<EarnoWebCall>
    if (typeof c.label !== 'string' || !c.label.trim()) throw new Error('Call missing label')
    if (!isAddress(c.to)) throw new Error('Call missing/invalid to')
    if (!isHex(c.data)) throw new Error('Call missing/invalid data')
    if (c.valueWei !== undefined) {
      if (typeof c.valueWei !== 'string') throw new Error('Invalid call valueWei')
      try {
        if (BigInt(c.valueWei) < 0n) throw new Error('negative')
      } catch {
        throw new Error('Invalid call valueWei')
      }
    }
  }
}

export function encodeEarnoWebRequest(
  req: EarnoWebRequestV1,
  opts?: { compress?: boolean },
): string {
  const json = JSON.stringify(req)
  const bytes = utf8ToBytes(json)
  const compress = opts?.compress ?? true
  const payload = compress ? gzipSync(bytes) : bytes
  return base64UrlEncode(payload)
}

export function decodeEarnoWebRequest(encoded: string): EarnoWebRequestV1 {
  const payload = base64UrlDecode(encoded)
  const isGzip = payload.length >= 2 && payload[0] === 0x1f && payload[1] === 0x8b
  const json = bytesToUtf8(isGzip ? gunzipSync(payload) : payload)
  const parsed = JSON.parse(json) as unknown
  assertRequestV1(parsed)
  return parsed
}

export function buildEarnoWebUrl(
  baseUrl: string,
  req: EarnoWebRequestV1,
  opts?: { mode?: EarnoWebUrlMode; compress?: boolean },
): string {
  const url = new URL(baseUrl)
  const mode = opts?.mode ?? 'fragment'
  const encoded = encodeEarnoWebRequest(req, { compress: opts?.compress })

  if (mode === 'query') {
    url.searchParams.set('r', encoded)
    return url.toString()
  }

  if (url.hash && url.hash !== '#') {
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
    const [hashPath, hashQuery] = hash.split('?', 2)
    const params = new URLSearchParams(hashQuery ?? '')
    params.set('r', encoded)
    url.hash = `${hashPath}?${params.toString()}`
    return url.toString()
  }

  url.hash = `r=${encoded}`
  return url.toString()
}
