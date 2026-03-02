export const BERACHAIN_API_URL = 'https://api.berachain.com/' as const

type GraphqlError = {
  message?: unknown
  extensions?: unknown
}

type GraphqlResponse<TData> = {
  data?: TData
  errors?: GraphqlError[]
}

function firstGraphqlErrorMessage(errors: GraphqlError[] | undefined): string | null {
  if (!errors || errors.length === 0) return null
  const first = errors[0]
  return typeof first?.message === 'string' && first.message.trim() ? first.message : null
}

export async function berachainGraphql<TData>(args: {
  query: string
  variables?: Record<string, unknown>
  operationName?: string
  apiUrl?: string
}): Promise<TData> {
  const apiUrl = args.apiUrl ?? BERACHAIN_API_URL

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: args.query,
      ...(args.operationName ? { operationName: args.operationName } : {}),
      ...(args.variables ? { variables: args.variables } : {}),
    }),
  })

  const text = await res.text()
  let json: GraphqlResponse<TData> | undefined
  try {
    json = text ? (JSON.parse(text) as GraphqlResponse<TData>) : undefined
  } catch {
    json = undefined
  }

  if (!res.ok) {
    const msg = firstGraphqlErrorMessage(json?.errors) ?? `Berachain API error (${res.status})`
    throw new Error(msg)
  }

  const gqlError = firstGraphqlErrorMessage(json?.errors)
  if (gqlError) throw new Error(gqlError)

  if (!json || !json.data) {
    throw new Error('Berachain API returned unexpected response')
  }

  return json.data
}

