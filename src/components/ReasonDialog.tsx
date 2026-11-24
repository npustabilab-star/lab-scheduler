import { useState } from 'react'

type Props = {
  title: string
  label: string
  confirmText: string
  required?: boolean
  onConfirm: (text: string) => void
  onCancel: () => void
}

/** In-page text dialog (replacement for window.prompt). */
export default function ReasonDialog({ title, label, confirmText, required = false, onConfirm, onCancel }: Props) {
  const [text, setText] = useState('')
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="reason-title" className="w-full max-w-sm rounded bg-white p-4 shadow">
        <h2 id="reason-title" className="mb-2 text-lg font-bold">
          {title}
        </h2>
        <label className="mb-3 block text-sm">
          {label}
          <textarea
            className="mt-1 block w-full rounded border p-2"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded border px-3 py-1" onClick={onCancel}>
            返回
          </button>
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50"
            disabled={required && text.trim() === ''}
            onClick={() => onConfirm(text.trim())}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
