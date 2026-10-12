import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Pause, Play, Repeat, RotateCcw } from 'lucide-react'

const RATES = [0.5, 0.75, 1]
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

let apiPromise
function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  apiPromise ??= new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT) }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  })
  return apiPromise
}

// เครื่องเล่น YouTube ผ่าน IFrame API: ปรับความเร็ว, วนลูปช่วง A–B, ถอย 5 วินาที
// apiRef.current = { toggle, back } ให้ App เรียกจากคีย์ลัด
export default function YouTubePlayer({ videoId, apiRef }) {
  const wrap = useRef(null)
  const player = useRef(null)
  const idRef = useRef(videoId)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [loop, setLoop] = useState({ a: null, b: null, on: false })
  const rateRef = useRef(rate)
  const loopRef = useRef(loop)
  rateRef.current = rate
  loopRef.current = loop

  useEffect(() => {
    let dead = false
    const host = document.createElement('div')
    wrap.current.appendChild(host)
    loadApi().then((YT) => {
      if (dead) return
      player.current = new YT.Player(host, {
        videoId: idRef.current,
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, rel: 0 },
        host: 'https://www.youtube-nocookie.com',
        events: {
          onReady: () => { setReady(true); player.current.setPlaybackRate(rateRef.current) },
          onStateChange: (e) => {
            setPlaying(e.data === YT.PlayerState.PLAYING)
            if (e.data === YT.PlayerState.PLAYING) player.current.setPlaybackRate(rateRef.current)
          },
        },
      })
    })
    return () => {
      dead = true
      player.current?.destroy?.()
      player.current = null
      setReady(false)
      host.remove()
    }
  }, [])

  useEffect(() => {
    if (idRef.current === videoId) return
    idRef.current = videoId
    setLoop({ a: null, b: null, on: false })
    if (ready) player.current.cueVideoById(videoId)
  }, [videoId, ready])

  // วนลูปช่วง A–B
  useEffect(() => {
    if (!ready) return
    const t = setInterval(() => {
      const { a, b, on } = loopRef.current
      if (on && a != null && b != null && player.current.getCurrentTime() >= b) player.current.seekTo(a, true)
    }, 150)
    return () => clearInterval(t)
  }, [ready])

  const toggle = () => {
    if (!ready) return
    if (player.current.getPlayerState() === 1) player.current.pauseVideo()
    else player.current.playVideo()
  }
  const back = () => ready && player.current.seekTo(Math.max(0, player.current.getCurrentTime() - 5), true)
  useImperativeHandle(apiRef, () => ({ toggle, back }))

  const pickRate = (r) => {
    setRate(r)
    if (ready) player.current.setPlaybackRate(r)
  }
  const mark = (k) => {
    if (!ready) return
    const t = player.current.getCurrentTime()
    setLoop((l) => {
      const n = { ...l, [k]: t }
      if (n.a != null && n.b != null && n.b <= n.a) n[k === 'a' ? 'b' : 'a'] = null
      n.on = n.a != null && n.b != null
      return n
    })
  }

  return (
    <>
      <div className="yt-frame" ref={wrap} />
      <div className="yt-ctrl">
        <button onClick={toggle} disabled={!ready} aria-label={playing ? 'หยุดวิดีโอ' : 'เล่นวิดีโอ'} title="เล่น/หยุดวิดีโอ (K)">
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button onClick={back} disabled={!ready} aria-label="ถอย 5 วินาที" title="ถอย 5 วินาที (J)"><RotateCcw size={16} /> 5s</button>
        <span className="yt-rates" role="group" aria-label="ความเร็ว">
          {RATES.map((r) => (
            <button key={r} className={'chip' + (rate === r ? ' on' : '')} onClick={() => pickRate(r)}>{r}x</button>
          ))}
        </span>
        <span className="yt-ab" role="group" aria-label="วนลูป A–B">
          <button className={loop.a != null ? 'on' : ''} onClick={() => mark('a')} disabled={!ready} title="ตั้งจุดเริ่มวนลูป">
            A{loop.a != null && ` ${fmt(loop.a)}`}
          </button>
          <button className={loop.b != null ? 'on' : ''} onClick={() => mark('b')} disabled={!ready} title="ตั้งจุดจบวนลูป">
            B{loop.b != null && ` ${fmt(loop.b)}`}
          </button>
          <button
            className={loop.on ? 'on' : ''} aria-pressed={loop.on}
            disabled={loop.a == null || loop.b == null}
            onClick={() => setLoop({ ...loop, on: !loop.on })}
            aria-label="วนลูป" title="เปิด/ปิดวนลูป"
          >
            <Repeat size={16} />
          </button>
          {(loop.a != null || loop.b != null) && (
            <button onClick={() => setLoop({ a: null, b: null, on: false })} title="ล้างจุด A–B">ล้าง</button>
          )}
        </span>
      </div>
    </>
  )
}
