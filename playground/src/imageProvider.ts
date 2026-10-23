/** Local asset-processing and disk-project adapter. It contains no AI provider. */
export async function processSpriteImage(file: Blob, options: { frameWidth: number; frameHeight: number; frameCount: number }): Promise<Blob> {
  const query = new URLSearchParams({
    frameWidth: String(options.frameWidth),
    frameHeight: String(options.frameHeight),
    frameCount: String(options.frameCount),
  })
  const response = await fetch(`/__webpet/process-sprite?${query}`, {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `图片抠图失败（${response.status}）`)
  }
  return response.blob()
}

export type ProjectFile = { path: string; dataUrl: string }

export async function loadProjectFiles(): Promise<ProjectFile[]> {
  const response = await fetch('/__webpet/project-files')
  if (!response.ok) throw new Error((await response.text().catch(() => '')) || '项目素材读取失败')
  const payload = await response.json() as { files?: ProjectFile[] }
  return payload.files ?? []
}

export async function saveProjectFile(path: string, blob: Blob): Promise<void> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('项目素材编码失败'))
    reader.readAsDataURL(blob)
  })
  const response = await fetch('/__webpet/project-files', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, dataUrl }),
  })
  if (!response.ok) throw new Error((await response.text().catch(() => '')) || '项目素材保存失败')
}

export async function saveProjectJson(path: string, value: unknown): Promise<void> {
  await saveProjectFile(path, new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
}

export async function saveProjectFrame(stateName: string, frameIndex: number, blob: Blob): Promise<void> {
  const safeName = stateName.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]+/g, '-') || 'state'
  await saveProjectFile(`arrest/${safeName}/frame-${String(frameIndex).padStart(2, '0')}.webp`, blob)
}

export async function deleteProjectPath(path: string): Promise<void> {
  const response = await fetch(`/__webpet/project-files?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
  if (!response.ok) throw new Error((await response.text().catch(() => '')) || '项目素材删除失败')
}
