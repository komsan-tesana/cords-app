export const INSTRUMENTS = {
  piano: { label: 'เปียโน', type: 'triangle', harm: [1, 0.4, 0.15], atk: 0.005, sus: false, cut: 4000, strum: 0, gain: 0.16 },
  guitar: { label: 'กีตาร์โปร่ง (ดีด)', type: 'sawtooth', harm: [1, 0.3], atk: 0.003, sus: false, cut: 2200, strum: 0.035, gain: 0.1, short: 0.8 },
  epiano: { label: 'อิเล็กทริกเปียโน', type: 'sine', harm: [1, 0.5, 0.2, 0.1], atk: 0.004, sus: false, cut: 6000, strum: 0, gain: 0.16 },
  organ: { label: 'ออร์แกน', type: 'sine', harm: [1, 0.7, 0.5, 0.3, 0.2], atk: 0.03, sus: true, cut: 5000, strum: 0, gain: 0.09 },
  pad: { label: 'ซินธ์แพด', type: 'sawtooth', harm: [1], atk: 0.35, sus: true, cut: 1400, strum: 0, gain: 0.07, detune: 6 },
  bell: { label: 'เสียงระฆัง', type: 'sine', harm: [1, 0.6, 0.3], atk: 0.002, sus: false, cut: 9000, strum: 0, gain: 0.14, ratio: [1, 2.76, 5.4], long: 1.6 },
}

let ctx
const getCtx = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)())
const freqOf = (midi) => 440 * Math.pow(2, (midi - 69) / 12)

function tone(ac, freq, t, dur, p) {
  const len = dur * (p.short || p.long || 1)
  const master = ac.createGain()
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = p.cut
  master.gain.setValueAtTime(0, t)
  master.gain.linearRampToValueAtTime(p.gain, t + p.atk)
  if (p.sus) {
    master.gain.setValueAtTime(p.gain, t + len * 0.8)
    master.gain.linearRampToValueAtTime(0.0001, t + len)
  } else {
    master.gain.exponentialRampToValueAtTime(0.0001, t + len)
  }
  master.connect(lp).connect(ac.destination)
  p.harm.forEach((h, i) => {
    const mult = p.ratio ? p.ratio[i] : i + 1
    const dets = p.detune ? [-p.detune, p.detune] : [0]
    dets.forEach((d) => {
      const o = ac.createOscillator()
      const g = ac.createGain()
      o.type = p.type
      o.frequency.value = freq * mult
      o.detune.value = d
      g.gain.value = h
      o.connect(g).connect(master)
      o.start(t)
      o.stop(t + len + 0.05)
    })
  })
}

function bassTone(ac, freq, t, dur) {
  const lp = ac.createBiquadFilter()
  const g = ac.createGain()
  lp.type = 'lowpass'
  lp.frequency.value = 500
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.35, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  lp.connect(g).connect(ac.destination)
  ;[['sine', 1], ['triangle', 0.4]].forEach(([type, amp]) => {
    const o = ac.createOscillator()
    const og = ac.createGain()
    o.type = type
    o.frequency.value = freq
    og.gain.value = amp
    o.connect(og).connect(lp)
    o.start(t)
    o.stop(t + dur + 0.05)
  })
}

// chord = { notes: [midi], bass: midi }
export function playChord(chord, { instrument, bpm, bassOn, chordOct, bassOct, beats = 2 }) {
  const ac = getCtx()
  const p = INSTRUMENTS[instrument]
  const dur = (60 / bpm) * beats
  const t0 = ac.currentTime
  chord.notes.forEach((m, k) => tone(ac, freqOf(m + 12 * chordOct), t0 + k * p.strum, dur * 0.9, p))
  if (bassOn) bassTone(ac, freqOf(chord.bass + 12 * bassOct), t0, dur * 0.95)
}

// เสียงคลิกเมโทรนอม; delay = วินาทีนับจากตอนนี้, accent = จังหวะแรก
export function playClick(accent, delay = 0) {
  const ac = getCtx()
  const t = ac.currentTime + delay
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.type = 'square'
  o.frequency.value = accent ? 1600 : 1100
  g.gain.setValueAtTime(accent ? 0.12 : 0.07, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
  o.connect(g).connect(ac.destination)
  o.start(t)
  o.stop(t + 0.06)
}
