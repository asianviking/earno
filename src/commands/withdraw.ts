import { z } from 'incur'
import { buildRedeem } from '../tx.js'
import { BERACHAIN } from '../contracts.js'
import { buildBearnWebUrl, type BearnWebRequestV1 } from '../porto-link.js'

export const withdraw = {
  description:
    'Redeem sWBERA shares back to WBERA, then unwrap to native BERA',
  args: z.object({
    shares: z
      .string()
      .describe('Amount of sWBERA shares to redeem (e.g. "1.0")'),
  }),
  options: z.object({
    receiver: z
      .string()
      .optional()
      .describe(
        'Receiver address for the withdrawn BERA (defaults to sender — fill in your address)',
      ),
    porto: z
      .boolean()
      .optional()
      .describe(
        'Generate a web link to sign + execute with Porto in the browser',
      ),
    webUrl: z
      .string()
      .optional()
      .describe(
        'Web client base URL (default: $BEARN_WEB_URL or http://localhost:5173)',
      ),
  }),
  env: z.object({
    BEARN_WEB_URL: z
      .string()
      .optional()
      .describe(
        'Web client base URL for --porto links (default: http://localhost:5173)',
      ),
  }),
  examples: [
    {
      args: { shares: '1.0' },
      options: { receiver: '0xYourAddress' },
      description: 'Redeem 1 sWBERA back to BERA',
    },
  ],
  run(c: any) {
    const { shares } = c.args
    const receiver = c.options.receiver ?? '0xYOUR_ADDRESS'
    const wantPorto = c.options.porto ?? false
    const webUrl =
      c.options.webUrl ?? c.env.BEARN_WEB_URL ?? 'http://localhost:5173'

    if (receiver === '0xYOUR_ADDRESS') {
      return c.error({
        code: 'MISSING_RECEIVER',
        message:
          'Specify --receiver with your wallet address',
        retryable: true,
        cta: {
          commands: [
            {
              command: `withdraw ${shares} --receiver 0xYourWalletAddress`,
              description: 'Withdraw with your address',
            },
          ],
        },
      })
    }

    const steps = buildRedeem(shares, receiver)

    let portoLink: string | undefined
    if (wantPorto) {
      try {
        const executable = steps.filter((s) => s.calldata.startsWith('0x'))
        const req: BearnWebRequestV1 = {
          v: 1,
          title: 'Withdraw sWBERA → BERA',
          chainId: BERACHAIN.id,
          sender: receiver as `0x${string}`,
          receiver: receiver as `0x${string}`,
          calls: executable.map((s) => ({
            label: s.label,
            to: s.to as `0x${string}`,
            data: s.calldata as `0x${string}`,
          })),
        }
        portoLink = buildBearnWebUrl(webUrl, req)
      } catch {
        return c.error({
          code: 'INVALID_WEB_URL',
          message:
            'Invalid --webUrl / $BEARN_WEB_URL. Expected a fully-qualified URL like http://localhost:5173',
          retryable: true,
        })
      }
    }

    return c.ok(
      {
        strategy: 'sWBERA → BERA',
        shares: `${shares} sWBERA`,
        receiver,
        note: 'Step 2 amount depends on the exchange rate at execution time. Run `bearn balance` to check current rate.',
        ...(portoLink ? { portoLink } : {}),
        steps: steps.map((s) => ({
          label: s.label,
          to: s.to,
          function: s.function,
          calldata: s.calldata,
          cast: s.cast,
        })),
      },
      {
        cta: {
          commands: [
            {
              command: `balance --address ${receiver}`,
              description: 'Check your balance',
            },
          ],
        },
      },
    )
  },
}
