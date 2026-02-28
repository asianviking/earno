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

export function encodeEarnoWebRequest(req: EarnoWebRequestV1): string {
  return Buffer.from(JSON.stringify(req), 'utf8').toString('base64url')
}

export function buildEarnoWebUrl(
  baseUrl: string,
  req: EarnoWebRequestV1,
): string {
  const url = new URL(baseUrl)
  url.searchParams.set('r', encodeEarnoWebRequest(req))
  return url.toString()
}
