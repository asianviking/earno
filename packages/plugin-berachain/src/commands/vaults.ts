import { z } from 'incur'
import { berachainGraphql, BERACHAIN_API_URL } from '../berachain-api.js'

type OrderBy =
  | 'activeIncentivesRateUsd'
  | 'activeIncentivesValueUsd'
  | 'allTimeBGTReceived'
  | 'apr'
  | 'apy'
  | 'bgtCapturePercentage'
  | 'last24hBGTReceived'
  | 'projectedApr'

type MetricField =
  | 'activeIncentivesRateUsd'
  | 'activeIncentivesValueUsd'
  | 'allTimeReceivedBGTAmount'
  | 'apr'
  | 'apy'
  | 'bgtCapturePercentage'
  | 'lastDayReceivedBGTAmount'
  | 'projectedApr'

type MetricValue = string | number | null

type RewardVault = {
  vaultAddress: string
  isVaultWhitelisted?: boolean
  metadata: null | {
    name: string
    protocolName: string
  }
  stakingToken: {
    symbol: string
  }
  dynamicData: null | Record<string, MetricValue>
}

type RewardVaultsResponse = {
  polGetRewardVaults: {
    pagination: {
      currentPage: number
      totalCount: number
    }
    vaults: RewardVault[]
  }
}

function metricFieldForOrderBy(orderBy: OrderBy): MetricField {
  if (orderBy === 'allTimeBGTReceived') return 'allTimeReceivedBGTAmount'
  if (orderBy === 'last24hBGTReceived') return 'lastDayReceivedBGTAmount'
  return orderBy satisfies Exclude<OrderBy, 'allTimeBGTReceived' | 'last24hBGTReceived'>
}

function buildRewardVaultsQuery(args: {
  metricField: MetricField
  includeIsWhitelistedField: boolean
}): string {
  const isWhitelistedLine = args.includeIsWhitelistedField ? '\n      isVaultWhitelisted' : ''
  return `
query GetRewardVaults(
  $first: Int
  $skip: Int
  $orderBy: GqlRewardVaultOrderBy
  $orderDirection: GqlRewardVaultOrderDirection
  $search: String
  $where: GqlRewardVaultFilter
) {
  polGetRewardVaults(
    chain: BERACHAIN
    first: $first
    skip: $skip
    orderBy: $orderBy
    orderDirection: $orderDirection
    search: $search
    where: $where
  ) {
    pagination {
      currentPage
      totalCount
    }
    vaults {
      vaultAddress${isWhitelistedLine}
      metadata {
        name
        protocolName
      }
      stakingToken {
        symbol
      }
      dynamicData {
        ${args.metricField}
      }
    }
  }
}
`
}

function splitCsv(input: string | undefined): string[] | undefined {
  if (!input) return undefined
  const parts = input
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : undefined
}

export const vaults = {
  description: 'List Berachain Reward Vaults (API; whitelisted by default)',
  options: z.object({
    first: z.number().optional().describe('Page size (default: 20)'),
    skip: z.number().optional().describe('Pagination offset (default: 0)'),
    orderBy: z
      .enum([
        'activeIncentivesRateUsd',
        'activeIncentivesValueUsd',
        'allTimeBGTReceived',
        'apr',
        'apy',
        'bgtCapturePercentage',
        'last24hBGTReceived',
        'projectedApr',
      ])
      .optional()
      .describe('Sort field (default: apr)'),
    orderDirection: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort direction (default: desc)'),
    search: z.string().optional().describe('Search query (matches name/protocol/etc)'),
    category: z
      .string()
      .optional()
      .describe('Category filter (CSV; e.g. defi/amm,defi/lending)'),
    protocol: z
      .string()
      .optional()
      .describe('Protocol filter (CSV; e.g. Kodiak,Beradrome)'),
    stakingToken: z
      .string()
      .optional()
      .describe('Staking token address filter (CSV; 0x...)'),
    includeNonWhitelisted: z
      .boolean()
      .optional()
      .describe('Include non-whitelisted vaults (default: false)'),
    apiUrl: z
      .string()
      .optional()
      .describe(`Berachain API URL override (default: ${BERACHAIN_API_URL})`),
  }),
  examples: [
    {
      options: { orderBy: 'apr' as const, orderDirection: 'desc' as const, first: 20 },
      description: 'Show top APR reward vaults',
    },
    {
      options: { category: 'defi/amm', first: 20 },
      description: 'Show top AMM vaults',
    },
  ],
  async run(c: any) {
    const first = c.options.first ?? 20
    const skip = c.options.skip ?? 0
    const orderBy = (c.options.orderBy ?? 'apr') as OrderBy
    const orderDirection = (c.options.orderDirection ?? 'desc') as string
    const search = (c.options.search as string | undefined) ?? undefined

    const categoriesIn = splitCsv(c.options.category as string | undefined)
    const protocolsIn = splitCsv(c.options.protocol as string | undefined)
    const stakingTokensIn = splitCsv(c.options.stakingToken as string | undefined)

    const includeNonWhitelisted = Boolean(c.options.includeNonWhitelisted ?? false)
    const metricField = metricFieldForOrderBy(orderBy)

    const where: Record<string, unknown> = {
      includeNonWhitelisted,
      ...(categoriesIn ? { categoriesIn } : {}),
      ...(protocolsIn ? { protocolsIn } : {}),
      ...(stakingTokensIn ? { stakingTokensIn } : {}),
    }

    let data: RewardVaultsResponse
    try {
      const query = buildRewardVaultsQuery({
        metricField,
        includeIsWhitelistedField: includeNonWhitelisted,
      })
      data = await berachainGraphql<RewardVaultsResponse>({
        apiUrl: (c.options.apiUrl as string | undefined) ?? undefined,
        query,
        operationName: 'GetRewardVaults',
        variables: {
          first,
          skip,
          orderBy,
          orderDirection,
          ...(search ? { search } : {}),
          where,
        },
      })
    } catch (e) {
      return c.error({
        code: 'BERA_API_FAILED',
        message: e instanceof Error ? e.message : 'Failed fetching vaults from Berachain API',
        retryable: true,
        details: {
          first,
          skip,
          orderBy,
          orderDirection,
          search,
          where,
        },
      })
    }

    const vaults = data.polGetRewardVaults.vaults
    const pagination = data.polGetRewardVaults.pagination

    return c.ok({
      totalCount: pagination.totalCount,
      first,
      skip,
      orderBy,
      orderDirection,
      vaults: vaults.map((v) => {
        const base = {
          vaultAddress: v.vaultAddress,
          protocol: v.metadata?.protocolName ?? null,
          name: v.metadata?.name ?? null,
          stakingTokenSymbol: v.stakingToken.symbol,
          value: (v.dynamicData?.[metricField] as MetricValue | undefined) ?? null,
        }

        if (includeNonWhitelisted) {
          return {
            ...base,
            isVaultWhitelisted: Boolean(v.isVaultWhitelisted ?? false),
          }
        }

        return base
      }),
    })
  },
}
