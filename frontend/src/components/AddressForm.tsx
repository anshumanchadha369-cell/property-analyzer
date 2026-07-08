import { useState } from 'react'

interface Props {
  onSubmit: (address: string) => void
  busy: boolean
}

export default function AddressForm({ onSubmit, busy }: Props) {
  const [address, setAddress] = useState('')
  const valid = address.trim().length >= 5

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && !busy) onSubmit(address.trim())
      }}
    >
      <input
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="e.g. 1234 Pine St, Tacoma, WA 98402"
        autoFocus
        className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
      <button
        type="submit"
        disabled={busy || !valid}
        className="rounded-lg bg-sky-600 px-6 py-3 font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Analyzing…' : 'Analyze'}
      </button>
    </form>
  )
}
