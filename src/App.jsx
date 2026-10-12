import { useEffect, useMemo, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, Copy, Download, GripVertical, Hand, Minus, Play, Plus, Square, Trash2, Undo2 } from 'lucide-react'
import { INSTRUMENTS, playChord } from './audio.js'
import { NOTES, QUALITIES, chordName, mkChord, paletteFor, parseChord, pitchClasses, splitChord } from './music.js'
import KeyWheel from './components/KeyWheel.jsx'
import Keyboard from './components/Keyboard.jsx'

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
const SECTION_PRESETS = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Outro']
const clampBpm = (n) => Math.min(200, Math.max(40, Math.round(n)))
const qualityLabel = (q) => (q === '' ? 'maj' : q)

function ChordButton({ root, q, roman, hotkey, active, onPick }) {
  return (
    <button className={'chord' + (active ? ' active' : '')} onClick={() => onPick(root, q, roman)}>
      {hotkey && <kbd>{hotkey}</kbd>}
      {chordName(root, q)}
      <small>{roman}</small>
    </button>
  )
}

function Slot({ id, name, selected, playing, onSelect }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 2 : undefined }}
      className={'slot' + (selected ? ' sel' : '') + (playing ? ' on' : '') + (isDragging ? ' drag' : '')}
    >
      <button ref={setActivatorNodeRef} className="grip" aria-label="ลากเพื่อเรียงใหม่" {...attributes} {...listeners}>
        <GripVertical size={16} />
      </button>
      <button className="name" onClick={onSelect}>{name}</button>
    </div>
  )
}

export default function App() {
  const [key, setKey] = usePersistentState('cords-key', 0)
  const [minor, setMinor] = usePersistentState('cords-minor', false)
  const [instrument, setInstrument] = usePersistentState('cords-inst', 'piano')
  const [bpm, setBpm] = usePersistentState('cords-bpm', 80)
  const [bassOn, setBassOn] = usePersistentState('cords-bass-on', true)
  const [bassNote, setBassNote] = usePersistentState('cords-bass-note', -1)
  const [chordOct, setChordOct] = usePersistentState('cords-chord-oct', 0)
  const [bassOct, setBassOct] = usePersistentState('cords-bass-oct', 0)
  const [autoAdd, setAutoAdd] = usePersistentState('cords-auto-add', false)
  const [sections, setSections] = usePersistentState('cords-sections', [{ name: 'Verse', chords: [] }])
  const [cur, setCur] = useState(null) // คอร์ดที่เลือกล่าสุดจากแผง { root, q, roman }
  const [sel, setSel] = useState(null) // ช่องในลำดับที่เลือก { si, ci }
  const [playingIdx, setPlayingIdx] = useState(-1)
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)
  const idxRef = useRef(0)
  const taps = useRef([])

  const bpmNum = clampBpm(Number(bpm) || 80)
  const opts = { instrument, bpm: bpmNum, bassOn, chordOct, bassOct }
  const optsRef = useRef(opts)
  optsRef.current = opts
  const sectionsRef = useRef(sections)
  sectionsRef.current = sections

  const { inKey, extra } = useMemo(() => paletteFor(key, minor), [key, minor])
  const flat = useMemo(() => sections.flatMap((s, si) => s.chords.map((_, ci) => ({ si, ci }))), [sections])
  const total = flat.length
  const playing = playingIdx >= 0
  const playingName = playing ? sections.flatMap((s) => s.chords)[playingIdx] : null
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const stop = () => {
    clearTimeout(timer.current)
    timer.current = null
    setPlayingIdx(-1)
  }
  useEffect(() => stop, [])

  // อ่านจาก ref ทุกรอบ เพื่อให้แก้คอร์ดหรือปรับ bpm ระหว่างเล่นแล้วมีผลทันที
  const loop = () => {
    const list = sectionsRef.current.flatMap((s) => s.chords)
    if (!list.length) return stop()
    const i = idxRef.current % list.length
    idxRef.current = i + 1
    setPlayingIdx(i)
    playChord(parseChord(list[i]), optsRef.current)
    timer.current = setTimeout(loop, (60 / optsRef.current.bpm) * 2 * 1000)
  }
  const play = () => {
    stop()
    const from = sel ? flat.findIndex((f) => f.si === sel.si && f.ci === sel.ci) : 0
    idxRef.current = Math.max(from, 0)
    loop()
  }
  const togglePlay = () => (playing ? stop() : play())

  const preview = (chord, override = {}) => playChord(chord, { ...optsRef.current, ...override })

  const addChord = (name) => {
    setSections((ss) => ss.map((s, i) => (i === ss.length - 1 ? { ...s, chords: [...s.chords, name] } : s)))
    setSel(null)
  }
  const setChordAt = (si, ci, name) =>
    setSections((ss) => ss.map((s, i) => (i === si ? { ...s, chords: s.chords.map((c, j) => (j === ci ? name : c)) } : s)))
  const removeAt = (si, ci) => {
    setSections((ss) => ss.map((s, i) => (i === si ? { ...s, chords: s.chords.filter((_, j) => j !== ci) } : s)))
    setSel(null)
  }
  const newSection = (name) =>
    setSections((ss) => {
      const last = ss[ss.length - 1]
      return last.chords.length
        ? [...ss, { name, chords: [] }]
        : ss.map((s, i) => (i === ss.length - 1 ? { ...s, name } : s))
    })
  const undo = () => {
    setSel(null)
    setSections((ss) => {
      const last = ss[ss.length - 1]
      if (last.chords.length) return ss.map((s, i) => (i === ss.length - 1 ? { ...s, chords: s.chords.slice(0, -1) } : s))
      return ss.length > 1 ? ss.slice(0, -1) : ss
    })
  }
  const clearAll = () => {
    if (confirm('ล้างทั้งหมดหรือไม่?')) {
      stop()
      setSel(null)
      setSections([{ name: 'Verse', chords: [] }])
    }
  }

  const pick = (root, q, roman) => {
    setCur({ root, q, roman })
    preview(mkChord(root, q, bassNote))
    if (autoAdd) addChord(chordName(root, q, bassNote))
  }
  const curName = cur && chordName(cur.root, cur.q, bassNote)
  const addCur = () => curName && addChord(curName)
  const replaceSel = () => curName && sel && setChordAt(sel.si, sel.ci, curName)

  const selectSlot = (si, ci) => {
    setSel({ si, ci })
    preview(parseChord(sections[si].chords[ci]))
  }
  const selName = sel ? sections[sel.si]?.chords[sel.ci] : null
  const selParts = selName ? splitChord(selName) : null

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const [si, from] = active.id.split(':').map(Number)
    const [si2, to] = over.id.split(':').map(Number)
    if (si !== si2) return
    setSections((ss) => ss.map((s, i) => (i === si ? { ...s, chords: arrayMove(s.chords, from, to) } : s)))
    setSel({ si, ci: to })
  }

  const tapTempo = () => {
    const now = performance.now()
    const t = taps.current
    if (t.length && now - t[t.length - 1] > 2000) t.length = 0
    t.push(now)
    if (t.length > 7) t.shift()
    if (t.length >= 2) setBpm(clampBpm(60000 / ((t[t.length - 1] - t[0]) / (t.length - 1))))
  }

  const live = useRef()
  live.current = { pick, togglePlay, undo, addCur, inKey, sel, removeAt }
  useHotkeys('1,2,3,4,5,6,7', (e) => {
    const c = live.current.inKey[Number(e.key) - 1]
    if (c) live.current.pick(c.root, c.q, c.roman)
  })
  useHotkeys('space', () => live.current.togglePlay(), { preventDefault: true })
  useHotkeys('enter', () => live.current.addCur())
  useHotkeys('mod+z', () => live.current.undo(), { preventDefault: true })
  useHotkeys('delete,backspace', () => {
    const { sel: s, removeAt: rm } = live.current
    if (s) rm(s.si, s.ci)
  })

  const exportText =
    sections
      .filter((s) => s.chords.length)
      .map((s) => `${s.name}: | ${s.chords.join(' | ')} |`)
      .join('\n') + `\n\nคีย์: ${NOTES[key]} ${minor ? 'ไมเนอร์' : 'เมเจอร์'}, ${bpmNum} bpm`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* คัดลอกไม่ได้ ผู้ใช้เลือกข้อความเองได้ */
    }
  }
  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([exportText], { type: 'text/plain' }))
    a.download = 'mercury-heaven-chords.txt'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const demo = (patch) => preview(mkChord(key, minor ? 'm' : '', -1), patch)
  const curChord = cur ? mkChord(cur.root, cur.q, bassNote) : null

  return (
    <main>
      <h1>Mercury – "Heaven": แกะคอร์ดด้วยหู</h1>
      <p className="sub">เปิดเพลงคู่กับหน้านี้ เลือกคีย์ กดฟังคอร์ดเทียบกับเพลงจนตรง แล้วเพิ่มเข้าลำดับคอร์ด</p>

      <section>
        <h2>1. คีย์และเสียง</h2>
        <div className="setup">
          <KeyWheel value={key} minor={minor} onChange={(k) => { setKey(k); preview(mkChord(k, minor ? 'm' : '')) }} />
          <div className="setup-side">
            <div className="seg" role="radiogroup" aria-label="โหมด">
              <button role="radio" aria-checked={!minor} className={!minor ? 'on' : ''} onClick={() => setMinor(false)}>เมเจอร์ (สดใส)</button>
              <button role="radio" aria-checked={minor} className={minor ? 'on' : ''} onClick={() => setMinor(true)}>ไมเนอร์ (เศร้า)</button>
            </div>
            <div className="chips" role="radiogroup" aria-label="เครื่องดนตรี">
              {Object.entries(INSTRUMENTS).map(([id, p]) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={instrument === id}
                  className={'chip' + (instrument === id ? ' on' : '')}
                  onClick={() => { setInstrument(id); demo({ instrument: id }) }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="hint">
              ไม่แน่ใจคีย์? กดไล่คีย์บนวงกลม จนคอร์ดแรก (I) ฟังแล้วรู้สึกเหมือนได้กลับบ้าน คีย์ที่อยู่ติดกันบนวงกลมจะมีคอร์ดคล้ายกันมาก
            </p>
            <details>
              <summary>ตั้งค่าขั้นสูง (เบส / ออคเทฟ)</summary>
              <div className="row">
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
              </div>
            </details>
          </div>
        </div>
      </section>

      <section>
        <h2>2. คอร์ดให้เลือก (แตะเพื่อฟัง · กด 1–7 บนคีย์บอร์ด)</h2>
        <div className="grid7">
          {inKey.map((c, i) => (
            <ChordButton key={c.roman} {...c} hotkey={i + 1} active={cur?.root === c.root && cur?.q === c.q} onPick={pick} />
          ))}
        </div>
        <p className="hint">คอร์ดยืมที่พบบ่อย</p>
        <div className="gridx">
          {extra.map((c) => (
            <ChordButton key={c.roman} {...c} active={cur?.root === c.root && cur?.q === c.q} onPick={pick} />
          ))}
        </div>

        <div className="panel">
          <label className="check">
            <input type="checkbox" checked={autoAdd} onChange={(e) => setAutoAdd(e.target.checked)} />
            เพิ่มเข้าลำดับอัตโนมัติเมื่อแตะคอร์ด
          </label>
          {cur ? (
            <>
              <div className="panel-head">
                <strong className="big">{curName}</strong>
                <button className="primary" onClick={addCur}><Plus size={16} /> เพิ่มเข้าลำดับ</button>
                {sel && <button onClick={replaceSel}>แทนที่ช่องที่เลือก ({selName})</button>}
              </div>
              <div className="chips" aria-label="ชนิดคอร์ด">
                {QUALITIES.map((q) => (
                  <button
                    key={q}
                    className={'chip' + (cur.q === q ? ' on' : '')}
                    onClick={() => { setCur({ ...cur, q, roman: '' }); preview(mkChord(cur.root, q, bassNote)) }}
                  >
                    {qualityLabel(q)}
                  </button>
                ))}
              </div>
              <Keyboard pcs={pitchClasses(curChord)} bassPc={bassOn ? curChord.bass % 12 : -1} />
            </>
          ) : (
            <p className="hint">แตะคอร์ดด้านบนเพื่อฟัง จะเห็นโน้ตบนแป้นเปียโนและเปลี่ยนชนิดคอร์ด (7, maj7, sus4…) ได้ที่นี่</p>
          )}
        </div>
      </section>

      <section>
        <h2>3. ลำดับคอร์ด (ลากที่ไอคอน ⠿ เพื่อเรียงใหม่ · แตะเพื่อแก้ไข)</h2>
        <div className="chips">
          <span className="hint">เริ่มท่อนใหม่:</span>
          {SECTION_PRESETS.map((n) => <button key={n} className="chip" onClick={() => newSection(n)}>{n}</button>)}
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <div className="prog">
            {sections.map((s, si) => (
              <div className="sec" key={si}>
                <div className="bar">{s.name}:</div>
                <SortableContext items={s.chords.map((_, ci) => `${si}:${ci}`)} strategy={horizontalListSortingStrategy}>
                  <div className="slots">
                    {s.chords.map((c, ci) => (
                      <Slot
                        key={`${si}:${ci}`}
                        id={`${si}:${ci}`}
                        name={c}
                        selected={sel?.si === si && sel?.ci === ci}
                        playing={flat.findIndex((f) => f.si === si && f.ci === ci) === playingIdx}
                        onSelect={() => selectSlot(si, ci)}
                      />
                    ))}
                    {!s.chords.length && <span className="hint">ยังไม่มีคอร์ด</span>}
                  </div>
                </SortableContext>
              </div>
            ))}
          </div>
        </DndContext>

        {selParts && (
          <div className="panel">
            <div className="panel-head">
              <strong className="big">{selName}</strong>
              <label>เบส
                <select
                  value={selParts.bassPc}
                  onChange={(e) => setChordAt(sel.si, sel.ci, chordName(selParts.root, selParts.quality, +e.target.value))}
                >
                  <option value={-1}>ราก</option>
                  {NOTES.map((n, i) => <option key={n} value={i}>{n}</option>)}
                </select>
              </label>
              <button className="danger" onClick={() => removeAt(sel.si, sel.ci)}><Trash2 size={16} /> ลบ</button>
              <button onClick={() => setSel(null)}>เสร็จ</button>
            </div>
            <div className="chips" aria-label="ชนิดคอร์ด">
              {QUALITIES.map((q) => (
                <button
                  key={q}
                  className={'chip' + (selParts.quality === q ? ' on' : '')}
                  onClick={() => {
                    const n = chordName(selParts.root, q, selParts.bassPc)
                    setChordAt(sel.si, sel.ci, n)
                    preview(parseChord(n))
                  }}
                >
                  {qualityLabel(q)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="row">
          <button onClick={clearAll}>ล้างทั้งหมด</button>
        </div>
      </section>

      <section>
        <h2>4. รายการคอร์ดของคุณ</h2>
        <textarea readOnly value={exportText} />
        <div className="row">
          <button onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</button>
          <button onClick={download}><Download size={16} /> ดาวน์โหลด .txt</button>
        </div>
        <p className="hint">คีย์ลัด: 1–7 เล่นคอร์ด · Enter เพิ่มคอร์ด · Space เล่น/หยุด · Ctrl/⌘+Z ย้อนกลับ · Delete ลบช่องที่เลือก</p>
      </section>

      <footer className="version">Cords v{__APP_VERSION__}</footer>

      <nav className="transport" aria-label="ควบคุมการเล่น">
        <button className="primary play" onClick={togglePlay} disabled={!total} aria-label={playing ? 'หยุด' : 'เล่นลำดับคอร์ด'}>
          {playing ? <Square size={20} /> : <Play size={20} />}
        </button>
        <div className="now" aria-live="polite">
          <small>{playing ? 'กำลังเล่น' : total ? `${total} คอร์ด${sel ? ' · เริ่มจากช่องที่เลือก' : ''}` : 'ยังไม่มีคอร์ด'}</small>
          <strong>{playingName ?? '–'}</strong>
        </div>
        <div className="bpmbox">
          <button aria-label="ลด bpm" onClick={() => setBpm(clampBpm(bpmNum - 5))}><Minus size={16} /></button>
          <input
            type="number" min="40" max="200" value={bpm} aria-label="bpm"
            onChange={(e) => setBpm(e.target.value)}
            onBlur={() => setBpm(bpmNum)}
          />
          <button aria-label="เพิ่ม bpm" onClick={() => setBpm(clampBpm(bpmNum + 5))}><Plus size={16} /></button>
        </div>
        <button onClick={tapTempo} title="แตะตามจังหวะเพลงเพื่อหา bpm"><Hand size={16} /> Tap</button>
        <button onClick={undo} aria-label="ย้อนกลับ"><Undo2 size={16} /></button>
      </nav>
    </main>
  )
}
