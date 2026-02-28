import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { URL } from 'node:url'

export type EarnoCallbackResult = {
  state?: string
  txHash?: `0x${string}`
  txHashes?: `0x${string}`[]
  bundleId?: `0x${string}`
  status?: string
}

function parseTxHashes(value: string | null): `0x${string}`[] | undefined {
  if (!value) return undefined
  const parts = value
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  const hashes = parts.filter((x) => /^0x[0-9a-fA-F]{64}$/.test(x)) as `0x${string}`[]
  return hashes.length > 0 ? hashes : undefined
}

export async function startEarnoCallbackServer(opts?: {
  host?: string
}): Promise<{
  callback: { url: string; state: string }
  waitForCallback: Promise<EarnoCallbackResult>
  close: () => Promise<void>
}> {
  const host = opts?.host ?? '127.0.0.1'
  const state = randomBytes(16).toString('hex')

  let resolve!: (r: EarnoCallbackResult) => void
  let reject!: (e: Error) => void
  const waitForCallback = new Promise<EarnoCallbackResult>((res, rej) => {
    resolve = res
    reject = rej
  })

  const server = http.createServer((req, res) => {
    try {
      const reqUrl = new URL(req.url ?? '/', `http://${host}`)
      const pathname = reqUrl.pathname
      if (pathname !== '/' && pathname !== '/callback') {
        res.statusCode = 404
        res.end('Not found')
        return
      }

      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')

      const gotState = reqUrl.searchParams.get('state') ?? undefined
      if (gotState && gotState !== state) {
        res.statusCode = 400
        res.end('Invalid state')
        return
      }

      const txHashRaw = reqUrl.searchParams.get('txHash')
      const txHash =
        txHashRaw && /^0x[0-9a-fA-F]{64}$/.test(txHashRaw)
          ? (txHashRaw as `0x${string}`)
          : undefined

      const bundleIdRaw = reqUrl.searchParams.get('bundleId')
      const bundleId =
        bundleIdRaw && /^0x[0-9a-fA-F]{64}$/.test(bundleIdRaw)
          ? (bundleIdRaw as `0x${string}`)
          : undefined

      const txHashes = parseTxHashes(reqUrl.searchParams.get('txHashes'))
      const status = reqUrl.searchParams.get('status') ?? undefined

      resolve({ state: gotState, txHash, txHashes, bundleId, status })

      res.statusCode = 200
      res.end(
        `<html><body><h3>earno callback received</h3><pre>${JSON.stringify(
          { txHash, bundleId, status },
          null,
          2,
        )}</pre><p>You can close this tab.</p></body></html>`,
      )
    } catch (e) {
      reject(e instanceof Error ? e : new Error('Callback server error'))
      res.statusCode = 500
      res.end('Server error')
    }
  })

  await new Promise<void>((res, rej) => {
    server.listen(0, host, () => res())
    server.on('error', (e) => rej(e))
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Failed to bind callback server')
  }

  const url = `http://${host}:${address.port}/callback`

  return {
    callback: { url, state },
    waitForCallback,
    close: () =>
      new Promise<void>((res) => {
        server.close(() => res())
      }),
  }
}

