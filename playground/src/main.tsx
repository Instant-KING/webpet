import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PetCharacter, WebPetHost, defaultWebPetConfig, type WebPetAnimation, type WebPetAttachment, type WebPetAttachmentMode, type WebPetMood } from './webpet'
import { AtlasInspector } from './AtlasInspector'
import { clearSavedRows, composeRowFrames, composeSpriteSheet, createEmptyRow, createRowFromFirstFrame, downloadBlob, loadSavedRows, saveRows, splitRowFrames, splitSheetRows, splitSingleRowArchive } from './atlas'
import { deleteProjectPath, loadProjectFiles, saveProjectFile, saveProjectJson } from './imageProvider'
import '@petx/react/styles.css'
import './webpet/webpet.css'
import './playground.css'

const modes: Array<WebPetAttachmentMode | 'none'> = ['none', 'auto', 'top-bottom', 'top-bottom-right', 'left-right', 'left-side', 'right-side', 'right-side-peek', 'corner-grab', 'sit-top-only', 'hang-bottom']
const moods: WebPetMood[] = ['idle', 'thinking', 'working', 'success', 'error']
const calibrationPoses = ['peekTop', 'hangBottom', 'sitTop', 'peekSide', 'hideSide', 'grabSide', 'cornerGrab'] as const
type CalibrationPose = typeof calibrationPoses[number]
type Settings = {
  animation: string
  mood: WebPetMood
  mode: WebPetAttachmentMode | 'none'
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  patrol: boolean
  cardVariant: number
  bubble: string
  size: number
  calibrationPose: CalibrationPose
  poseAnchors: typeof defaultWebPetConfig.poseAnchors
  poseOffsets: typeof defaultWebPetConfig.poseOffsets
  animations: typeof defaultWebPetConfig.animations
  moodAnimations: typeof defaultWebPetConfig.moodAnimations
  stateLabels: Record<string, string>
  edgeGap: number
  hotZone: number
  clickTolerance: number
  attachmentDurationMs: number
  patrolDelayMs: number
}

const SETTINGS_KEY = 'webpet-playground-settings-v1'
const poseAxes: Record<CalibrationPose, { x: boolean; y: boolean }> = {
  peekTop: { x: false, y: true },
  hangBottom: { x: false, y: true },
  sitTop: { x: false, y: true },
  peekSide: { x: true, y: false },
  hideSide: { x: true, y: false },
  grabSide: { x: true, y: false },
  cornerGrab: { x: true, y: true },
}

const defaults: Settings = {
  animation: 'idle',
  mood: 'idle',
  mode: 'top-bottom-right',
  corner: 'bottom-right',
  patrol: false,
  cardVariant: 1,
  bubble: '把我拖到右侧卡片试试',
  size: defaultWebPetConfig.size,
  calibrationPose: 'sitTop',
  poseAnchors: defaultWebPetConfig.poseAnchors,
  poseOffsets: defaultWebPetConfig.poseOffsets,
  animations: defaultWebPetConfig.animations,
  moodAnimations: defaultWebPetConfig.moodAnimations,
  stateLabels: {},
  edgeGap: defaultWebPetConfig.edgeGap,
  hotZone: defaultWebPetConfig.hotZone,
  clickTolerance: defaultWebPetConfig.clickTolerance,
  attachmentDurationMs: Infinity,
  patrolDelayMs: defaultWebPetConfig.patrolDelayMs,
}

function restoreSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>
    return { ...defaults, ...stored, attachmentDurationMs: Infinity }
  } catch {
    return defaults
  }
}

function safeStateName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]+/g, '-') || 'state'
}

function fileBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((response) => response.blob())
}

type ProjectStateGroup = {
  name: string
  frames: Array<{ index: number; dataUrl: string }>
  strip?: { dataUrl: string }
}

function groupProjectStates(files: Array<{ path: string; dataUrl: string }>): ProjectStateGroup[] {
  const groups = new Map<string, ProjectStateGroup>()
  for (const file of files) {
    const match = file.path.match(/^arrest\/([^/]+)\/(frame-(\d+)\.webp|strip\.webp)$/i)
    if (!match) continue
    const name = match[1]!
    const group = groups.get(name) ?? { name, frames: [] }
    if (match[2]!.toLowerCase() === 'strip.webp') group.strip = { dataUrl: file.dataUrl }
    else group.frames.push({ index: Number(match[3]), dataUrl: file.dataUrl })
    groups.set(name, group)
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function App() {
  const [settings, setSettings] = useState<Settings>(restoreSettings)
  const [attachmentState, setAttachmentState] = useState<WebPetAttachment | null>(null)
  const [rows, setRows] = useState<Blob[]>([])
  const [rowsReady, setRowsReady] = useState(false)
  const [projectFilesReady, setProjectFilesReady] = useState(false)
  const [projectArchiveFiles, setProjectArchiveFiles] = useState<string[]>([])
  const [sheetUrl, setSheetUrl] = useState('/webpet/spritesheet.webp')
  const [exportMessage, setExportMessage] = useState('')
  const cardRef = useRef<HTMLElement>(null)
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((current) => ({ ...current, [key]: value }))
  const { animation, mood, mode, corner, patrol, cardVariant, bubble, size, calibrationPose, poseAnchors, poseOffsets } = settings
  const activeAnimation = attachmentState?.pose ?? animation
  const displayName = settings.stateLabels[activeAnimation] ?? activeAnimation
  const activeAnchor = poseAnchors[calibrationPose]
  const activeOffset = poseOffsets[calibrationPose]
  const axes = poseAxes[calibrationPose]
  const setAnchor = (axis: 'x' | 'y', value: number) => update('poseAnchors', { ...poseAnchors, [calibrationPose]: { ...poseAnchors[calibrationPose], [axis]: value } })
  const setOffset = (axis: 'x' | 'y', value: number) => update('poseOffsets', { ...poseOffsets, [calibrationPose]: { ...poseOffsets[calibrationPose], [axis]: value } })

  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) }, [settings])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const atlas = defaultWebPetConfig.atlas
      const saved = await loadSavedRows().catch(() => null)
      const projectFiles = await loadProjectFiles().catch(() => [])
      const manifestFile = projectFiles.find((file) => file.path.toLowerCase() === 'manifest.json')
      let diskSettings: Partial<Settings> = {}
      if (manifestFile) {
        try {
          const parsed = JSON.parse(await (await fileBlob(manifestFile.dataUrl)).text()) as { settings?: Partial<Settings> } & Partial<Settings>
          diskSettings = parsed.settings ?? parsed
        } catch (error) {
          console.warn('跳过无效 WebPet manifest.json', error)
        }
      }
      const sourceSettings: Settings = { ...settings, ...diskSettings, attachmentDurationMs: Infinity }
      const groups = groupProjectStates(projectFiles)
      let baseRows: Blob[]
      try {
        const original = await fetch('/webpet/spritesheet.webp').then((response) => response.blob())
        baseRows = await splitSheetRows(original, atlas)
      } catch (error) {
        if (!saved?.length) throw error
        baseRows = saved
      }
      const nextRows = [...baseRows]
      const projectAnimations = { ...sourceSettings.animations }

      for (const group of groups) {
        const orderedFrames = [...group.frames].sort((a, b) => a.index - b.index)
        let rowBlob: Blob | undefined
        let frameCount = 0
        if (orderedFrames.length) {
          const frameBlobs = await Promise.all(orderedFrames.map((frame) => fileBlob(frame.dataUrl)))
          rowBlob = await composeRowFrames(frameBlobs, atlas)
          frameCount = Math.min(atlas.columns, orderedFrames.length)
        } else if (group.strip) {
          rowBlob = await splitSingleRowArchive(await fileBlob(group.strip.dataUrl), atlas)
          frameCount = projectAnimations[group.name]?.frames ?? atlas.columns
        }
        if (!rowBlob) continue
        const configuredRow = projectAnimations[group.name]?.row
        const row = configuredRow !== undefined && configuredRow >= 0 ? configuredRow : nextRows.length
        while (nextRows.length <= row) nextRows.push(await createEmptyRow(atlas))
        nextRows[row] = rowBlob
        projectAnimations[group.name] = {
          row,
          frames: frameCount || projectAnimations[group.name]?.frames || 1,
          frameInterval: projectAnimations[group.name]?.frameInterval ?? 160,
        }
      }

      if (cancelled) return
      setRows(nextRows)
      setRowsReady(true)
      setProjectArchiveFiles(projectFiles.map((file) => file.path))
      setProjectFilesReady(true)
      if (groups.length || manifestFile) setSettings((current) => ({ ...current, ...diskSettings, animations: projectAnimations, attachmentDurationMs: Infinity }))
    })().catch((error) => setExportMessage(error instanceof Error ? error.message : '图集读取失败'))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (rowsReady && rows.length) void saveRows(rows).catch((error) => setExportMessage(error instanceof Error ? error.message : '本地保存失败'))
  }, [rows, rowsReady])

  useEffect(() => {
    if (!projectFilesReady) return
    void saveProjectJson('manifest.json', {
      format: 'webpet-project-manifest',
      version: 1,
      atlas: { ...defaultWebPetConfig.atlas, rows: rows.length || defaultWebPetConfig.atlas.rows },
      settings: {
        animation,
        mood,
        mode,
        corner,
        patrol,
        cardVariant,
        bubble,
        calibrationPose,
        size,
        animations: settings.animations,
        moodAnimations: settings.moodAnimations,
        stateLabels: settings.stateLabels,
        poseAnchors,
        poseOffsets,
        edgeGap: settings.edgeGap,
        hotZone: settings.hotZone,
        clickTolerance: settings.clickTolerance,
        patrolDelayMs: settings.patrolDelayMs,
      },
    }).then(() => setProjectArchiveFiles((current) => current.includes('manifest.json') ? current : ['manifest.json', ...current])).catch((error) => setExportMessage(error instanceof Error ? error.message : '项目参数保存失败'))
  }, [projectFilesReady, rows.length, settings, size, poseAnchors, poseOffsets, bubble])

  useEffect(() => {
    if (!rows.length) return
    let liveUrl = ''
    let obsolete = false
    void composeSpriteSheet(rows, { ...defaultWebPetConfig.atlas, rows: rows.length }).then((blob) => {
      if (obsolete) return
      liveUrl = URL.createObjectURL(blob)
      setSheetUrl(liveUrl)
    })
    return () => { obsolete = true; if (liveUrl) URL.revokeObjectURL(liveUrl) }
  }, [rows])

  const config = useMemo(() => ({
    ...defaultWebPetConfig,
    src: sheetUrl,
    spriteVersionNumber: 2,
    atlas: { ...defaultWebPetConfig.atlas, rows: rows.length || defaultWebPetConfig.atlas.rows },
    size,
    poseAnchors,
    poseOffsets,
    animations: settings.animations,
    moodAnimations: settings.moodAnimations,
    edgeGap: settings.edgeGap,
    hotZone: settings.hotZone,
    clickTolerance: settings.clickTolerance,
    attachmentDurationMs: settings.attachmentDurationMs,
    patrolDelayMs: settings.patrolDelayMs,
  }), [sheetUrl, rows.length, size, poseAnchors, poseOffsets, settings])

  const cardAttributes = mode === 'none' ? {} : { 'data-webpet-card': 'true', 'data-webpet-attachment': mode, ...(mode === 'corner-grab' ? { 'data-webpet-corner': corner } : {}) }
  const handleAttachmentChange = (attachment: WebPetAttachment | null) => {
    setAttachmentState(attachment)
    if (!attachment) return
    update('calibrationPose', attachment.pose)
    const attachedMode = attachment.target.dataset.webpetAttachment as WebPetAttachmentMode | undefined
    if (attachedMode) update('mode', attachedMode)
    const attachedCorner = attachment.target.dataset.webpetCorner as Settings['corner'] | undefined
    if (attachedCorner) update('corner', attachedCorner)
  }

  const updateAnimation = (name: string, patch: { row?: number; frames?: number; frameInterval?: number }) => {
    const definition = settings.animations[name]
    if (!definition) return
    update('animations', { ...settings.animations, [name]: { ...definition, ...patch } })
  }
  const updateStateLabel = (name: string, label: string) => update('stateLabels', { ...settings.stateLabels, [name]: label })

  const saveStateMachineArchive = async (name: string, rowBlob: Blob, frameCount: number) => {
    if (!projectFilesReady) return
    const statePath = `arrest/${safeStateName(name)}`
    await saveProjectFile(`${statePath}/strip.webp`, rowBlob)
    const frameBlobs = await splitRowFrames(rowBlob, config.atlas)
    const count = Math.min(frameCount, config.atlas.columns)
    await Promise.all(frameBlobs.slice(0, count).map((frame, index) => saveProjectFile(`${statePath}/frame-${String(index).padStart(2, '0')}.webp`, frame)))
    setProjectArchiveFiles((current) => [...new Set([...current, `${statePath}/strip.webp`, ...Array.from({ length: count }, (_, index) => `${statePath}/frame-${String(index).padStart(2, '0')}.webp`)])])
  }

  const createStateMachine = async () => {
    const sourceRow = settings.animations[activeAnimation]?.row ?? 0
    const source = rows[sourceRow] ?? rows[0]
    if (!source) return
    const nextRow = rows.length
    const rowBlob = await createRowFromFirstFrame(source, config.atlas)
    const ordinal = Object.keys(settings.animations).filter((name) => name.startsWith('custom-')).length + 1
    const name = `custom-${ordinal}`
    setRows((current) => [...current, rowBlob])
    update('animations', { ...settings.animations, [name]: { row: nextRow, frames: 1, frameInterval: 160 } })
    update('stateLabels', { ...settings.stateLabels, [name]: `新状态机 ${ordinal}` })
    update('animation', name)
    void saveStateMachineArchive(name, rowBlob, 1).catch((error) => setExportMessage(error instanceof Error ? error.message : '状态机素材保存失败'))
  }

  const deleteStateMachine = () => {
    if (!activeAnimation.startsWith('custom-')) return
    const deletedRow = settings.animations[activeAnimation]?.row
    const nextAnimations = { ...settings.animations }
    delete nextAnimations[activeAnimation]
    const nextLabels = { ...settings.stateLabels }
    delete nextLabels[activeAnimation]
    if (deletedRow !== undefined) {
      setRows((current) => current.filter((_, index) => index !== deletedRow))
      Object.keys(nextAnimations).forEach((name) => {
        if (nextAnimations[name]!.row > deletedRow) nextAnimations[name] = { ...nextAnimations[name]!, row: nextAnimations[name]!.row - 1 }
      })
    }
    update('animations', nextAnimations)
    update('stateLabels', nextLabels)
    update('animation', 'idle')
    void deleteProjectPath(`arrest/${safeStateName(activeAnimation)}`).catch((error) => setExportMessage(error instanceof Error ? error.message : '状态机存档删除失败'))
  }

  const refreshProjectFiles = async () => {
    const files = await loadProjectFiles().catch(() => [])
    setProjectArchiveFiles(files.map((file) => file.path))
  }

  const exportConfig = () => {
    const result = {
      format: 'webpet-agent-config',
      version: 2,
      instructions: [
        'The Agent receives external artwork and writes frame-XX.webp into arrest/<state>/.',
        'frame-XX.webp is the source of truth; strip.webp and animation/spritesheet.webp are derived caches.',
        'Rows are zero-based and frames occupy columns from left to right.',
        'Follow the WebPet Skill workflow to mount the runtime and test attachment poses.',
      ],
      sourceProtocol: { frameDirectory: 'arrest/<state>/', framePattern: 'frame-XX.webp', stripPattern: 'strip.webp', sheetPath: 'animation/spritesheet.webp' },
      atlas: config.atlas,
      size,
      animations: settings.animations,
      stateLabels: settings.stateLabels,
      moodAnimations: settings.moodAnimations,
      poseAnchors,
      poseOffsets,
      behavior: { edgeGap: settings.edgeGap, hotZone: settings.hotZone, clickTolerance: settings.clickTolerance, attachmentDurationMs: 'infinite', patrolDelayMs: settings.patrolDelayMs, patrol, patrolIntervalMs: 3000, bubble },
      editor: { animation, mood, attachmentMode: mode, corner, cardVariant, calibrationPose },
      project: { root: 'webpet-project', files: projectArchiveFiles },
    }
    downloadBlob(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }), 'webpet-agent-config.json')
  }

  const exportSheet = async () => {
    const blob = await composeSpriteSheet(rows, config.atlas)
    downloadBlob(blob, 'spritesheet.webp')
    if (projectFilesReady) {
      await saveProjectFile('animation/spritesheet.webp', blob)
      await refreshProjectFiles()
    }
  }

  const editorDock = <div className="bottom-dock resource-editor-dock">
    <section className="dock-panel state-machine">
      <div className="dock-label">PET 状态机</div>
      <div className="state-machine-editor"><label>状态名称<input value={displayName} onChange={(event) => updateStateLabel(activeAnimation, event.target.value)} /></label><div className="state-machine-actions"><button type="button" onClick={() => void createStateMachine()}>新建状态机</button>{activeAnimation.startsWith('custom-') && <button type="button" className="danger" onClick={deleteStateMachine}>删除</button>}</div></div>
      <strong>{displayName}</strong><span>{attachmentState ? `跟随 ${attachmentState.edge} 边 · 持续吸附` : `mood: ${mood}`}</span>
      <div className="state-params"><label>帧数<input type="number" min="1" max={config.atlas.columns} value={config.animations[activeAnimation]?.frames ?? 1} onChange={(event) => updateAnimation(activeAnimation, { frames: Math.max(1, Math.min(config.atlas.columns, Number(event.target.value) || 1)) })} /></label><label>间隔<input type="number" min="20" max="5000" step="10" value={config.animations[activeAnimation]?.frameInterval ?? 160} onChange={(event) => updateAnimation(activeAnimation, { frameInterval: Math.max(20, Math.min(5000, Number(event.target.value) || 20)) })} /></label></div>
      <div className="state-track"><i className="done" /><i className={patrol ? 'active' : ''} /><i className={attachmentState ? 'active' : ''} /></div><small className="state-hint">内置状态不可删除；自定义状态可删除。状态帧由 Agent 写入项目目录。</small>
    </section>
    <section className="dock-panel motion-panel"><div className="dock-label">实际 Pet 动画预览</div><div className="live-pet-preview"><PetCharacter mood={mood} animation={activeAnimation as WebPetAnimation} config={config} /></div><strong>{displayName}</strong><span>{config.animations[activeAnimation]?.frames ?? 1} frames · {config.animations[activeAnimation]?.frameInterval ?? 160}ms</span></section>
    <section className="dock-panel sequence-panel"><div className="dock-label">当前素材序列帧</div><p className="sequence-source-note">外部生成的帧交给 Agent 处理后写入项目；这里可以逐帧替换、上传整行并预览。</p><AtlasInspector config={config} animation={activeAnimation} rows={rows} onRowsChange={setRows} onAnimationChange={updateAnimation} /></section>
  </div>

  return (
    <main className="playground page-playground">
      <aside className="control-panel">
        <div className="eyebrow">WEBPET / PLAYGROUND</div><h1>Pet 调试窗口</h1>
        <p className="lede">Playground 只负责替换帧、预览、吸附校准和导出。真正的动作帧由 Agent 接收外部素材后处理，并写入 <code>arrest/&lt;状态机&gt;/frame-XX.webp</code>。</p>
        <div className="live-state"><span className="state-dot" />{attachmentState ? `已吸附 · ${attachmentState.pose} · ${attachmentState.edge}` : '自由状态'}</div>
        <label>动作<select value={animation} onChange={(event) => update('animation', event.target.value)}>{Object.keys(settings.animations).map((item) => <option key={item} value={item}>{settings.stateLabels[item] ?? item}</option>)}</select></label>
        <label>心情<select value={mood} onChange={(event) => update('mood', event.target.value as WebPetMood)}>{moods.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>卡片吸附<select value={mode} onChange={(event) => update('mode', event.target.value as WebPetAttachmentMode | 'none')}>{modes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        {mode === 'corner-grab' && <label>角落<select value={corner} onChange={(event) => update('corner', event.target.value as Settings['corner'])}><option value="top-left">top-left</option><option value="top-right">top-right</option><option value="bottom-left">bottom-left</option><option value="bottom-right">bottom-right</option></select></label>}
        <label>Pet 尺寸 <output>{size}px</output><input type="range" min="96" max="220" value={size} onChange={(event) => update('size', Number(event.target.value))} /></label>
        <div className="calibration-block"><div className="section-label">吸附姿势校准</div><select value={calibrationPose} onChange={(event) => update('calibrationPose', event.target.value as CalibrationPose)}>{calibrationPoses.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          {axes.x && <><label>锚点 X <output>{activeAnchor.x ?? 96}px</output><input type="range" min="0" max="192" value={activeAnchor.x ?? 96} onChange={(event) => setAnchor('x', Number(event.target.value))} /></label><label>偏移 X <output>{activeOffset.x}px</output><input type="range" min="-60" max="60" value={activeOffset.x} onChange={(event) => setOffset('x', Number(event.target.value))} /></label></>}
          {axes.y && <><label>锚点 Y <output>{activeAnchor.y ?? 104}px</output><input type="range" min="0" max="208" value={activeAnchor.y ?? 104} onChange={(event) => setAnchor('y', Number(event.target.value))} /></label><label>偏移 Y <output>{activeOffset.y}px</output><input type="range" min="-60" max="60" value={activeOffset.y} onChange={(event) => setOffset('y', Number(event.target.value))} /></label></>}
        </div>
        <label>气泡文字<textarea value={bubble} onChange={(event) => update('bubble', event.target.value)} rows={2} /></label>
        <label className="switch-row"><input type="checkbox" checked={patrol} onChange={(event) => update('patrol', event.target.checked)} /> 自动巡游</label>
        <details className="advanced-settings"><summary>行为参数</summary>{(['edgeGap', 'hotZone', 'clickTolerance', 'patrolDelayMs'] as const).map((key) => <label key={key}>{key}<input type="number" min="0" value={settings[key]} onChange={(event) => update(key, Math.max(0, Number(event.target.value) || 0))} /></label>)}</details>
        <div className="export-actions"><button type="button" onClick={exportConfig}>导出 Agent JSON</button><button type="button" onClick={() => void exportSheet()}>导出 WebP 图集</button></div>
        {exportMessage && <p className="atlas-message" role="status">{exportMessage}</p>}
        <button type="button" className="reset" onClick={() => { localStorage.removeItem(SETTINGS_KEY); void clearSavedRows().finally(() => window.location.reload()) }}>重置浏览器参数</button>
      </aside>
      <section className="stage">
        <header className="stage-header"><div><span className="status-dot" /> LIVE DOM STAGE</div><div className="style-tabs">{[1, 2, 3, 4].map((variant) => <button key={variant} type="button" className={cardVariant === variant ? 'active' : ''} onClick={() => update('cardVariant', variant)}>卡片 {variant}</button>)}</div><span>拖动 Pet 到卡片边缘测试吸附</span></header>
        <div className="stage-content">
          <div className="stage-copy"><span className="tag">REAL TARGET</span><h2>知识库工作台</h2><p>这个卡片使用真实的 DOM 几何。滚动窗口、改变宽度或切换吸附模式，Pet 都会重新计算接触点。</p></div>
          <article ref={cardRef} className={`demo-card card-variant-${cardVariant}`} {...cardAttributes}><div className="card-topline"><span>KNOWLEDGE BASE</span><span>#{mode}</span></div><div className="card-icon">{cardVariant === 1 ? '✦' : cardVariant === 2 ? '◈' : cardVariant === 3 ? '▦' : '✧'}</div><h3>Agent 资料库 · 样式 {cardVariant}</h3><p>把宠物拖到卡片的上、下、左、右边，观察不同姿势和锚点偏移。</p><div className="card-actions"><button type="button">打开资料库</button><button type="button" className="quiet">更多</button></div></article>
          <div className="ghost-card" data-webpet-card data-webpet-attachment="corner-grab" data-webpet-corner="bottom-left"><span>SECOND TARGET</span><strong>另一个可吸附面</strong></div>
        </div>
        {editorDock}
        <WebPetHost mood={mood} animation={animation as WebPetAnimation} config={config} patrol={patrol} patrolIntervalMs={3000} bubble={bubble} attachmentDurationMs={Infinity} onAttachmentChange={handleAttachmentChange} />
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
