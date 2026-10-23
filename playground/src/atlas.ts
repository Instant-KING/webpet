import type { WebPetAtlas } from './webpet'
import { processSpriteImage } from './imageProvider'

function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取图片文件')) }
    image.src = url
  })
}

function canvasBlob(canvas: HTMLCanvasElement, type = 'image/webp', quality = 0.96): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('浏览器无法生成图集图片')), type, quality))
}

/** Remove a connected solid/chroma background before a user frame enters the atlas. */
export async function removeBackground(file: Blob): Promise<Blob> {
  const image = await imageFromBlob(file)
  return processSpriteImage(file, { frameWidth: image.naturalWidth, frameHeight: image.naturalHeight, frameCount: 1 })
}

export async function splitSheetRows(blob: Blob, atlas: WebPetAtlas): Promise<Blob[]> {
  const image = await imageFromBlob(blob)
  const expectedWidth = atlas.frameWidth * atlas.columns
  const expectedHeight = atlas.frameHeight * atlas.rows
  if (image.naturalWidth !== expectedWidth || image.naturalHeight !== expectedHeight) {
    throw new Error(`图集尺寸不匹配：需要 ${expectedWidth}×${expectedHeight}，实际 ${image.naturalWidth}×${image.naturalHeight}`)
  }
  const canvas = document.createElement('canvas')
  canvas.width = atlas.frameWidth
  canvas.height = atlas.frameHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 不可用')
  const rows: Blob[] = []
  for (let row = 0; row < atlas.rows; row += 1) {
    const strip = document.createElement('canvas')
    strip.width = expectedWidth
    strip.height = atlas.frameHeight
    const stripContext = strip.getContext('2d')
    if (!stripContext) throw new Error('Canvas 不可用')
    stripContext.drawImage(image, 0, row * atlas.frameHeight, expectedWidth, atlas.frameHeight, 0, 0, expectedWidth, atlas.frameHeight)
    rows.push(await canvasBlob(strip))
  }
  return rows
}

export async function splitSingleRowArchive(blob: Blob, atlas: WebPetAtlas): Promise<Blob> {
  const image = await imageFromBlob(blob)
  if (image.naturalWidth === atlas.frameWidth * atlas.columns && image.naturalHeight === atlas.frameHeight) return blob
  if (image.naturalWidth === atlas.frameWidth * atlas.columns && image.naturalHeight >= atlas.frameHeight) {
    const canvas = document.createElement('canvas')
    canvas.width = atlas.frameWidth * atlas.columns
    canvas.height = atlas.frameHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 不可用')
    context.drawImage(image, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
    return canvasBlob(canvas)
  }
  throw new Error(`状态机存档尺寸不匹配：需要 ${atlas.frameWidth * atlas.columns}×${atlas.frameHeight}`)
}

export async function createEmptyRow(atlas: WebPetAtlas): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = atlas.frameWidth * atlas.columns
  canvas.height = atlas.frameHeight
  return canvasBlob(canvas)
}

export async function normalizeRowImage(file: Blob, atlas: WebPetAtlas): Promise<{ blob: Blob; frames: number }> {
  const image = await imageFromBlob(file)
  const frameAspect = atlas.frameWidth / atlas.frameHeight
  const rawFrames = image.naturalWidth / image.naturalHeight / frameAspect
  const frames = Math.round(rawFrames)
  if (frames < 1 || frames > atlas.columns || Math.abs(rawFrames - frames) > 0.04) {
    throw new Error(`请上传横向帧条：每格比例应为 ${atlas.frameWidth}:${atlas.frameHeight}，帧数为 1-${atlas.columns}。当前图片推算为 ${rawFrames.toFixed(2)} 帧。`)
  }
  const strip = document.createElement('canvas')
  strip.width = atlas.frameWidth * atlas.columns
  strip.height = atlas.frameHeight
  const context = strip.getContext('2d')
  if (!context) throw new Error('Canvas 不可用')
  const sourceFrameWidth = image.naturalWidth / frames
  for (let index = 0; index < frames; index += 1) {
    context.drawImage(image, index * sourceFrameWidth, 0, sourceFrameWidth, image.naturalHeight, index * atlas.frameWidth, 0, atlas.frameWidth, atlas.frameHeight)
  }
  return { blob: await canvasBlob(strip), frames }
}

/** Replace one complete atlas row from a horizontal JPG/PNG frame strip. */
export async function replaceRow(rowFile: Blob, atlas: WebPetAtlas): Promise<{ blob: Blob; frames: number }> {
  const image = await imageFromBlob(rowFile)
  const frameAspect = atlas.frameWidth / atlas.frameHeight
  const rawFrames = image.naturalWidth / image.naturalHeight / frameAspect
  const frames = Math.round(rawFrames)
  if (frames < 1 || frames > atlas.columns || Math.abs(rawFrames - frames) > 0.08) {
    throw new Error(`请上传横向帧条：每格比例应为 ${atlas.frameWidth}:${atlas.frameHeight}，帧数为 1-${atlas.columns}。当前图片推算为 ${rawFrames.toFixed(2)} 帧。`)
  }
  return { blob: await processSpriteImage(rowFile, { frameWidth: atlas.frameWidth, frameHeight: atlas.frameHeight, frameCount: frames }), frames }
}

export async function replaceRowFrame(rowBlob: Blob, frame: number, file: Blob, atlas: WebPetAtlas): Promise<Blob> {
  const rowImage = await imageFromBlob(rowBlob)
  const frameImage = await imageFromBlob(file)
  const canvas = document.createElement('canvas')
  canvas.width = atlas.frameWidth * atlas.columns
  canvas.height = atlas.frameHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 不可用')
  context.drawImage(rowImage, 0, 0, canvas.width, canvas.height)
  context.clearRect(frame * atlas.frameWidth, 0, atlas.frameWidth, atlas.frameHeight)
  context.drawImage(frameImage, 0, 0, frameImage.naturalWidth, frameImage.naturalHeight, frame * atlas.frameWidth, 0, atlas.frameWidth, atlas.frameHeight)
  return canvasBlob(canvas)
}

export async function splitRowFrames(rowBlob: Blob, atlas: WebPetAtlas): Promise<Blob[]> {
  const image = await imageFromBlob(rowBlob)
  if (image.naturalWidth !== atlas.frameWidth * atlas.columns || image.naturalHeight !== atlas.frameHeight) {
    throw new Error(`状态机图集尺寸不匹配：需要 ${atlas.frameWidth * atlas.columns}×${atlas.frameHeight}`)
  }
  const frames: Blob[] = []
  for (let index = 0; index < atlas.columns; index += 1) {
    const canvas = document.createElement('canvas')
    canvas.width = atlas.frameWidth
    canvas.height = atlas.frameHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 不可用')
    context.drawImage(image, index * atlas.frameWidth, 0, atlas.frameWidth, atlas.frameHeight, 0, 0, atlas.frameWidth, atlas.frameHeight)
    frames.push(await canvasBlob(canvas, 'image/webp'))
  }
  return frames
}

export async function composeRowFrames(frames: Blob[], atlas: WebPetAtlas): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = atlas.frameWidth * atlas.columns
  canvas.height = atlas.frameHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 不可用')
  for (let index = 0; index < Math.min(frames.length, atlas.columns); index += 1) {
    const image = await imageFromBlob(frames[index]!)
    context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, index * atlas.frameWidth, 0, atlas.frameWidth, atlas.frameHeight)
  }
  return canvasBlob(canvas)
}

export async function extractFrame(rowBlob: Blob, frame: number, atlas: WebPetAtlas): Promise<Blob> {
  const image = await imageFromBlob(rowBlob)
  const canvas = document.createElement('canvas')
  canvas.width = atlas.frameWidth
  canvas.height = atlas.frameHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 不可用')
  context.drawImage(image, frame * atlas.frameWidth, 0, atlas.frameWidth, atlas.frameHeight, 0, 0, atlas.frameWidth, atlas.frameHeight)
  return canvasBlob(canvas, 'image/png', 1)
}

export async function createRowFromFirstFrame(rowBlob: Blob, atlas: WebPetAtlas): Promise<Blob> {
  const rowImage = await imageFromBlob(rowBlob)
  const canvas = document.createElement('canvas')
  canvas.width = atlas.frameWidth * atlas.columns
  canvas.height = atlas.frameHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 不可用')
  context.drawImage(rowImage, 0, 0, atlas.frameWidth, atlas.frameHeight, 0, 0, atlas.frameWidth, atlas.frameHeight)
  return canvasBlob(canvas)
}

export async function composeSpriteSheet(rows: Blob[], atlas: WebPetAtlas): Promise<Blob> {
  const sheet = document.createElement('canvas')
  sheet.width = atlas.frameWidth * atlas.columns
  sheet.height = atlas.frameHeight * rows.length
  const context = sheet.getContext('2d')
  if (!context) throw new Error('Canvas 不可用')
  for (let row = 0; row < rows.length; row += 1) {
    const image = await imageFromBlob(rows[row])
    context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, row * atlas.frameHeight, sheet.width, atlas.frameHeight)
  }
  return canvasBlob(sheet)
}

const DB_NAME = 'webpet-playground'
const STORE_NAME = 'atlas-rows'

function openRowDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开本地图集存储'))
  })
}

export async function loadSavedRows(): Promise<Blob[] | null> {
  const db = await openRowDb()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get('rows')
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as Blob[] : null)
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

export async function saveRows(rows: Blob[]): Promise<void> {
  const db = await openRowDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(rows, 'rows')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error ?? new Error('保存图集行失败'))
    })
  } finally { db.close() }
}

export async function clearSavedRows(): Promise<void> {
  const db = await openRowDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).delete('rows')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error ?? new Error('清除图集草稿失败'))
    })
  } finally { db.close() }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
