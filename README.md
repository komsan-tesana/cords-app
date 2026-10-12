# Cords – แกะคอร์ดด้วยหู

เว็บแอปช่วยแกะคอร์ดเพลง (เริ่มจาก Mercury – "Heaven") เลือกคีย์ เครื่องดนตรี เสียงเบส/สแลชคอร์ด และออคเทฟ แล้วฟังเทียบกับเพลง
เสียงทั้งหมดสังเคราะห์ด้วย Web Audio ในเบราว์เซอร์ ข้อมูลเก็บใน localStorage

## รันในเครื่อง
```bash
npm install
npm run dev
```

## Deploy ขึ้น GitHub Pages
1. push ขึ้น `main` ของ repo `komsan-tesana/cords-app`
2. ที่ GitHub: Settings → Pages → Source เลือก **GitHub Actions**
3. workflow `.github/workflows/deploy.yml` จะ build และ deploy ให้อัตโนมัติ
   ที่ https://komsan-tesana.github.io/cords-app/

ถ้าเปลี่ยนชื่อ repo ให้แก้ `base` ใน `vite.config.js` ให้ตรงกัน
