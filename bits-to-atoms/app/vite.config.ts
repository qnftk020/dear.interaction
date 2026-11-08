import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { archivePlugin } from './server/plugin.ts'

const DATA_ROOT = path.join(import.meta.dirname, '../data')
// BTA_DATA_DIR / BTA_ENTERTECH_DIR로 다른 데이터 폴더를 띄울 수 있다 (미리보기·테스트용)
const DIRS = {
  interaction: path.resolve(process.env.BTA_DATA_DIR ?? path.join(DATA_ROOT, 'cases')),
  entertech: path.resolve(process.env.BTA_ENTERTECH_DIR ?? path.join(DATA_ROOT, 'entertech')),
}

// 학술 출판 자동 검증 결과(JSON)와 논문 Figure·PDF 사본
const VERIFY_DIRS = {
  reports: path.resolve(process.env.BTA_VERIFY_DIR ?? path.join(DATA_ROOT, 'verification')),
  figures: path.resolve(process.env.BTA_FIGURES_DIR ?? path.join(DATA_ROOT, 'figures')),
  uploads: path.resolve(process.env.BTA_VERIFY_DIR ?? path.join(DATA_ROOT, 'verification'), 'uploads'),
}

// 원고 자동 생성(Codex)에 넘기는 카피 가이드 — 지침 5~6절
const GUIDE_FILE = path.resolve(import.meta.dirname, '../../dear_interaction_Claude_Project_Instructions.md')

export default defineConfig({
  base: './',
  plugins: [react(), archivePlugin(DIRS, GUIDE_FILE, VERIFY_DIRS)],
  build: { outDir: 'dist-public' },
  test: {
    coverage: { include: ['src/lib/**', 'server/**'], exclude: ['server/plugin.ts'] },
  },
})
