import { useEffect, useMemo, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, Copy, Download, GripVertical, Hand, Minimize2, Maximize2, Minus, Play, Plus, Square, Trash2, Undo2 } from 'lucide-react'
import { INSTRUMENTS, playChord, playClick } from './audio.js'
import { DEFAULT_SECTIONS, NOTES, QUALITIES, buildPlan, chordName, mkChord, normalizeSections, paletteFor, parseChord, pitchClasses, splitChord, transposeName } from './music.js'
import KeyWheel from './components/KeyWheel.jsx'
import Keyboard from './components/Keyboard.jsx'
import YouTubePlayer from './components/YouTubePlayer.jsx'
import SongsPanel from './components/SongsPanel.jsx'

function usePersistentState(key, initial, revive = (v) => v) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : revive(JSON.parse(raw))
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
const BEATS = [1, 2, 3, 4, 6, 8]
const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const safeName = (t) => (t || 'cords').replace(/[\\/:*?"<>|]+/g, '').trim() || 'cords'
const clampBpm = (n) => Math.min(200, Math.max(40, Math.round(n)))
const qualityLabel = (q) => (q === '' ? 'maj' : q)

function youtubeId(input) {
  const t = input.trim()
  if (/^[\w-]{11}$/.test(t)) return t
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
    const host = u.hostname.replace(/^(www|m|music)\./, '')
    let id = null
    if (host === 'youtu.be') id = u.pathname.split('/')[1]
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const [, kind, rest] = u.pathname.split('/')
      id = kind === 'watch' ? u.searchParams.get('v') : ['embed', 'shorts', 'live', 'v'].includes(kind) ? rest : null
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null
  } catch {
    return null
  }
}

function ChordButton({ root, q, roman, hotkey, active, onPick }) {
  return (
    <button className={'chord' + (active ? ' active' : '')} onClick={() => onPick(root, q, roman)}>
      {hotkey && <kbd>{hotkey}</kbd>}
      {chordName(root, q)}
      <small>{roman}</small>
    </button>
  )
}

function Slot({ id, name, time, beats, selected, playing, onSelect }) {
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
      <button className="name" onClick={onSelect}>
        {name}
        {(time != null || beats !== 2) && (
          <small>{[time != null && fmtTime(time), beats !== 2 && `×${beats}`].filter(Boolean).join(' · ')}</small>
        )}
      </button>
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
  const [sections, setSections] = usePersistentState('cords-sections', DEFAULT_SECTIONS(), normalizeSections)
  const [cur, setCur] = useState(null) // คอร์ดที่เลือกล่าสุดจากแผง { root, q, roman }
  const [sel, setSel] = useState(null) // ช่องในลำดับที่เลือก { si, ci }
  const [playingAt, setPlayingAt] = useState(null) // { si, ci } ของช่องที่กำลังเล่น
  const [counting, setCounting] = useState(false)
  const [metro, setMetro] = usePersistentState('cords-metro', false)
  const [countIn, setCountIn] = usePersistentState('cords-count-in', false)
  const [syncVideo, setSyncVideo] = usePersistentState('cords-sync-video', false)
  const [ytStamp, setYtStamp] = usePersistentState('cords-yt-stamp', false)
  const [songs, setSongs] = usePersistentState('cords-songs', { current: 's1', items: { s1: { title: 'เพลงที่ 1' } } })
  const [copied, setCopied] = useState(false)
  const [ytUrl, setYtUrl] = usePersistentState('cords-yt-url', '')
  const ytId = youtubeId(ytUrl)
  const [ytMini, setYtMini] = usePersistentState('cords-yt-mini', false)
  const [ytPos, setYtPos] = usePersistentState('cords-yt-pos', null) // ตำแหน่งจอเล็ก { x, y } (px จากมุมซ้ายบน)
  const ytBox = useRef(null)
  const ytApi = useRef(null)
  const ytDrag = useRef(null)
  const ytDown = (e) => {
    if (e.target.closest('button')) return
    const r = ytBox.current.getBoundingClientRect()
    ytDrag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const ytMove = (e) => {
    const d = ytDrag.current
    if (!d) return
    const r = ytBox.current.getBoundingClientRect()
    setYtPos({
      x: Math.min(Math.max(0, e.clientX - d.dx), window.innerWidth - r.width),
      y: Math.min(Math.max(0, e.clientY - d.dy), window.innerHeight - r.height),
    })
  }
  const ytUp = () => { ytDrag.current = null }
  const timer = useRef(null)
  const videoStarted = useRef(false)
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
  const plan = useMemo(() => buildPlan(sections), [sections])
  const playing = !!playingAt || counting
  const playingName = playingAt ? sections[playingAt.si]?.chords[playingAt.ci]?.n : null
  const flags = useRef()
  flags.current = { metro, syncVideo }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const halt = () => {
    clearTimeout(timer.current)
    timer.current = null
    setPlayingAt(null)
    setCounting(false)
  }
  const stop = () => {
    halt()
    if (videoStarted.current) {
      videoStarted.current = false
      ytApi.current?.pause()
    }
  }
  useEffect(() => stop, [])

  // อ่านจาก ref ทุกรอบ เพื่อให้แก้คอร์ดหรือปรับ bpm ระหว่างเล่นแล้วมีผลทันที
  const loop = () => {
    const list = buildPlan(sectionsRef.current)
    if (!list.length) return stop()
    const i = idxRef.current % list.length
    idxRef.current = i + 1
    const e = list[i]
    const o = optsRef.current
    setPlayingAt({ si: e.si, ci: e.ci })
    playChord(parseChord(e.n), { ...o, beats: e.b })
    if (flags.current.metro) for (let k = 0; k < e.b; k++) playClick(k === 0, (60 / o.bpm) * k)
    timer.current = setTimeout(loop, (60 / o.bpm) * e.b * 1000)
  }
  const play = () => {
    stop()
    const start = sel ? Math.max(plan.findIndex((e) => e.si === sel.si && e.ci === sel.ci), 0) : 0
    idxRef.current = start
    const begin = () => {
      timer.current = null
      setCounting(false)
      const f = plan[start]
      const t = f && sectionsRef.current[f.si]?.chords[f.ci]?.t
      if (flags.current.syncVideo && ytApi.current) {
        if (t != null) ytApi.current.seek(t)
        ytApi.current.play()
        videoStarted.current = true
      }
      loop()
    }
    if (countIn) {
      const beat = 60 / optsRef.current.bpm
      setCounting(true)
      for (let k = 0; k < 4; k++) playClick(k === 0, beat * k)
      timer.current = setTimeout(begin, beat * 4 * 1000)
    } else begin()
  }
  const togglePlay = () => (playing ? stop() : play())

  const preview = (chord, override = {}) => playChord(chord, { ...optsRef.current, ...override })

  const addChord = (name) => {
    const c = { n: name }
    const t = ytStamp ? ytApi.current?.getTime() : null
    if (t != null) c.t = Math.round(t * 10) / 10
    setSections((ss) => ss.map((s, i) => (i === ss.length - 1 ? { ...s, chords: [...s.chords, c] } : s)))
    setSel(null)
  }
  // patch ที่เป็น undefined = ลบฟิลด์นั้นออก
  const patchChord = (si, ci, patch) =>
    setSections((ss) =>
      ss.map((s, i) =>
        i === si
          ? {
              ...s,
              chords: s.chords.map((c, j) => {
                if (j !== ci) return c
                const n = { ...c, ...patch }
                Object.keys(n).forEach((k) => n[k] === undefined && delete n[k])
                return n
              }),
            }
          : s,
      ),
    )
  const setChordAt = (si, ci, name) => patchChord(si, ci, { n: name })
  const setRep = (si, rep) => setSections((ss) => ss.map((s, i) => (i === si ? { ...s, rep } : s)))
  const removeAt = (si, ci) => {
    setSections((ss) => ss.map((s, i) => (i === si ? { ...s, chords: s.chords.filter((_, j) => j !== ci) } : s)))
    setSel(null)
  }
  const newSection = (name) =>
    setSections((ss) => {
      const last = ss[ss.length - 1]
      return last.chords.length
        ? [...ss, { name, rep: 1, chords: [] }]
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
      setSections(DEFAULT_SECTIONS())
    }
  }
  const transpose = (n) => {
    setSections((ss) => ss.map((s) => ({ ...s, chords: s.chords.map((c) => ({ ...c, n: transposeName(c.n, n) })) })))
    setKey((k) => (((k + n) % 12) + 12) % 12)
    setCur(null)
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
    const c = sections[si].chords[ci]
    setSel({ si, ci })
    preview(parseChord(c.n))
    if (c.t != null) ytApi.current?.seek(c.t)
  }
  const selChord = sel ? sections[sel.si]?.chords[sel.ci] : null
  const selName = selChord?.n ?? null
  const stampSel = () => {
    const t = ytApi.current?.getTime()
    if (t != null) patchChord(sel.si, sel.ci, { t: Math.round(t * 10) / 10 })
  }
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
  useHotkeys('k', () => ytApi.current?.toggle())
  useHotkeys('j', () => ytApi.current?.back())
  useHotkeys('enter', () => live.current.addCur())
  useHotkeys('mod+z', () => live.current.undo(), { preventDefault: true })
  useHotkeys('delete,backspace', () => {
    const { sel: s, removeAt: rm } = live.current
    if (s) rm(s.si, s.ci)
  })

  const title = songs.items[songs.current]?.title ?? ''
  const exportText =
    (title ? `${title}\n\n` : '') +
    sections
      .filter((s) => s.chords.length)
      .map((s) => `${s.name}${s.rep > 1 ? ` ×${s.rep}` : ''}: | ${s.chords.map((c) => c.n).join(' | ')} |`)
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
    a.download = `${safeName(title)}-chords.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const snapshot = () => ({ key, minor, bpm: bpmNum, sections, ytUrl })
  const applySong = (d) => {
    stop()
    setSel(null)
    setCur(null)
    setKey(Number.isInteger(d.key) ? ((d.key % 12) + 12) % 12 : 0)
    setMinor(!!d.minor)
    setBpm(clampBpm(Number(d.bpm) || 80))
    setSections(normalizeSections(d.sections))
    setYtUrl(typeof d.ytUrl === 'string' ? d.ytUrl : '')
  }
  const withCurrentSaved = (s) => ({ ...s.items, [s.current]: { ...s.items[s.current], data: snapshot() } })
  const addSong = (title, data) => {
    const id = 's' + Date.now().toString(36)
    setSongs((s) => ({ current: id, items: { ...withCurrentSaved(s), [id]: { title, data } } }))
    applySong(data)
  }
  const switchSong = (id) => {
    if (id === songs.current || !songs.items[id]) return
    setSongs((s) => ({ current: id, items: withCurrentSaved(s) }))
    applySong(songs.items[id].data ?? {})
  }
  const newSong = () => addSong(`เพลงที่ ${Object.keys(songs.items).length + 1}`, {})
  const duplicateSong = () => addSong(`${title || 'เพลง'} (สำเนา)`, snapshot())
  const deleteSong = () => {
    const ids = Object.keys(songs.items)
    if (ids.length < 2 || !confirm(`ลบเพลง "${title}" หรือไม่?`)) return
    const rest = { ...songs.items }
    delete rest[songs.current]
    const next = Object.keys(rest)[0]
    setSongs({ current: next, items: rest })
    applySong(rest[next].data ?? {})
  }
  const renameSong = (t) => setSongs((s) => ({ ...s, items: { ...s.items, [s.current]: { ...s.items[s.current], title: t } } }))
  const exportSong = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'cords', title, ...snapshot() }, null, 2)], { type: 'application/json' }))
    a.download = `${safeName(title)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importSong = async (file) => {
    try {
      const d = JSON.parse(await file.text())
      if (!d || typeof d !== 'object' || !Array.isArray(d.sections)) throw new Error('bad file')
      addSong(typeof d.title === 'string' && d.title ? d.title.slice(0, 60) : file.name.replace(/\.json$/i, ''), {
        key: d.key, minor: d.minor, bpm: d.bpm, sections: normalizeSections(d.sections), ytUrl: d.ytUrl,
      })
    } catch {
      alert('ไฟล์ไม่ถูกต้อง นำเข้าไม่ได้')
    }
  }

  const demo = (patch) => preview(mkChord(key, minor ? 'm' : '', -1), patch)
  const curChord = cur ? mkChord(cur.root, cur.q, bassNote) : null

  return (
    <main>
      <section className={'ytsec' + (ytMini ? ' mini' : '')}>
        <div className="yt-head">
          <h2>เพลงอ้างอิงจาก YouTube</h2>
          <button aria-pressed={ytMini} onClick={() => setYtMini(!ytMini)} aria-label={ytMini ? 'ขยาย' : 'ย่อ'} title={ytMini ? 'ขยาย' : 'ย่อ (เสียงยังเล่นต่อ)'}>
            {ytMini ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>
        </div>
        <input
          type="url" className="yt-url" value={ytUrl} placeholder="วางลิงก์ YouTube ที่นี่"
          aria-label="ลิงก์ YouTube" onChange={(e) => setYtUrl(e.target.value)}
        />
        {ytUrl.trim() && !ytId && <p className="hint">ลิงก์ไม่ถูกต้อง</p>}
        {ytId && (
          <div
            ref={ytBox}
            className={'yt' + (ytMini ? ' float' : '')}
            style={ytMini && ytPos ? { left: ytPos.x, top: ytPos.y, right: 'auto', bottom: 'auto' } : undefined}
          >
            <div className="yt-bar" onPointerDown={ytDown} onPointerMove={ytMove} onPointerUp={ytUp} onPointerCancel={ytUp}>
              <GripVertical size={14} />
              <span>ลากเพื่อย้าย</span>
              <button onClick={() => setYtMini(false)} aria-label="ขยาย"><Maximize2 size={14} /></button>
            </div>
            <YouTubePlayer videoId={ytId} apiRef={ytApi} />
          </div>
        )}
      </section>

      <SongsPanel
        songs={songs} onSwitch={switchSong} onNew={newSong} onDuplicate={duplicateSong}
        onDelete={deleteSong} onRename={renameSong} onExport={exportSong} onImport={importSong}
      />

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
                <div className="bar">
                  {s.name}:
                  <select className="rep" value={s.rep} onChange={(e) => setRep(si, +e.target.value)} aria-label={`จำนวนรอบของ ${s.name}`}>
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n === 1 ? 'ไม่ซ้ำ' : `ซ้ำ ×${n}`}</option>)}
                  </select>
                </div>
                <SortableContext items={s.chords.map((_, ci) => `${si}:${ci}`)} strategy={horizontalListSortingStrategy}>
                  <div className="slots">
                    {s.chords.map((c, ci) => (
                      <Slot
                        key={`${si}:${ci}`}
                        id={`${si}:${ci}`}
                        name={c.n}
                        time={c.t}
                        beats={c.b ?? 2}
                        selected={sel?.si === si && sel?.ci === ci}
                        playing={playingAt?.si === si && playingAt?.ci === ci}
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
            <div className="chips" aria-label="จำนวนจังหวะ">
              <span className="hint">จังหวะ:</span>
              {BEATS.map((b) => (
                <button
                  key={b} className={'chip' + ((selChord.b ?? 2) === b ? ' on' : '')}
                  onClick={() => patchChord(sel.si, sel.ci, { b: b === 2 ? undefined : b })}
                >
                  {b}
                </button>
              ))}
            </div>
            <div className="chips" aria-label="เวลาในเพลง">
              <span className="hint">เวลาในเพลง: {selChord.t != null ? fmtTime(selChord.t) : '–'}</span>
              <button onClick={stampSel} disabled={!ytId}>ปักเวลาปัจจุบัน</button>
              <button onClick={() => ytApi.current?.seek(selChord.t)} disabled={selChord.t == null || !ytId}>ไปที่เวลานี้</button>
              <button onClick={() => patchChord(sel.si, sel.ci, { t: undefined })} disabled={selChord.t == null}>ลบเวลา</button>
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
          <span className="hint">เลื่อนคีย์ทั้งเพลง ({NOTES[key]}{minor ? 'm' : ''}):</span>
          <button onClick={() => transpose(-1)} disabled={!total} aria-label="ลดครึ่งเสียง"><Minus size={16} /> ½</button>
          <button onClick={() => transpose(1)} disabled={!total} aria-label="เพิ่มครึ่งเสียง"><Plus size={16} /> ½</button>
        </div>
        <div className="chips">
          <label className="check"><input type="checkbox" checked={metro} onChange={(e) => setMetro(e.target.checked)} /> เมโทรนอม</label>
          <label className="check"><input type="checkbox" checked={countIn} onChange={(e) => setCountIn(e.target.checked)} /> นับเข้า 4 จังหวะ</label>
          <label className="check" title="เริ่มวิดีโอพร้อมคอร์ด โดยเริ่มที่เวลาของช่องแรกที่เล่น (ถ้าปักเวลาไว้)">
            <input type="checkbox" checked={syncVideo} onChange={(e) => setSyncVideo(e.target.checked)} /> เล่นวิดีโอพร้อมกัน
          </label>
          <label className="check"><input type="checkbox" checked={ytStamp} onChange={(e) => setYtStamp(e.target.checked)} /> ปักเวลาอัตโนมัติเมื่อเพิ่มคอร์ด</label>
        </div>
      </section>

      <section>
        <h2>4. รายการคอร์ดของคุณ</h2>
        <textarea readOnly value={exportText} />
        <div className="row">
          <button onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</button>
          <button onClick={download}><Download size={16} /> ดาวน์โหลด .txt</button>
        </div>
        <p className="hint">คีย์ลัด: 1–7 เล่นคอร์ด · Enter เพิ่มคอร์ด · Space เล่น/หยุดคอร์ด · K เล่น/หยุดวิดีโอ · J ถอย 5 วินาที · Ctrl/⌘+Z ย้อนกลับ · Delete ลบช่องที่เลือก</p>
      </section>

      <nav className="transport" aria-label="ควบคุมการเล่น">
        <footer className="version">Cords v{__APP_VERSION__}</footer>
        <button className="primary play" onClick={togglePlay} disabled={!total} aria-label={playing ? 'หยุด' : 'เล่นลำดับคอร์ด'}>
          {playing ? <Square size={20} /> : <Play size={20} />}
        </button>
        <div className="now" aria-live="polite">
          <small>{counting ? 'นับเข้า…' : playing ? 'กำลังเล่น' : total ? `${total} คอร์ด${sel ? ' · เริ่มจากช่องที่เลือก' : ''}` : 'ยังไม่มีคอร์ด'}</small>
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
