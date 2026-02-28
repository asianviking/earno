export type BearnWebCall = {
  label: string
  to: `0x${string}`
  data: `0x${string}`
  valueWei?: string
}

export type BearnWebRequestV1 = {
  v: 1
  title: string
  chainId: number
  rpcUrl?: string
  sender?: `0x${string}`
  receiver?: `0x${string}`
  calls: BearnWebCall[]
}

export function encodeBearnWebRequest(req: BearnWebRequestV1): string {
  return Buffer.from(JSON.stringify(req), 'utf8').toString('base64url')
}

export function buildBearnWebUrl(
  baseUrl: string,
  req: BearnWebRequestV1,
): string {
  const url = new URL(baseUrl)
  url.searchParams.set('r', encodeBearnWebRequest(req))
  return url.toString()
}

