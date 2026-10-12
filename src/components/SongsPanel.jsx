import { useRef } from 'react'
import { Copy, Download, FilePlus, Trash2, Upload } from 'lucide-react'

export default function SongsPanel({ songs, onSwitch, onNew, onDuplicate, onDelete, onRename, onExport, onImport }) {
  const file = useRef(null)
  const ids = Object.keys(songs.items)
  return (
    <section>
      <h2>เพลงของฉัน</h2>
      <div className="row songs">
        <select value={songs.current} onChange={(e) => onSwitch(e.target.value)} aria-label="เลือกเพลง">
          {ids.map((id) => <option key={id} value={id}>{songs.items[id].title || '(ไม่มีชื่อ)'}</option>)}
        </select>
        <input
          className="song-title" value={songs.items[songs.current]?.title ?? ''} maxLength={60}
          onChange={(e) => onRename(e.target.value)} placeholder="ชื่อเพลง" aria-label="ชื่อเพลง"
        />
      </div>
      <div className="row">
        <button onClick={onNew}><FilePlus size={16} /> เพลงใหม่</button>
        <button onClick={onDuplicate}><Copy size={16} /> ทำสำเนา</button>
        <button className="danger" onClick={onDelete} disabled={ids.length < 2}><Trash2 size={16} /> ลบเพลงนี้</button>
        <button onClick={onExport}><Download size={16} /> ส่งออก .json</button>
        <button onClick={() => file.current.click()}><Upload size={16} /> นำเข้า .json</button>
        <input
          ref={file} type="file" accept="application/json,.json" hidden
          onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onImport(f) }}
        />
      </div>
      <p className="hint">แต่ละเพลงเก็บคีย์ จังหวะ ลำดับคอร์ด และลิงก์ YouTube ไว้ในเบราว์เซอร์นี้</p>
    </section>
  )
}
