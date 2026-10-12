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
