#!/usr/bin/env bash
# รันจาก branch develop: push develop → merge เข้า main → build docs/ → push main (GitHub Pages อัปเดตจาก main)
set -euo pipefail

SRC=develop
DEST=main

branch=$(git branch --show-current)
if [ "$branch" != "$SRC" ]; then
  echo "ต้องอยู่ที่ branch $SRC (ตอนนี้อยู่ที่ $branch)" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "มีการแก้ไขที่ยังไม่ได้ commit กรุณา commit ก่อน deploy" >&2
  exit 1
fi

# ไม่ว่าจะสำเร็จหรือพัง ให้กลับมาที่ develop เสมอ
trap 'git checkout -q "$SRC"' EXIT

git push origin "$SRC"

git checkout "$DEST"
git pull --ff-only origin "$DEST"
if ! git merge --no-edit "$SRC"; then
  git merge --abort
  echo "merge $SRC เข้า $DEST ไม่ได้ (conflict) กรุณา merge เองแล้วแก้ conflict" >&2
  exit 1
fi

npm run build
git add docs
if git diff --cached --quiet; then
  echo "docs/ ไม่มีการเปลี่ยนแปลง"
else
  git commit -m "Deploy: rebuild docs/"
fi

git push origin "$DEST"
echo "เสร็จแล้ว: https://komsan-tesana.github.io/cords-app/"
