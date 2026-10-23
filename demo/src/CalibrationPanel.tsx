import { useState } from 'react'
import type { WebPetConfig } from './webpet'

const POSES = [
  'peekTop',
  'hangBottom',
  'sitTop',
  'peekSide',
  'hideSide',
  'grabSide',
  'cornerGrab',
] as const

type Pose = (typeof POSES)[number]

// 每个姿态用哪些轴：top/bottom 类只吃 y，side 类只吃 x，corner 吃两个
const POSE_AXES: Record<Pose, { x: boolean; y: boolean }> = {
  peekTop: { x: false, y: true },
  hangBottom: { x: false, y: true },
  sitTop: { x: false, y: true },
  peekSide: { x: true, y: false },
  hideSide: { x: true, y: false },
  grabSide: { x: true, y: false },
  cornerGrab: { x: true, y: true },
}

type Props = {
  config: Partial<WebPetConfig>
  onChange: (next: Partial<WebPetConfig>) => void
  currentPose: string | null
}

function Num({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <label className="cal-field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (!Number.isNaN(v)) onChange(v)
        }}
      />
      <div className="cal-spin">
        <button type="button" onClick={() => onChange(value - step)}>−</button>
        <button type="button" onClick={() => onChange(value + step)}>+</button>
      </div>
    </label>
  )
}

export function CalibrationPanel({ config, onChange, currentPose }: Props) {
  const [openPose, setOpenPose] = useState<Pose | null>('sitTop')
  const anchors = (config.poseAnchors ?? {}) as Record<string, { x?: number; y?: number }>
  const offsets = (config.poseOffsets ?? {}) as Record<string, { x: number; y: number }>

  function patchAnchor(pose: Pose, axis: 'x' | 'y', v: number) {
    onChange({
      ...config,
      poseAnchors: {
        ...anchors,
        [pose]: { ...(anchors[pose] ?? {}), [axis]: v },
      } as WebPetConfig['poseAnchors'],
    })
  }

  function patchOffset(pose: Pose, axis: 'x' | 'y', v: number) {
    onChange({
      ...config,
      poseOffsets: {
        ...offsets,
        [pose]: { ...(offsets[pose] ?? { x: 0, y: 0 }), [axis]: v },
      } as WebPetConfig['poseOffsets'],
    })
  }

  function exportJson() {
    const dump = { poseAnchors: config.poseAnchors, poseOffsets: config.poseOffsets }
    navigator.clipboard?.writeText(JSON.stringify(dump, null, 2))
    alert('已复制到剪贴板')
  }

  return (
    <aside className="cal">
      <header className="cal-head">
        <strong>坐标校准</strong>
        <span className="cal-now">
          当前姿态：<b>{currentPose ?? '自由'}</b>
        </span>
      </header>

      <div className="cal-list">
        {POSES.map((pose) => {
          const axes = POSE_AXES[pose]
          const a = anchors[pose] ?? {}
          const o = offsets[pose] ?? { x: 0, y: 0 }
          const isCurrent = currentPose === pose
          return (
            <section className={`cal-item${isCurrent ? ' active' : ''}`} key={pose}>
              <button
                type="button"
                className="cal-title"
                onClick={() => setOpenPose(openPose === pose ? null : pose)}
              >
                <span>{pose}</span>
                {isCurrent && <em>●</em>}
                <i>{openPose === pose ? '−' : '+'}</i>
              </button>

              {openPose === pose && (
                <div className="cal-body">
                  <div className="cal-group">
                    <div className="cal-label">锚点 anchor（贴到边缘的点）</div>
                    {axes.x && (
                      <Num label="x" value={a.x ?? 0} onChange={(v) => patchAnchor(pose, 'x', v)} />
                    )}
                    {axes.y && (
                      <Num label="y" value={a.y ?? 0} onChange={(v) => patchAnchor(pose, 'y', v)} />
                    )}
                  </div>
                  <div className="cal-group">
                    <div className="cal-label">偏移 offset（视觉微调）</div>
                    <Num label="x" value={o.x} onChange={(v) => patchOffset(pose, 'x', v)} />
                    <Num label="y" value={o.y} onChange={(v) => patchOffset(pose, 'y', v)} />
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>

      <footer className="cal-foot">
        <button type="button" className="cal-export" onClick={exportJson}>
          复制配置 JSON
        </button>
        <p>提示：把宠物拖到卡片上，看它哪种姿态，就调哪个。</p>
      </footer>
    </aside>
  )
}
