export type { EarnoWebRequestV1 } from '@earno/shared/earnoRequest'
export { decodeEarnoWebRequest } from '@earno/shared/earnoRequest'

export function readRequestFromLocation(): string | null {
  const url = new URL(window.location.href)

  const direct = url.searchParams.get('r')
  if (direct) return direct

  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  if (!hash) return null

  if (hash.startsWith('r=')) return hash.slice('r='.length)
  if (hash.startsWith('?')) return new URLSearchParams(hash.slice(1)).get('r')

  const idx = hash.indexOf('?')
  if (idx === -1) return null
  return new URLSearchParams(hash.slice(idx + 1)).get('r')
}
