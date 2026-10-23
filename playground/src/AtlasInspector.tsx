import { useEffect, useState } from 'react'
import { PetX } from '@petx/react'
import type { WebPetConfig } from './webpet'
import { replaceRow, replaceRowFrame, splitRowFrames } from './atlas'
import { deleteProjectPath, processSpriteImage, saveProjectFile, saveProjectFrame } from './imageProvider'

type Props = {
  config: WebPetConfig
  animation: string
  rows: Blob[]
  onRowsChange: (rows: Blob[]) => void
  onAnimationChange: (animation: string, patch: { row?: number; frames?: number; frameInterval?: number }) => void
}

export function AtlasInspector({ config, animation, rows, onRowsChange, onAnimationChange }: Props) {
  const definition = config.animations[animation]
  const row = Math.max(0, Math.min(rows.length - 1, definition?.row ?? 0))
  const frameCount = Math.max(1, definition?.frames ?? 1)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [message, setMessage] = useState('')
  const [rowUrls, setRowUrls] = useState<string[]>([])
  const activeUrl = rowUrls[row]

  useEffect(() => {
    const urls = rows.map((blob) => URL.createObjectURL(blob))
    setRowUrls(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [rows])
  useEffect(() => setFrame(0), [animation, frameCount])
  useEffect(() => {
    if (!playing || frameCount <= 1) return
    const timer = window.setInterval(() => setFrame((value) => (value + 1) % frameCount), definition?.frameInterval ?? 160)
    return () => window.clearInterval(timer)
  }, [animation, definition?.frameInterval, frameCount, playing])

  const persistRow = async (rowBlob: Blob, count: number) => {
    const stateName = animation.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]+/g, '-') || 'state'
    const statePath = `arrest/${stateName}`
    const frameCountToSave = Math.max(1, Math.min(config.atlas.columns, count))
    await saveProjectFile(`${statePath}/strip.webp`, rowBlob)
    const frames = await splitRowFrames(rowBlob, config.atlas)
    await Promise.all(frames.slice(0, frameCountToSave).map((frame, index) => saveProjectFrame(stateName, index, frame)))
    await Promise.all(Array.from({ length: config.atlas.columns - frameCountToSave }, (_, index) => deleteProjectPath(`${statePath}/frame-${String(index + frameCountToSave).padStart(2, '0')}.webp`).catch(() => undefined)))
  }

  const replaceFrame = async (index: number, file?: File) => {
    if (!file || !rows[row]) return
    try {
      const next = [...rows]
      const cutout = await processSpriteImage(file, { ...config.atlas, frameCount: 1 })
      next[row] = await replaceRowFrame(rows[row]!, index, cutout, config.atlas)
      await persistRow(next[row]!, Math.max(frameCount, index + 1))
      onRowsChange(next)
      onAnimationChange(animation, { frames: Math.max(frameCount, index + 1) })
      setFrame(index)
      setPlaying(false)
      setMessage(`已抠图并替换第 ${index + 1} 帧`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '图片处理失败')
    }
  }

  const dropFrameFile = async (index: number, event: React.DragEvent) => {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    if (file) await replaceFrame(index, file)
  }

  const replaceWholeRow = async (file?: File) => {
    if (!file) return
    try {
      const result = await replaceRow(file, config.atlas)
      const next = [...rows]
      next[row] = result.blob
      await persistRow(result.blob, result.frames)
      onRowsChange(next)
      onAnimationChange(animation, { frames: result.frames })
      setFrame(0)
      setPlaying(false)
      setMessage(`已抠图并替换整行动画，共 ${result.frames} 帧`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '横条图片处理失败')
    }
  }

  return (
    <section className="atlas-inspector">
      <div className="inspector-title"><span>当前动作图集行</span><output>{animation} · row {row}</output></div>
      <div className="atlas-row-image" title="点击任意格子，单独替换这一帧">
        {activeUrl && <img src={activeUrl} alt={`${animation} 图集整行`} />}
        {Array.from({ length: config.atlas.columns }, (_, index) => (
          <label key={index} data-frame-index={index} className={index === frame ? 'selected' : ''} title={`替换第 ${index + 1} 帧`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { void dropFrameFile(index, event) }}>
            <span>{index + 1}</span>
            <input type="file" accept="image/*" onChange={(event) => { void replaceFrame(index, event.target.files?.[0]); event.currentTarget.value = '' }} />
          </label>
        ))}
      </div>
      <div className="atlas-row-controls">
        <label>图集行号<input type="number" min="0" max={Math.max(0, rows.length - 1)} value={definition?.row ?? 0} onChange={(event) => onAnimationChange(animation, { row: Math.max(0, Math.min(rows.length - 1, Number(event.target.value) || 0)) })} /></label>
        <label className="upload-row">上传整行 JPG / PNG<input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { void replaceWholeRow(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>
        <span className="frame-help">整行按横向帧条解析并自动抠图；单格替换仍可直接点击上方格子。</span>
      </div>
      {message && <p className="atlas-message" role="status">{message}</p>}
      <div className="atlas-frame-preview">
        <div className="atlas-preview">
          {activeUrl && <PetX src={activeUrl} spriteVersionNumber={config.spriteVersionNumber} atlas={{ ...config.atlas, rows: 1 }} animation={animation} animations={{ [animation]: { row: 0, frames: frameCount, frameInterval: definition?.frameInterval ?? 160 } }} frame={frame} playing={false} size={76} title={`${animation} frame ${frame + 1}`} />}
        </div>
        <div className="atlas-playback">
          <div className="frame-readout"><strong>F{frame + 1}</strong><span>{frameCount} 帧 · {definition?.frameInterval ?? 160}ms</span></div>
          <input aria-label="当前预览帧" type="range" min="0" max={Math.max(0, frameCount - 1)} value={Math.min(frame, frameCount - 1)} onChange={(event) => { setPlaying(false); setFrame(Number(event.target.value)) }} />
          <div className="inspector-actions">
            <button type="button" onClick={() => { setPlaying(false); setFrame((value) => (value - 1 + frameCount) % frameCount) }}>上一帧</button>
            <button type="button" className="primary" onClick={() => setPlaying((value) => !value)}>{playing ? '暂停' : '播放'}</button>
            <button type="button" onClick={() => { setPlaying(false); setFrame((value) => (value + 1) % frameCount) }}>下一帧</button>
          </div>
          <label className="interval-control">帧间隔<input type="number" min="20" max="5000" step="10" value={definition?.frameInterval ?? 160} onChange={(event) => onAnimationChange(animation, { frameInterval: Math.max(20, Number(event.target.value) || 20) })} /></label>
        </div>
      </div>
    </section>
  )
}
