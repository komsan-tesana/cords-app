#!/usr/bin/env bash
# build แล้ว commit + push โฟลเดอร์ docs/ ขึ้น main เพื่อให้ GitHub Pages อัปเดต
set -euo pipefail

branch=$(git branch --show-current)
if [ "$branch" != "main" ]; then
  echo "ต้องอยู่ที่ branch main (ตอนนี้อยู่ที่ $branch)" >&2
  exit 1
fi

npm run build
git add docs
if git diff --cached --quiet; then
  echo "docs/ ไม่มีการเปลี่ยนแปลง ไม่ต้อง deploy"
  exit 0
fi
git commit -m "Deploy: rebuild docs/"
git push origin main
echo "เสร็จแล้ว: https://komsan-tesana.github.io/cords-app/"
