import { useState } from 'react'
import { setAppKey } from '../lib/api'

export default function PasswordGate({ hadKey }: { hadKey: boolean }) {
  const [value, setValue] = useState('')

  function unlock() {
    if (!value) return
    setAppKey(value)
    window.location.reload()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          App password required
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          This is a private tool. Enter the app password once — this device will remember it.
        </p>
        {hadKey ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            That password didn't work — try again.
          </p>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            unlock()
          }}
        >
          <input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="App password"
            className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600"
          />
          <button
            type="submit"
            disabled={!value}
            className="mt-3 w-full rounded-lg bg-sky-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}
