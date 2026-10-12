# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Cords: a Thai-language web app for transcribing song chords by ear (starts with Mercury's "Heaven"). React 18 + Vite, no backend, no tests, no linter. All sound is synthesized in the browser with Web Audio; user data lives in `localStorage`. UI strings are in Thai.

## Commands

```bash
npm install
npm run dev       # vite dev server
npm run build     # outputs to docs/ (emptyOutDir)
npm run deploy    # see Deploy workflow; optional arg: -- minor | -- major
```

## Deploy workflow

Hosted on GitHub Pages, served from the **`docs/` folder on `main`**. `docs/` is committed build output — never edit it by hand.

- Do all work and commits on `develop`. Never commit source changes directly on `main`.
- `npm run deploy` (`scripts/deploy.sh`) must be run from a clean `develop`. It bumps the version in `package.json` (patch by default) and commits "Release vX", pushes `develop`, merges into `main`, runs `npm run build`, commits `docs/`, pushes `main`, then returns to `develop`.
- `vite.config.js` sets `base: '/cords-app/'`; it must match the GitHub repo name. It also injects `__APP_VERSION__` (from `package.json`) as a global, shown in the footer in `App.jsx`.

## Architecture

- `src/music.js`: pure music theory. Pitch classes are 0–11 using flat/sharp names from `NOTES`. Defines `QUALITY` interval tables, `paletteFor(key, minor)` (diatonic chords + borrowed/extra chords with roman numerals), and chord string parsing (`splitChord`/`parseChord`, e.g. `C/E`) vs. building (`mkChord`/`chordName`). A "chord" object is `{ notes: [midi], bass: midi }`; the bass note is separate so slash chords work.
- `src/audio.js`: Web Audio synthesis. `INSTRUMENTS` is a table of synth params (oscillator type, harmonics, envelope, filter) and `playChord(chord, { instrument, bpm, bassOn, chordOct, bassOct })` schedules chord tones plus a separate bass voice. A single lazily created `AudioContext` is shared.
- `src/App.jsx`: nearly all app state and UI in one file (progression editor with drag-to-reorder via `@dnd-kit`, sections, transport/playback, keyboard shortcuts via `react-hotkeys-hook`, export/copy). `usePersistentState` wraps `useState` with `localStorage` (failure-tolerant).
- `src/components/KeyWheel.jsx` and `Keyboard.jsx`: key-selection wheel and on-screen piano display for the current chord.
