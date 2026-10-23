import { useState } from 'react'
import { WebPetHost } from './webpet'
import type { WebPetConfig, WebPetMood, WebPetAnimation } from './webpet'
import { CalibrationPanel } from './CalibrationPanel'

/**
 * 校准值来自 webpet-project/manifest.json —— 这是「这个角色专属」的数据。
 * 实际图集 1536×3744 = 8 列 × 18 行（manifest 里写 19 行是错的）。
 * 换角色时必须重新校准 poseAnchors / poseOffsets —— 用左下角的校准面板。
 */
const CALIBRATED: Partial<WebPetConfig> = {
  src: '/webpet/spritesheet.webp',
  spriteVersionNumber: 6,
  atlas: { frameWidth: 192, frameHeight: 208, columns: 8, rows: 18 },
  size: 148,
  animations: {
    idle: { row: 0, frames: 1, frameInterval: 999999 },
    runningRight: { row: 1, frames: 8, frameInterval: 120 },
    runningLeft: { row: 2, frames: 8, frameInterval: 120 },
    waving: { row: 3, frames: 4, frameInterval: 140 },
    jumping: { row: 4, frames: 5, frameInterval: 140 },
    failed: { row: 5, frames: 8, frameInterval: 140 },
    waiting: { row: 6, frames: 6, frameInterval: 180 },
    working: { row: 7, frames: 6, frameInterval: 180 },
    review: { row: 8, frames: 6, frameInterval: 150 },
    catching: { row: 9, frames: 1, frameInterval: 999999 },
    peekTop: { row: 11, frames: 1, frameInterval: 999999 },
    hangBottom: { row: 12, frames: 1, frameInterval: 999999 },
    sitTop: { row: 13, frames: 1, frameInterval: 999999 },
    peekSide: { row: 14, frames: 1, frameInterval: 999999 },
    hideSide: { row: 15, frames: 1, frameInterval: 999999 },
    grabSide: { row: 16, frames: 1, frameInterval: 999999 },
    cornerGrab: { row: 17, frames: 1, frameInterval: 999999 },
  },
  moodAnimations: {
    idle: 'idle',
    thinking: 'waiting',
    working: 'working',
    success: 'jumping',
    error: 'failed',
  } as Record<WebPetMood, WebPetAnimation>,
  poseAnchors: {
    peekTop: { y: 193 },
    hangBottom: { y: 46 },
    sitTop: { y: 170 },
    peekSide: { x: 127 },
    hideSide: { x: 44 },
    grabSide: { x: 164 },
    cornerGrab: { x: 129, y: 110 },
  },
  poseOffsets: {
    peekTop: { x: 0, y: 0 },
    hangBottom: { x: 0, y: 25 },
    sitTop: { x: 0, y: 11 },
    peekSide: { x: -11, y: 0 },
    hideSide: { x: 10, y: 0 },
    grabSide: { x: 8, y: 0 },
    cornerGrab: { x: -11, y: 25 },
  },
  edgeGap: 16,
  hotZone: 30,
  clickTolerance: 8,
  patrolDelayMs: 8000,
  attachmentDurationMs: 15000,
}

const MOODS: { key: WebPetMood; label: string }[] = [
  { key: 'idle', label: '待机' },
  { key: 'thinking', label: '思考' },
  { key: 'working', label: '干活' },
  { key: 'success', label: '成功' },
  { key: 'error', label: '失败' },
]

type CardSpec = { title: string; desc: string; mode: string; tall?: boolean; corner?: string }

const CARDS: CardSpec[] = [
  { title: '任务卡片', desc: 'top-bottom —— 能坐顶上，也能挂下沿', mode: 'top-bottom', tall: true },
  { title: '通知卡片', desc: 'hang-bottom —— 只挂下沿', mode: 'hang-bottom' },
  { title: '只坐顶部', desc: 'sit-top-only —— 不允许挂下沿', mode: 'sit-top-only' },
  { title: '抓角落', desc: 'corner-grab + bottom-auto —— 自动选左右角并翻转', mode: 'corner-grab', corner: 'bottom-auto' },
  { title: '侧边探头', desc: 'right-side-peek —— 只从右侧探出半个身子', mode: 'right-side-peek' },
]

export default function App() {
  const [mood, setMood] = useState<WebPetMood>('idle')
  const [patrol, setPatrol] = useState(true)
  const [config, setConfig] = useState<Partial<WebPetConfig>>(CALIBRATED)
  const [currentPose, setCurrentPose] = useState<string | null>(null)
  const [showCal, setShowCal] = useState(false)

  return (
    <div className="page">
      <header className="bar">
        <div className="brand">
          <strong>WebPet</strong>
          <span>可复用 2D 角色交互引擎 · 拖动它试试</span>
        </div>

        <div className="controls">
          <div className="seg">
            {MOODS.map((m) => (
              <button
                key={m.key}
                className={mood === m.key ? 'on' : ''}
                onClick={() => setMood(m.key)}
                type="button"
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            className={`toggle ${patrol ? 'on' : ''}`}
            onClick={() => setPatrol((v) => !v)}
            type="button"
          >
            自动巡逻 {patrol ? '开' : '关'}
          </button>
          <button
            className={`toggle ${showCal ? 'on' : ''}`}
            onClick={() => setShowCal((v) => !v)}
            type="button"
          >
            坐标校准
          </button>
        </div>
      </header>

      <main className="grid">
        {CARDS.map((c) => (
          <section
            key={c.title}
            className={`card${c.tall ? ' tall' : ''}`}
            data-webpet-card
            data-webpet-attachment={c.mode}
          >
            <h2>{c.title}</h2>
            <p>{c.desc}</p>
          </section>
        ))}
      </main>

      <footer className="hint">
        拖动宠物到卡片边缘会吸附；短按被它盖住的按钮仍可点击（8px 内视为点击）。
        位置会记住，刷新后回来。
      </footer>

      {showCal && (
        <CalibrationPanel config={config} onChange={setConfig} currentPose={currentPose} />
      )}

      <WebPetHost
        config={config}
        mood={mood}
        patrol={patrol}
        bubble="把我拖到卡片边缘试试"
        storageKey="webpet-demo-v1"
        onAttachmentChange={(a) => setCurrentPose(a?.pose ?? null)}
      />
    </div>
  )
}
