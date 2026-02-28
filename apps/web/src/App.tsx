import { useMemo } from 'react'
import {
  decodeEarnoWebRequest,
  readRequestFromLocation,
  type EarnoWebRequestV1,
} from './earnoRequest'
import { Executor } from './Executor'

function App() {
  const encoded = readRequestFromLocation()
  const decoded = useMemo<{
    request: EarnoWebRequestV1 | null
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
          <h1 className="text-3xl font-semibold tracking-tight">earno</h1>
          <p className="text-sm text-zinc-400">
            Browser executor for earno intents (wallet signing + batched calls).
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
              Run a strategy with <code className="text-zinc-200">--porto</code>{' '}
              and open the returned <code className="text-zinc-200">portoLink</code>.
            </div>
            <pre className="mt-4 overflow-x-auto rounded-md bg-zinc-950/60 p-3 text-xs text-zinc-200">
              earno deposit 1.0 --receiver 0xYourAddress --porto
            </pre>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
