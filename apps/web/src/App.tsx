import { useMemo } from 'react'
import {
  decodeEarnoWebRequest,
  readRequestFromLocation,
  type EarnoWebRequest,
} from './earnoRequest'
import { Executor } from './Executor'

function App() {
  const encoded = readRequestFromLocation()
  const decoded = useMemo<{
    request: EarnoWebRequest | null
    error: string | null
  }>(() => {
    if (!encoded) return { request: null, error: null }
    try {
      return { request: decodeEarnoWebRequest(encoded), error: null }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid request'
      return { request: null, error: message }
    }
  }, [encoded])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">earno</h1>
            <div className="flex items-center gap-3 text-sm">
              <a
                className="text-zinc-300 underline decoration-zinc-600 underline-offset-4 hover:text-zinc-100"
                href="https://github.com/asianviking/earno"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              <a
                className="text-zinc-300 underline decoration-zinc-600 underline-offset-4 hover:text-zinc-100"
                href="https://www.npmjs.com/package/@earno/cli"
                target="_blank"
                rel="noreferrer"
              >
                npm
              </a>
            </div>
          </div>
          <p className="text-sm text-zinc-400">
            Browser executor for earno intents (wallet signing + Relay steps).
          </p>
        </header>

        {decoded.error ? (
          <section className="rounded-lg border border-red-900/60 bg-red-950/30 p-5">
            <div className="text-sm font-medium text-red-200">
              Invalid request
            </div>
            <div className="mt-1 text-sm text-red-300/90">{decoded.error}</div>
            <div className="mt-3 text-sm text-zinc-400">
              Re-run the CLI command and make sure the full URL was copied.
            </div>
          </section>
        ) : decoded.request ? (
          <Executor request={decoded.request} />
        ) : (
          <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="text-sm font-medium text-zinc-200">
              Waiting for an intent
            </div>
            <div className="mt-1 text-sm text-zinc-400">
              Run a command and open the returned{' '}
              <code className="text-zinc-200">executorUrl</code>.
            </div>
            <div className="mt-3 text-sm text-zinc-400">
              Install:{' '}
              <code className="text-zinc-200">npm i -g @earno/cli</code> (docs:{' '}
              <a
                className="text-zinc-300 underline decoration-zinc-600 underline-offset-4 hover:text-zinc-100"
                href="https://github.com/asianviking/earno#install"
                target="_blank"
                rel="noreferrer"
              >
                github.com/asianviking/earno
              </a>
              )
            </div>
            <pre className="mt-4 overflow-x-auto rounded-md bg-zinc-950/60 p-3 text-xs text-zinc-200">{'earno swap 0.1 --from native --to USDC --chain berachain --to-chain berachain --sender 0xYourAddress'}</pre>
            <div className="mt-4 text-sm text-zinc-400">
              Using an agent? Sync earno skills:
            </div>
            <pre className="mt-2 overflow-x-auto rounded-md bg-zinc-950/60 p-3 text-xs text-zinc-200">
              npx @earno/cli skills add
            </pre>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
