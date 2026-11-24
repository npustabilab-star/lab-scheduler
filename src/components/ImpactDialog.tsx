import { formatSlotLabel } from '../lib/grid'
import type { AffectedBooking } from '../lib/supabase'

type Props = { affected: AffectedBooking[]; onConfirm: () => void; onCancel: () => void }

export default function ImpactDialog({ affected, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="impact-title" className="w-full max-w-sm rounded bg-white p-4 shadow">
        <h2 id="impact-title" className="mb-2 text-lg font-bold">
          這個變更會取消以下會議
        </h2>
        <ul className="mb-4 space-y-1 text-sm">
          {affected.map((a) => (
            <li key={a.id}>
              {formatSlotLabel(a.date, a.period)}　{a.undergrad_name}（{a.status === 'pending' ? '待確認' : '已成立'}）
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded border px-3 py-1" onClick={onCancel}>
            先不要
          </button>
          <button type="button" className="rounded bg-red-600 px-3 py-1 text-white" onClick={onConfirm}>
            確定變更並取消會議
          </button>
        </div>
      </div>
    </div>
  )
}
