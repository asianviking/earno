import { z } from 'incur'
import { buildRedeem } from '../tx.js'

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

    return c.ok(
      {
        strategy: 'sWBERA → BERA',
        shares: `${shares} sWBERA`,
        receiver,
        note: 'Step 2 amount depends on the exchange rate at execution time. Run `bearn balance` to check current rate.',
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
