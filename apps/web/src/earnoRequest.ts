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
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const padLen = (4 - (padded.length % 4)) % 4
  const base64 = padded + '='.repeat(padLen)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function decodeBase64UrlUtf8(input: string): string {
  return new TextDecoder().decode(base64UrlToBytes(input))
}

function isHexData(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && value.startsWith('0x')
}

export function decodeEarnoWebRequest(encoded: string): EarnoWebRequestV1 {
  const json = decodeBase64UrlUtf8(encoded)
  const parsed = JSON.parse(json) as unknown

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid request payload')
  }

  const req = parsed as Partial<EarnoWebRequestV1>
  if (req.v !== 1) throw new Error('Unsupported request version')
  if (typeof req.title !== 'string' || !req.title) {
    throw new Error('Missing request title')
  }
  if (typeof req.chainId !== 'number' || !Number.isFinite(req.chainId)) {
    throw new Error('Missing/invalid chainId')
  }
  if (!Array.isArray(req.calls) || req.calls.length === 0) {
    throw new Error('Missing calls')
  }

  for (const call of req.calls) {
    if (!call || typeof call !== 'object') throw new Error('Invalid call')
    const c = call as Partial<EarnoWebCall>
    if (typeof c.label !== 'string' || !c.label) {
      throw new Error('Call missing label')
    }
    if (!isHexData(c.to)) throw new Error('Call missing to')
    if (!isHexData(c.data)) throw new Error('Call missing data')
    if (c.valueWei !== undefined && typeof c.valueWei !== 'string') {
      throw new Error('Invalid call valueWei')
    }
  }

  return req as EarnoWebRequestV1
}

export function readRequestFromLocation(): string | null {
  const search = new URLSearchParams(window.location.search)
  const direct = search.get('r')
  if (direct) return direct

  const hash = window.location.hash
  const idx = hash.indexOf('?')
  if (idx === -1) return null
  const hashQuery = new URLSearchParams(hash.slice(idx + 1))
  return hashQuery.get('r')
}
