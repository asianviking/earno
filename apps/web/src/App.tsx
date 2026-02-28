function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">bearn</h1>
          <p className="text-zinc-400">
            Executor UI (Porto signing + batched calls) — coming online soon.
          </p>
        </header>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-zinc-200">
              Next: /execute
            </div>
            <div className="text-sm text-zinc-400">
              This app will read an intent from the URL hash and execute it via
              Porto.
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
