import type { WebPetConfig } from './types'

export const defaultWebPetConfig: WebPetConfig = {
  src: '/webpet/spritesheet.webp',
  spriteVersionNumber: 1,
  atlas: { frameWidth: 192, frameHeight: 208, columns: 8, rows: 18 },
  size: 144,
  animations: {
    idle: { row: 0, frames: 6, frameInterval: 160 },
    runningRight: { row: 1, frames: 8, frameInterval: 120 },
    runningLeft: { row: 2, frames: 8, frameInterval: 120 },
    waving: { row: 3, frames: 4, frameInterval: 140 },
    jumping: { row: 4, frames: 5, frameInterval: 140 },
    failed: { row: 5, frames: 8, frameInterval: 140 },
    waiting: { row: 6, frames: 6, frameInterval: 180 },
    working: { row: 7, frames: 6, frameInterval: 180 },
    review: { row: 8, frames: 6, frameInterval: 150 },
    catching: { row: 9, frames: 4, frameInterval: 160 },
    peekTop: { row: 11, frames: 5, frameInterval: 160 },
    hangBottom: { row: 12, frames: 1, frameInterval: 999999 },
    sitTop: { row: 13, frames: 5, frameInterval: 160 },
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
  },
  poseAnchors: {
    peekTop: { y: 193 },
    hangBottom: { y: 9 },
    sitTop: { y: 129 },
    peekSide: { x: 116 },
    hideSide: { x: 32 },
    grabSide: { x: 154 },
    cornerGrab: { x: 113, y: 77 },
  },
  poseOffsets: {
    peekTop: { x: 0, y: 28 },
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
  attachmentDurationMs: 15000,
  patrolDelayMs: 8000,
}

export function mergeWebPetConfig(overrides?: Partial<WebPetConfig>): WebPetConfig {
  return {
    ...defaultWebPetConfig,
    ...overrides,
    atlas: { ...defaultWebPetConfig.atlas, ...(overrides?.atlas ?? {}) },
    animations: { ...defaultWebPetConfig.animations, ...(overrides?.animations ?? {}) },
    moodAnimations: { ...defaultWebPetConfig.moodAnimations, ...(overrides?.moodAnimations ?? {}) },
    poseAnchors: { ...defaultWebPetConfig.poseAnchors, ...(overrides?.poseAnchors ?? {}) },
    poseOffsets: { ...defaultWebPetConfig.poseOffsets, ...(overrides?.poseOffsets ?? {}) },
  }
}
