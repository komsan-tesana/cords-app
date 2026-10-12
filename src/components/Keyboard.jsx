import { NOTES } from '../music.js'

const START = 48
const WHITE = [0, 2, 4, 5, 7, 9, 11]
const W = 22

// แป้นเปียโน 2 ออคเทฟ แสดงโน้ตของคอร์ดล่าสุด (ฟ้า = โน้ตคอร์ด, ส้ม = เบส)
export default function Keyboard({ pcs, bassPc }) {
  const keys = []
  for (let m = START; m < START + 24; m++) keys.push(m)
  const whites = keys.filter((m) => WHITE.includes(m % 12))
  const bassKey = bassPc >= 0 ? keys.find((m) => m % 12 === bassPc) : -1
  const cls = (m) => (m === bassKey ? 'bass' : pcs.includes(m % 12) ? 'hit' : '')
  return (
    <svg className="piano" viewBox={`0 0 ${whites.length * W} 64`} role="img" aria-label={'โน้ต: ' + pcs.map((p) => NOTES[p]).join(' ')}>
      {whites.map((m, i) => (
        <rect key={m} className={'wk ' + cls(m)} x={i * W + 0.5} y={0.5} width={W - 1} height={63} rx={2} />
      ))}
      {keys.filter((m) => !WHITE.includes(m % 12)).map((m) => {
        const wi = whites.findIndex((w) => w === m - 1)
        return <rect key={m} className={'bk ' + cls(m)} x={wi * W + W * 0.65} y={0.5} width={W * 0.7} height={38} rx={2} />
      })}
    </svg>
  )
}
