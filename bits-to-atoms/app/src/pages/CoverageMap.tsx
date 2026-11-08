import { useState } from 'react'
import { Panel } from '../components/Bits.tsx'
import { AXES, TAXONOMY, type Axis, type Case } from '../lib/schema.ts'
import { coverage } from '../lib/stats.ts'

function AxisSelect({ value, onChange, label }: { value: Axis; onChange: (a: Axis) => void; label: string }) {
  return (
    <label className="field-inline">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as Axis)}>
        {AXES.map((a) => (
          <option key={a} value={a}>
            {TAXONOMY[a].label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function CoverageMap({ cases }: { cases: readonly Case[] }) {
  const [rowAxis, setRowAxis] = useState<Axis>('input')
  const [colAxis, setColAxis] = useState<Axis>('context')
  const m = coverage(cases, rowAxis, colAxis)
  const max = Math.max(1, ...m.cells.flat())
  return (
    <Panel title="커버리지 맵" hint="빈 칸이 다음 탐색 후보예요" className="span-all">
      <div className="toolbar">
        <AxisSelect label="행" value={rowAxis} onChange={setRowAxis} />
        <AxisSelect label="열" value={colAxis} onChange={setColAxis} />
      </div>
      <div className="scroll-x">
        <table className="matrix">
          <thead>
            <tr>
              <th />
              {m.cols.map((c) => (
                <th key={c} scope="col">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r, i) => (
              <tr key={r}>
                <th scope="row">{r}</th>
                {m.cells[i].map((n, j) => (
                  <td key={m.cols[j]} className={n === 0 ? 'empty' : ''} style={n ? { ['--heat' as string]: n / max } : undefined}>
                    {n === 0 ? '·' : n}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
