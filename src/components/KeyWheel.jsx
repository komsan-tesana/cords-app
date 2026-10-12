import { NOTES } from '../music.js'

// วงกลมแห่งคู่ห้า: คีย์ที่อยู่ติดกันมีคอร์ดร่วมกันมาก
const ORDER = Array.from({ length: 12 }, (_, k) => (k * 7) % 12)
const R = 92

export default function KeyWheel({ value, minor, onChange }) {
  return (
    <div className="wheel" role="radiogroup" aria-label="เลือกคีย์">
      {ORDER.map((pc, k) => {
        const a = (k * 30 - 90) * (Math.PI / 180)
        return (
          <button
            key={pc}
            role="radio"
            aria-checked={pc === value}
            className={'wheel-key' + (pc === value ? ' on' : '')}
            style={{ left: `calc(50% + ${Math.cos(a) * R}px)`, top: `calc(50% + ${Math.sin(a) * R}px)` }}
            onClick={() => onChange(pc)}
          >
            {NOTES[pc]}
          </button>
        )
      })}
      <div className="wheel-center">
        <strong>{NOTES[value]}</strong>
        <small>{minor ? 'ไมเนอร์' : 'เมเจอร์'}</small>
      </div>
    </div>
  )
}
