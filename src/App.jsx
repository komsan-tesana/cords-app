import { useEffect, useMemo, useRef, useState } from 'react'
import { INSTRUMENTS, playChord } from './audio.js'
import { NOTES, chordName, mkChord, paletteFor, parseChord, splitChord } from './music.js'

function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : JSON.parse(raw)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* localStorage ใช้ไม่ได้ (เช่น private mode) ก็ข้ามไป */
    }
  }, [key, value])
  return [value, setValue]
}

const OCT_CHORD = [-2, -1, 0, 1, 2]
const OCT_BASS = [-1, 0, 1, 2]
const octLabel = (n) => (n === 0 ? '0 (ปกติ)' : n > 0 ? `+${n}` : `${n}`)

export default function App() {
  const [key, setKey] = usePersistentState('cords-key', 0)
  const [minor, setMinor] = usePersistentState('cords-minor', false)
  const [instrument, setInstrument] = usePersistentState('cords-inst', 'piano')
  const [bpm, setBpm] = usePersistentState('cords-bpm', 80)
  const [bassOn, setBassOn] = usePersistentState('cords-bass-on', true)
  const [bassNote, setBassNote] = usePersistentState('cords-bass-note', -1)
  const [chordOct, setChordOct] = usePersistentState('cords-chord-oct', 0)
  const [bassOct, setBassOct] = usePersistentState('cords-bass-oct', 0)
  const [sections, setSections] = usePersistentState('cords-sections', [{ name: 'Verse', chords: [] }])
  const [sectionName, setSectionName] = useState('Verse')
  const [playingIdx, setPlayingIdx] = useState(-1)
  const timer = useRef(null)

  const opts = { instrument, bpm: Number(bpm) || 80, bassOn, chordOct, bassOct }
  const optsRef = useRef(opts)
  optsRef.current = opts

  const { inKey, extra } = useMemo(() => paletteFor(key, minor), [key, minor])
  const flat = useMemo(() => sections.flatMap((s, si) => s.chords.map((_, ci) => ({ si, ci }))), [sections])

  const stop = () => {
    clearInterval(timer.current)
    timer.current = null
    setPlayingIdx(-1)
  }
  useEffect(() => stop, [])

  const preview = (chord, override = {}) => playChord(chord, { ...optsRef.current, ...override })

  const addChord = (name) =>
    setSections((ss) => ss.map((s, i) => (i === ss.length - 1 ? { ...s, chords: [...s.chords, name] } : s)))

  const setChordAt = (si, ci, name) =>
    setSections((ss) => ss.map((s, i) => (i === si ? { ...s, chords: s.chords.map((c, j) => (j === ci ? name : c)) } : s)))

  const removeAt = (si, ci) =>
    setSections((ss) => ss.map((s, i) => (i === si ? { ...s, chords: s.chords.filter((_, j) => j !== ci) } : s)))

  const newSection = () =>
    setSections((ss) => {
      const last = ss[ss.length - 1]
      return last.chords.length
        ? [...ss, { name: sectionName, chords: [] }]
        : ss.map((s, i) => (i === ss.length - 1 ? { ...s, name: sectionName } : s))
    })

  const undo = () =>
    setSections((ss) => {
      const last = ss[ss.length - 1]
      if (last.chords.length) return ss.map((s, i) => (i === ss.length - 1 ? { ...s, chords: s.chords.slice(0, -1) } : s))
      return ss.length > 1 ? ss.slice(0, -1) : ss
    })

  const clearAll = () => {
    if (confirm('ล้างทั้งหมดหรือไม่?')) {
      stop()
      setSections([{ name: 'Verse', chords: [] }])
    }
  }

  const play = () => {
    stop()
    if (!flat.length) return
    let i = 0
    const step = () => {
      const { si, ci } = flat[i]
      setPlayingIdx(i)
      playChord(parseChord(sections[si].chords[ci]), optsRef.current)
      i = (i + 1) % flat.length
    }
    step()
    timer.current = setInterval(step, (60 / opts.bpm) * 2 * 1000)
  }

  const exportText =
    sections
      .filter((s) => s.chords.length)
      .map((s) => `${s.name}: | ${s.chords.join(' | ')} |`)
      .join('\n') + `\n\nคีย์: ${NOTES[key]} ${minor ? 'ไมเนอร์' : 'เมเจอร์'}, ${opts.bpm} bpm`

  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([exportText], { type: 'text/plain' }))
    a.download = 'mercury-heaven-chords.txt'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const demo = (patch) => preview(mkChord(key, minor ? 'm' : '', -1), patch)

  const ChordButton = ({ root, q, roman }) => (
    <div className="pair">
      <button className="chord" onClick={() => preview(mkChord(root, q, bassNote))}>
        {chordName(root, q)}
        <small>{roman}</small>
      </button>
      <button title="เพิ่มเข้าลำดับคอร์ด" onClick={() => addChord(chordName(root, q, bassNote))}>
        +
      </button>
    </div>
  )

  return (
    <main>
      <h1>Mercury – "Heaven": แกะคอร์ดด้วยหู</h1>
      <p className="sub">เปิดเพลงคู่กับหน้านี้ เลือกคีย์ กดฟังคอร์ดเทียบกับเพลงจนตรง แล้วเพิ่มเข้าลำดับคอร์ด</p>

      <section>
        <h2>1. คีย์ เครื่องดนตรี และจังหวะ</h2>
        <div className="row">
          <label>คีย์
            <select value={key} onChange={(e) => setKey(+e.target.value)}>
              {NOTES.map((n, i) => <option key={n} value={i}>{n}</option>)}
            </select>
          </label>
          <label>โหมด
            <select value={minor ? 'min' : 'maj'} onChange={(e) => setMinor(e.target.value === 'min')}>
              <option value="maj">เมเจอร์ (สดใส)</option>
              <option value="min">ไมเนอร์ (เศร้า)</option>
            </select>
          </label>
          <label>เครื่องดนตรี
            <select value={instrument} onChange={(e) => { setInstrument(e.target.value); demo({ instrument: e.target.value }) }}>
              {Object.entries(INSTRUMENTS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={bassOn} onChange={(e) => setBassOn(e.target.checked)} /> เสียงเบส
          </label>
          <label>โน้ตเบส
            <select value={bassNote} onChange={(e) => setBassNote(+e.target.value)}>
              <option value={-1}>อัตโนมัติ (ตัวราก)</option>
              {NOTES.map((n, i) => <option key={n} value={i}>{n}</option>)}
            </select>
          </label>
          <label>ออคเทฟคอร์ด
            <select value={chordOct} onChange={(e) => { setChordOct(+e.target.value); demo({ chordOct: +e.target.value }) }}>
              {OCT_CHORD.map((n) => <option key={n} value={n}>{octLabel(n)}</option>)}
            </select>
          </label>
          <label>ออคเทฟเบส
            <select value={bassOct} onChange={(e) => { setBassOct(+e.target.value); demo({ bassOct: +e.target.value }) }}>
              {OCT_BASS.map((n) => <option key={n} value={n}>{octLabel(n)}</option>)}
            </select>
          </label>
          <label>จังหวะ
            <input className="bpm" type="number" min="40" max="200" value={bpm} onChange={(e) => setBpm(e.target.value)} /> bpm
          </label>
        </div>
        <p className="hint">
          ไม่แน่ใจว่าเพลงอยู่คีย์ไหน? ลองคีย์ต่างๆ จนคอร์ดแรก (I) ฟังแล้วรู้สึกเหมือนได้กลับบ้าน เลือกเครื่องดนตรีให้เสียงใกล้เคียงกับเพลง จะฟังเทียบง่ายขึ้น
        </p>
      </section>

      <section>
        <h2>2. คอร์ดให้เลือก (กดเพื่อฟัง กด + เพื่อเพิ่ม)</h2>
        <div className="row">{inKey.map((c) => <ChordButton key={c.roman} {...c} />)}</div>
        <p className="hint">แถวบน: คอร์ดที่อยู่ในคีย์ แถวล่าง: คอร์ดยืมที่พบบ่อย</p>
        <div className="row">{extra.map((c) => <ChordButton key={c.roman} {...c} />)}</div>
      </section>

      <section>
        <h2>3. ลำดับคอร์ด</h2>
        <div className="row">
          <label>ชื่อท่อน
            <input value={sectionName} onChange={(e) => setSectionName(e.target.value)} style={{ width: 140 }} />
          </label>
          <button onClick={newSection}>เริ่มท่อนใหม่</button>
        </div>
        <div className="prog">
          {sections.map((s, si) => (
            <div className="sec" key={si}>
              <div className="bar">{s.name}:</div>
              <div className="slots">
                {s.chords.map((c, ci) => {
                  const on = flat.findIndex((f) => f.si === si && f.ci === ci) === playingIdx
                  const { root, quality, bassPc } = splitChord(c)
                  return (
                    <div key={ci} className={'slot' + (on ? ' on' : '')}>
                      <span className="name" onClick={() => preview(parseChord(c))}>{c}</span>
                      <select
                        title="เปลี่ยนโน้ตเบสของคอร์ดนี้"
                        value={bassPc}
                        onChange={(e) => setChordAt(si, ci, chordName(root, quality, +e.target.value))}
                      >
                        <option value={-1}>เบส: ราก</option>
                        {NOTES.map((n, i) => <option key={n} value={i}>เบส: {n}</option>)}
                      </select>
                      <button className="x" title="ลบ" onClick={() => removeAt(si, ci)}>×</button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="row">
          <button className="primary" onClick={play}>▶ เล่นลำดับคอร์ด</button>
          <button onClick={stop}>■ หยุด</button>
          <button onClick={undo}>ย้อนกลับ</button>
          <button onClick={clearAll}>ล้างทั้งหมด</button>
        </div>
      </section>

      <section>
        <h2>4. รายการคอร์ดของคุณ</h2>
        <textarea readOnly value={exportText} />
        <div className="row">
          <button onClick={() => navigator.clipboard.writeText(exportText)}>คัดลอก</button>
          <button onClick={download}>ดาวน์โหลด .txt</button>
        </div>
      </section>
    </main>
  )
}
