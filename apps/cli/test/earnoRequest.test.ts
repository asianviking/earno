import { describe, expect, it } from 'vitest'
import {
  buildEarnoWebUrl,
  decodeEarnoWebRequest,
  encodeEarnoWebRequest,
  type EarnoWebRequestV1,
} from '@earno/core/earnoRequest'

describe('earno web request', () => {
  const req: EarnoWebRequestV1 = {
    v: 1,
    title: 'Test request',
    chainId: 80094,
    calls: [
      {
        label: '1. Do thing',
        to: '0x0000000000000000000000000000000000000001',
        data: '0x',
        valueWei: '0',
      },
    ],
  }

  it('roundtrips gzipped base64url payload', () => {
    const encoded = encodeEarnoWebRequest(req)
    const decoded = decodeEarnoWebRequest(encoded)
    expect(decoded).toEqual(req)
  })

  it('decodes legacy uncompressed base64url JSON', () => {
    const legacy = Buffer.from(JSON.stringify(req), 'utf8').toString('base64url')
    const decoded = decodeEarnoWebRequest(legacy)
    expect(decoded).toEqual(req)
  })

  it('builds fragment URL by default', () => {
    const url = buildEarnoWebUrl('http://localhost:5173', req)
    expect(url).toMatch(/#r=/)
  })
})
