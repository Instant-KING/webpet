import type { CodexPetAnimations } from '@petx/react'

export type WebPetMood = 'idle' | 'thinking' | 'working' | 'success' | 'error'

export type WebPetAnimation =
  | 'idle'
  | 'runningRight'
  | 'runningLeft'
  | 'waving'
  | 'jumping'
  | 'failed'
  | 'waiting'
  | 'review'
  | 'working'
  | 'catching'
  | 'peekTop'
  | 'hangBottom'
  | 'sitTop'
  | 'peekSide'
  | 'hideSide'
  | 'grabSide'
  | 'cornerGrab'

export type WebPetAttachmentMode =
  | 'auto'
  | 'hang-top'
  | 'hang-bottom'
  | 'top-bottom'
  | 'left-side'
  | 'right-side'
  | 'right-side-peek'
  | 'left-right'
  | 'top-bottom-right'
  | 'sit-top-only'
  | 'corner-grab'

export type WebPetEdge = 'top' | 'bottom' | 'left' | 'right' | 'corner'
export type WebPetLayer = 'front' | 'back'
export type WebPetCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export type WebPetPoint = { x: number; y: number }
export type WebPetAnchor = { x?: number; y?: number }

export type WebPetAtlas = {
  frameWidth: number
  frameHeight: number
  columns: number
  rows: number
}

export type WebPetConfig = {
  src: string
  spriteVersionNumber?: number
  atlas: WebPetAtlas
  size: number
  animations: CodexPetAnimations
  moodAnimations: Record<WebPetMood, WebPetAnimation>
  poseAnchors: Record<Extract<WebPetAnimation, 'peekTop' | 'hangBottom' | 'sitTop' | 'peekSide' | 'hideSide' | 'grabSide' | 'cornerGrab'>, WebPetAnchor>
  poseOffsets: Record<Extract<WebPetAnimation, 'peekTop' | 'hangBottom' | 'sitTop' | 'peekSide' | 'hideSide' | 'grabSide' | 'cornerGrab'>, WebPetPoint>
  edgeGap: number
  hotZone: number
  clickTolerance: number
  attachmentDurationMs: number
  patrolDelayMs: number
}

export type WebPetAttachment = {
  target: HTMLElement
  edge: WebPetEdge
  pose: Extract<WebPetAnimation, 'peekTop' | 'hangBottom' | 'sitTop' | 'peekSide' | 'hideSide' | 'grabSide' | 'cornerGrab'>
  flip: boolean
  cornerHorizontal?: 'left' | 'right'
  cornerVertical?: 'top' | 'bottom'
  layer: WebPetLayer
  scrollContainer: HTMLElement | null
}

export type WebPetProps = {
  mood?: WebPetMood
  animation?: WebPetAnimation
  config?: Partial<WebPetConfig>
  patrol?: boolean
  patrolIntervalMs?: number
  attachmentDurationMs?: number
  storageKey?: string
  className?: string
  bubble?: string
  onAttachmentChange?: (attachment: WebPetAttachment | null) => void
}
