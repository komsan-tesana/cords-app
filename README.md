# Cords – แกะคอร์ดด้วยหู

เว็บแอปช่วยแกะคอร์ดเพลง (เริ่มจาก Mercury – "Heaven") เลือกคีย์ เครื่องดนตรี เสียงเบส/สแลชคอร์ด และออคเทฟ แล้วฟังเทียบกับเพลง
เสียงทั้งหมดสังเคราะห์ด้วย Web Audio ในเบราว์เซอร์ ข้อมูลเก็บใน localStorage

## รันในเครื่อง
```bash
npm install
npm run dev
```

## Deploy ขึ้น GitHub Pages (จาก branch main)
1. `npm run build` จะสร้างไฟล์เว็บในโฟลเดอร์ `docs/` (commit โฟลเดอร์นี้ขึ้น `main` ด้วย)
2. ที่ GitHub: Settings → Pages → Source เลือก **Deploy from a branch** → Branch `main` โฟลเดอร์ `/docs`
3. เว็บจะอยู่ที่ https://komsan-tesana.github.io/cords-app/

ทุกครั้งที่แก้โค้ด ให้ commit โค้ดก่อน แล้วรัน `npm run deploy` (build + commit + push `docs/` ขึ้น main ให้อัตโนมัติ)
ถ้าเปลี่ยนชื่อ repo ให้แก้ `base` ใน `vite.config.js` ให้ตรงกัน
