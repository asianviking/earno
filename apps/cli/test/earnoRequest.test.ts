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
    const url = buildEarnoWebUrl('https://earno.sh', req)
    expect(url).toMatch(/#r=/)
  })

  it('roundtrips constraints + callback', () => {
    const req2: EarnoWebRequestV1 = {
      ...req,
      constraints: {
        allowlistContracts: ['0x0000000000000000000000000000000000000002'],
      },
      callback: {
        url: 'http://127.0.0.1:0/callback',
        state: 'test',
      },
    }
    const encoded = encodeEarnoWebRequest(req2)
    const decoded = decodeEarnoWebRequest(encoded)
    expect(decoded).toEqual(req2)
  })

  it('rejects invalid allowlist contracts', () => {
    const bad = {
      ...req,
      constraints: {
        allowlistContracts: ['0x123'],
      },
    }
    const legacy = Buffer.from(JSON.stringify(bad), 'utf8').toString('base64url')
    expect(() => decodeEarnoWebRequest(legacy)).toThrow(/allowlistContracts/)
  })
})
