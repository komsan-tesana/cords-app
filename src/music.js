export const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

const MAJ = [0, 2, 4, 5, 7, 9, 11]
const MIN = [0, 2, 3, 5, 7, 8, 10]
const MAJ_Q = ['', 'm', 'm', '', '', 'm', 'dim']
const MIN_Q = ['m', 'dim', '', 'm', 'm', '', '']
const MAJ_R = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']
const MIN_R = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']

// [ระยะจากคีย์ (semitone), quality, เลขโรมัน]
const MAJ_EXTRA = [
  [10, '', '♭VII'], [8, '', '♭VI'], [5, 'm', 'iv'], [9, '', 'VI'], [2, '', 'II'],
  [4, '', 'III'], [7, '7', 'V7'], [0, 'maj7', 'Imaj7'], [5, 'maj7', 'IVmaj7'], [9, 'm7', 'vi7'],
]
const MIN_EXTRA = [[0, '', 'I'], [5, '', 'IV'], [7, '', 'V'], [7, '7', 'V7']]

const QUALITY = {
  '': [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], 7: [0, 4, 7, 10],
  m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7],
}

export const chordNotes = (root, q) =>
  (QUALITY[q] ?? QUALITY['']).map((i) => 48 + ((root + i) % 12) + (root + i >= 12 ? 12 : 0))

export const chordName = (root, q, bassPc = -1) =>
  NOTES[root % 12] + q + (bassPc >= 0 && bassPc !== root % 12 ? '/' + NOTES[bassPc] : '')

// bassPc: -1 = ใช้ตัวรากของคอร์ด
export const mkChord = (root, q, bassPc = -1) => ({
  notes: chordNotes(root, q),
  bass: 36 + (bassPc >= 0 ? bassPc : root % 12),
})

const CHORD_RE = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/

export function splitChord(name) {
  const m = name.match(CHORD_RE)
  return { root: NOTES.indexOf(m[1]), quality: m[2], bassPc: m[3] ? NOTES.indexOf(m[3]) : -1 }
}

export function parseChord(name) {
  const { root, quality, bassPc } = splitChord(name)
  return mkChord(root, quality, bassPc)
}

export function paletteFor(key, minor) {
  const sc = minor ? MIN : MAJ
  const qs = minor ? MIN_Q : MAJ_Q
  const rs = minor ? MIN_R : MAJ_R
  const inKey = sc.map((s, i) => ({ root: (key + s) % 12, q: qs[i], roman: rs[i] }))
  const extra = (minor ? MIN_EXTRA : MAJ_EXTRA).map(([s, q, roman]) => ({ root: (key + s) % 12, q, roman }))
  return { inKey, extra }
}

// ชนิดคอร์ดที่เลือกได้ในหน้าจอแก้ไข
export const QUALITIES = ['', 'm', '7', 'm7', 'maj7', 'sus4', 'dim']

export const pitchClasses = (chord) => [...new Set(chord.notes.map((n) => n % 12))]

const mod12 = (n) => ((n % 12) + 12) % 12

// เลื่อนคอร์ดขึ้น/ลง n เซมิโทน (รวมโน้ตเบสของคอร์ด slash)
export function transposeName(name, n) {
  const { root, quality, bassPc } = splitChord(name)
  return chordName(mod12(root + n), quality, bassPc >= 0 ? mod12(bassPc + n) : -1)
}

// ช่องคอร์ด = { n: ชื่อคอร์ด, t?: วินาทีในเพลง, b?: จำนวนจังหวะ (ปกติ 2) }
// ท่อน = { name, rep, chords } รับข้อมูลเก่า (คอร์ดเป็นสตริง, ไม่มี rep) และไฟล์นำเข้าที่อาจผิดรูป
export const DEFAULT_SECTIONS = () => [{ name: 'Verse', rep: 1, chords: [] }]
export function normalizeSections(raw) {
  if (!Array.isArray(raw) || !raw.length) return DEFAULT_SECTIONS()
  const out = raw.filter((s) => s && typeof s === 'object').map((s) => ({
    name: typeof s.name === 'string' ? s.name.slice(0, 40) : 'Verse',
    rep: Math.min(4, Math.max(1, Math.round(Number(s.rep)) || 1)),
    chords: (Array.isArray(s.chords) ? s.chords : [])
      .map((c) => (typeof c === 'string' ? { n: c } : c))
      .filter((c) => c && typeof c.n === 'string' && CHORD_RE.test(c.n) && NOTES.includes(c.n.match(CHORD_RE)[1]))
      .map((c) => {
        const o = { n: c.n }
        if (Number.isFinite(c.t) && c.t >= 0) o.t = c.t
        if (Number.isInteger(c.b) && c.b >= 1 && c.b <= 16 && c.b !== 2) o.b = c.b
        return o
      }),
  }))
  return out.length ? out : DEFAULT_SECTIONS()
}

// ลำดับที่เล่นจริง: กางท่อนที่ซ้ำออกมา
export function buildPlan(sections) {
  return sections.flatMap((s, si) =>
    Array.from({ length: s.rep || 1 }, () => s.chords.map((c, ci) => ({ si, ci, n: c.n, b: c.b ?? 2 }))).flat(),
  )
}
