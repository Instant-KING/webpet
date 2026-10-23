import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { gsap } from 'gsap'
import { mergeWebPetConfig } from './defaultWebPetConfig'
import { PetCharacter } from './PetCharacter'
import type {
  WebPetAnimation, WebPetAttachment, WebPetAttachmentMode, WebPetConfig, WebPetCorner,
  WebPetEdge, WebPetLayer, WebPetPoint, WebPetProps,
} from './types'

const POSES = ['peekTop', 'hangBottom', 'sitTop', 'peekSide', 'hideSide', 'grabSide', 'cornerGrab'] as const
type Pose = typeof POSES[number]
type Placement = { edge: WebPetEdge; pose: Pose; flip: boolean; cornerHorizontal?: 'left' | 'right'; cornerVertical?: 'top' | 'bottom' }
type DragState = { pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number; lastX: number; lastY: number; lastAt: number; velocityX: number; velocityY: number }
type Position = WebPetPoint

const CARD_SELECTOR = '[data-webpet-card], [data-webpet-surface], [data-webpet-attachment]'
const INTERACTIVE_SELECTOR = `${CARD_SELECTOR}, button, a[href], input, textarea, select, [role="button"], [role="link"]`

function isVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  const style = window.getComputedStyle(element)
  return rect.width > 24 && rect.height > 24 && rect.bottom > 0 && rect.top < window.innerHeight
    && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05
}

function clamp(position: Position, config: WebPetConfig): Position {
  const minX = window.scrollX + config.edgeGap
  const minY = window.scrollY + config.edgeGap
  const maxX = Math.max(minX, window.scrollX + window.innerWidth - config.size - config.edgeGap)
  const maxY = Math.max(minY, window.scrollY + window.innerHeight - config.size - config.edgeGap)
  return { x: Math.min(Math.max(minX, position.x), maxX), y: Math.min(Math.max(minY, position.y), maxY) }
}

function scrollContainerFor(target: HTMLElement): HTMLElement | null {
  let parent = target.parentElement
  while (parent && parent !== document.body) {
    const style = window.getComputedStyle(parent)
    if (/(auto|scroll|overlay)/.test(`${style.overflow}${style.overflowY}${style.overflowX}`)) return parent
    parent = parent.parentElement
  }
  return null
}

function cornerFor(target: HTMLElement): WebPetCorner {
  const value = target.dataset.webpetCorner
  if (value === 'top-left' || value === 'top-right' || value === 'bottom-left' || value === 'bottom-right') return value
  if (value === 'bottom-auto') return target.getBoundingClientRect().left < window.innerWidth / 2 ? 'bottom-right' : 'bottom-left'
  return 'bottom-left'
}

function modeFor(target: HTMLElement): WebPetAttachmentMode | undefined {
  const value = target.dataset.webpetAttachment
  return value as WebPetAttachmentMode | undefined
}

function sidePlacement(edge: 'left' | 'right'): Placement {
  const pose: Pose = (['peekSide', 'hideSide', 'grabSide'] as const)[Math.floor(Math.random() * 3)]
  const nativeEdge = pose === 'hideSide' ? 'right' : 'left'
  return { edge, pose, flip: edge !== nativeEdge }
}

function choosePlacement(target: HTMLElement, config: WebPetConfig, clientX?: number, clientY?: number): Placement {
  const mode = modeFor(target)
  if (mode === 'hang-bottom') return { edge: 'bottom', pose: 'hangBottom', flip: false }
  if (mode === 'hang-top' || mode === 'sit-top-only') return { edge: 'top', pose: mode === 'sit-top-only' ? 'sitTop' : (Math.random() < 0.5 ? 'peekTop' : 'sitTop'), flip: false }
  if (mode === 'right-side-peek') return { edge: 'right', pose: 'peekSide', flip: true }
  if (mode === 'corner-grab') {
    const corner = cornerFor(target)
    return { edge: 'corner', pose: 'cornerGrab', flip: corner.endsWith('right'), cornerHorizontal: corner.endsWith('left') ? 'left' : 'right', cornerVertical: corner.startsWith('bottom') ? 'bottom' : 'top' }
  }
  const rect = target.getBoundingClientRect()
  if (mode === 'left-side') return sidePlacement('left')
  if (mode === 'right-side') return sidePlacement('right')
  if (mode === 'left-right') {
    const x = clientX ?? rect.left + rect.width / 2
    return x >= rect.left + rect.width / 2 ? sidePlacement('right') : sidePlacement('left')
  }
  if (mode === 'top-bottom-right') {
    const candidates: Placement[] = []
    if (rect.top >= config.size * 0.7) candidates.push({ edge: 'top', pose: Math.random() < 0.5 ? 'peekTop' : 'sitTop', flip: false })
    if (window.innerHeight - rect.bottom >= config.size * 0.9) candidates.push({ edge: 'bottom', pose: 'hangBottom', flip: false })
    if (window.innerWidth - rect.right >= config.size * 0.62) candidates.push(sidePlacement('right'))
    if (clientX !== undefined && clientY !== undefined && candidates.length > 1) {
      candidates.sort((a, b) => placementDistance(a.edge, rect, clientX, clientY) - placementDistance(b.edge, rect, clientX, clientY))
      return candidates[0]!
    }
    return candidates[Math.floor(Math.random() * Math.max(1, candidates.length))] ?? { edge: 'top', pose: 'sitTop', flip: false }
  }
  if (mode === 'top-bottom') {
    const top = rect.top >= config.size * 0.7
    const bottom = window.innerHeight - rect.bottom >= config.size * 0.9
    if (clientY !== undefined && clientY > rect.top + rect.height / 2 && bottom) return { edge: 'bottom', pose: 'hangBottom', flip: false }
    if (top) return { edge: 'top', pose: Math.random() < 0.5 ? 'peekTop' : 'sitTop', flip: false }
    if (bottom) return { edge: 'bottom', pose: 'hangBottom', flip: false }
  }
  if (mode === 'auto' || !mode) {
    const distances = viableEdges(target, config).map((edge) => ({ edge, distance: clientX === undefined || clientY === undefined ? edgeClearance(edge, rect) : placementDistance(edge, rect, clientX, clientY) }))
    const nearest = distances.sort((a, b) => a.distance - b.distance)[0]?.edge
    if (nearest === 'bottom') return { edge: 'bottom', pose: 'hangBottom', flip: false }
    if (nearest === 'left' || nearest === 'right') return sidePlacement(nearest)
    if (nearest === 'top') return { edge: 'top', pose: Math.random() < 0.5 ? 'peekTop' : 'sitTop', flip: false }
  }
  if (mode === 'top-bottom') {
    const top = rect.top >= config.size * 0.7
    const bottom = window.innerHeight - rect.bottom >= config.size * 0.9
    if (bottom && (!top || Math.random() < 0.5)) return { edge: 'bottom', pose: 'hangBottom', flip: false }
    if (top) return { edge: 'top', pose: Math.random() < 0.5 ? 'peekTop' : 'sitTop', flip: false }
  }
  const distances = [
    { edge: 'top' as const, distance: Math.abs(rect.top - window.innerHeight / 2) },
    { edge: 'bottom' as const, distance: Math.abs(rect.bottom - window.innerHeight / 2) },
    { edge: 'left' as const, distance: Math.abs(rect.left - window.innerWidth / 2) },
    { edge: 'right' as const, distance: Math.abs(rect.right - window.innerWidth / 2) },
  ].sort((a, b) => a.distance - b.distance)
  if (distances[0].edge === 'left' || distances[0].edge === 'right') return sidePlacement(distances[0].edge)
  return { edge: distances[0].edge, pose: distances[0].edge === 'bottom' ? 'hangBottom' : 'sitTop', flip: false }
}

function placementDistance(edge: WebPetEdge, rect: DOMRect, x: number, y: number) {
  if (edge === 'top') return Math.abs(y - rect.top)
  if (edge === 'bottom') return Math.abs(y - rect.bottom)
  if (edge === 'left') return Math.abs(x - rect.left)
  if (edge === 'right') return Math.abs(x - rect.right)
  return Number.POSITIVE_INFINITY
}

function edgeClearance(edge: WebPetEdge, rect: DOMRect) {
  if (edge === 'top') return rect.top
  if (edge === 'bottom') return window.innerHeight - rect.bottom
  if (edge === 'left') return rect.left
  if (edge === 'right') return window.innerWidth - rect.right
  return Number.POSITIVE_INFINITY
}

function viableEdges(target: HTMLElement, config: WebPetConfig): WebPetEdge[] {
  const rect = target.getBoundingClientRect()
  const edges: WebPetEdge[] = []
  if (rect.width >= config.size * 0.7 && rect.top >= config.size * 0.7) edges.push('top')
  if (rect.width >= config.size * 0.7 && window.innerHeight - rect.bottom >= config.size * 0.9) edges.push('bottom')
  if (rect.height >= config.size * 0.7 && rect.left >= config.size * 0.62) edges.push('left')
  if (rect.height >= config.size * 0.7 && window.innerWidth - rect.right >= config.size * 0.62) edges.push('right')
  return edges.length ? edges : ['top']
}

function hotZoneDistance(target: HTMLElement, x: number, y: number, config: WebPetConfig): number | null {
  const rect = target.getBoundingClientRect()
  const mode = modeFor(target)
  const insideX = x >= rect.left && x <= rect.right
  const insideY = y >= rect.top && y <= rect.bottom
  if ((mode === 'hang-top' || mode === 'top-bottom' || mode === 'top-bottom-right') && insideX) {
    const distance = Math.min(Math.abs(y - rect.top), Math.abs(y - rect.bottom))
    return distance <= config.hotZone ? distance : null
  }
  if ((mode === 'auto' || !mode) && (insideX || insideY)) {
    const edges = viableEdges(target, config)
    const distance = Math.min(...edges.map((edge) => placementDistance(edge, rect, x, y)))
    return distance <= config.hotZone ? distance : null
  }
  if (mode === 'hang-bottom' && insideX) return Math.abs(y - rect.bottom) <= config.hotZone ? Math.abs(y - rect.bottom) : null
  if ((mode === 'right-side' || mode === 'right-side-peek' || mode === 'top-bottom-right') && insideY) return Math.abs(x - rect.right) <= config.hotZone ? Math.abs(x - rect.right) : null
  if ((mode === 'left-side' || mode === 'left-right') && insideY) return Math.abs(x - rect.left) <= config.hotZone ? Math.abs(x - rect.left) : null
  if (mode === 'corner-grab') {
    const corner = cornerFor(target)
    const cx = corner.endsWith('left') ? rect.left : rect.right
    const cy = corner.startsWith('top') ? rect.top : rect.bottom
    const distance = Math.hypot(x - cx, y - cy)
    return distance <= config.hotZone * 1.4 ? distance : null
  }
  return null
}

function targetAtPoint(x: number, y: number, config: WebPetConfig): HTMLElement | null {
  let nearest: HTMLElement | null = null
  let distance = Number.POSITIVE_INFINITY
  document.querySelectorAll<HTMLElement>(`${CARD_SELECTOR}`).forEach((candidate) => {
    if (!candidate.isConnected || candidate.dataset.webpetIgnore === 'true' || !isVisible(candidate)) return
    const hot = hotZoneDistance(candidate, x, y, config)
    if (hot !== null && hot < distance) { nearest = candidate; distance = hot }
  })
  if (nearest) return nearest
  for (const element of document.elementsFromPoint(x, y)) {
    if (!(element instanceof Element) || element.closest('.webpet-shell')) continue
    const target = element.closest<HTMLElement>(CARD_SELECTOR)
    if (target && target.dataset.webpetIgnore !== 'true') return target
  }
  return null
}

function poseLayer(pose: Pose): WebPetLayer {
  return pose === 'peekTop' || pose === 'peekSide' || pose === 'hideSide' ? 'back' : 'front'
}

function documentPosition(attachment: WebPetAttachment, config: WebPetConfig): Position {
  const rect = attachment.target.getBoundingClientRect()
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const anchor = config.poseAnchors[attachment.pose]
  const offset = config.poseOffsets[attachment.pose]
  const scale = config.size / config.atlas.frameWidth
  if (attachment.edge === 'corner') {
    const sourceX = anchor.x ?? config.atlas.frameWidth / 2
    const sourceY = anchor.y ?? config.atlas.frameHeight / 2
    const renderedX = attachment.flip ? config.atlas.frameWidth - sourceX : sourceX
    return {
      x: (attachment.cornerHorizontal === 'left' ? rect.left : rect.right) - renderedX * scale + (attachment.cornerHorizontal === 'left' ? -offset.x : offset.x) + scrollX,
      y: (attachment.cornerVertical === 'bottom' ? rect.bottom : rect.top) - sourceY * scale + offset.y + scrollY,
    }
  }
  if (attachment.edge === 'top' || attachment.edge === 'bottom') {
    return { x: rect.left + (rect.width - config.size) / 2 + offset.x + scrollX, y: (attachment.edge === 'top' ? rect.top : rect.bottom) - (anchor.y ?? config.atlas.frameHeight / 2) * scale + offset.y + scrollY }
  }
  const sourceX = anchor.x ?? config.atlas.frameWidth / 2
  const renderedX = attachment.flip ? config.atlas.frameWidth - sourceX : sourceX
  return { x: (attachment.edge === 'left' ? rect.left : rect.right) - renderedX * scale + (attachment.flip ? -offset.x : offset.x) + scrollX, y: rect.top + (rect.height - config.size) / 2 + offset.y + scrollY }
}

// Keep the portaled shell in document coordinates. Absolute positioning avoids
// fixed-position drift while page or nested panels scroll.
function renderPosition(attachment: WebPetAttachment, config: WebPetConfig): Position {
  return documentPosition(attachment, config)
}

export function WebPetHost({ mood = 'idle', animation, config: overrides, patrol = false, patrolIntervalMs, attachmentDurationMs, storageKey = 'webpet.position.v1', className, bubble, onAttachmentChange }: WebPetProps) {
  const config = useMemo(() => mergeWebPetConfig(overrides), [overrides])
  const duration = attachmentDurationMs ?? config.attachmentDurationMs
  const [position, setPosition] = useState<Position>(() => {
    const hasWindow = typeof window !== 'undefined'
    const viewportWidth = hasWindow ? window.innerWidth : 1024
    const viewportHeight = hasWindow ? window.innerHeight : 768
    const fallback = { x: (hasWindow ? window.scrollX : 0) + viewportWidth - config.size - 24, y: (hasWindow ? window.scrollY : 0) + viewportHeight - config.size - 96 }
    if (hasWindow) {
      try { const saved = JSON.parse(localStorage.getItem(storageKey) || '') as Partial<Position>; if (typeof saved.x === 'number' && typeof saved.y === 'number') return clamp(saved as Position, config) } catch { /* optional persistence */ }
      return clamp(fallback, config)
    }
    return fallback
  })
  const [attachment, setAttachment] = useState<WebPetAttachment | null>(null)
  const [dragging, setDragging] = useState(false)
  const [patrolling, setPatrolling] = useState(false)
  const [patrolFacing, setPatrolFacing] = useState<'left' | 'right'>('right')
  const shellRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const attachmentRef = useRef<WebPetAttachment | null>(null)
  const dropRef = useRef<HTMLElement | null>(null)
  const patrolTimer = useRef<number | null>(null)
  const patrolTween = useRef<gsap.core.Timeline | null>(null)
  const clickThrough = useRef<{ pointerId: number; target: HTMLElement; x: number; y: number; offsetX: number; offsetY: number } | null>(null)

  useEffect(() => { onAttachmentChange?.(attachment) }, [attachment, onAttachmentChange])

  const clearDrop = useCallback(() => { dropRef.current?.removeAttribute('data-webpet-drop-target'); dropRef.current = null }, [])
  const clearAttachment = useCallback(() => {
    patrolTween.current?.kill(); patrolTween.current = null
    if (attachmentRef.current) attachmentRef.current.target.removeAttribute('data-webpet-attached')
    attachmentRef.current = null; setAttachment(null); setPatrolling(false); clearDrop()
  }, [clearDrop])
  const attach = useCallback((target: HTMLElement, placement: Placement, origin?: Position, holdMs = duration) => {
    clearAttachment()
    const next: WebPetAttachment = { target, ...placement, layer: poseLayer(placement.pose), scrollContainer: scrollContainerFor(target) }
    target.dataset.webpetAttached = next.layer
    attachmentRef.current = next; setAttachment(next)
    const destination = renderPosition(next, config)
    setPosition(origin && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? origin : destination)
    if (origin && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const point = { x: origin.x, y: origin.y }
      gsap.to(point, { x: destination.x, y: destination.y, duration: 0.48, ease: 'back.out(1.35)', onUpdate: () => setPosition({ x: point.x, y: point.y }) })
    }
    if (holdMs !== Number.POSITIVE_INFINITY) window.setTimeout(() => { if (attachmentRef.current?.target === target) clearAttachment() }, holdMs)
  }, [clearAttachment, config, duration])
  const flyTo = useCallback((target: HTMLElement) => {
    const shell = shellRef.current
    if (!shell || !target.isConnected || target === attachmentRef.current?.target) return
    const placement = choosePlacement(target, config)
    const draft: WebPetAttachment = { target, ...placement, layer: poseLayer(placement.pose), scrollContainer: scrollContainerFor(target) }
    const originRect = shell.getBoundingClientRect(); const origin = { x: originRect.left + window.scrollX, y: originRect.top + window.scrollY }; const destination = documentPosition(draft, config)
    clearAttachment(); setPosition(origin); setPatrolFacing(destination.x < origin.x ? 'left' : 'right'); setPatrolling(true)
    const point = { x: origin.x, y: origin.y }; const peak = Math.min(origin.y, destination.y) - Math.min(92, Math.max(34, Math.hypot(destination.x - origin.x, destination.y - origin.y) * 0.18))
    const tween = gsap.timeline({ onComplete: () => { patrolTween.current = null; setPatrolling(false); attach(target, placement, { x: point.x, y: point.y }, duration) } })
    patrolTween.current = tween
    tween.to(point, { x: (origin.x + destination.x) / 2, y: peak, duration: 0.34, ease: 'power2.out', onUpdate: () => setPosition({ x: point.x, y: point.y }) })
      .to(point, { x: destination.x, y: destination.y, duration: 0.34, ease: 'power2.in', onUpdate: () => setPosition({ x: point.x, y: point.y }) })
  }, [attach, clearAttachment, config, duration])

  useEffect(() => { if (attachment) return; try { localStorage.setItem(storageKey, JSON.stringify(position)) } catch { /* optional persistence */ } }, [attachment, position, storageKey])
  useEffect(() => { if (!attachment) return; const sync = () => { if (!attachment.target.isConnected) clearAttachment(); else setPosition(renderPosition(attachment, config)) }; const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync); observer?.observe(attachment.target); if (attachment.scrollContainer) observer?.observe(attachment.scrollContainer); window.addEventListener('resize', sync); window.addEventListener('scroll', sync, true); sync(); return () => { observer?.disconnect(); window.removeEventListener('resize', sync); window.removeEventListener('scroll', sync, true) } }, [attachment, clearAttachment, config])
  useEffect(() => { if (!patrol || attachment || dragging || mood !== 'idle') return; const schedule = () => { patrolTimer.current = window.setTimeout(() => { const candidates = Array.from(document.querySelectorAll<HTMLElement>(CARD_SELECTOR)).filter((target) => target.isConnected && target.dataset.webpetIgnore !== 'true' && isVisible(target)); if (candidates.length) flyTo(candidates[Math.floor(Math.random() * candidates.length)]); schedule() }, patrolIntervalMs ?? config.patrolDelayMs) }; schedule(); return () => { if (patrolTimer.current !== null) window.clearTimeout(patrolTimer.current); patrolTween.current?.kill() } }, [attachment, config.patrolDelayMs, dragging, flyTo, mood, patrol, patrolIntervalMs])
  useEffect(() => () => { clearAttachment() }, [clearAttachment])

  const setCandidate = (target: HTMLElement | null) => { if (dropRef.current === target) return; clearDrop(); dropRef.current = target; if (target) target.dataset.webpetDropTarget = 'active' }
  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>, offsetX: number, offsetY: number) => { clearAttachment(); dragRef.current = { pointerId: event.pointerId, offsetX, offsetY, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, lastAt: performance.now(), velocityX: 0, velocityY: 0 }; setDragging(true) }
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => { if (event.button !== 0 && event.pointerType !== 'touch') return; const rect = event.currentTarget.getBoundingClientRect(); const offsetX = event.clientX - rect.left; const offsetY = event.clientY - rect.top; const covered = event.pointerType === 'touch' ? null : document.elementsFromPoint(event.clientX, event.clientY).map((element) => element instanceof HTMLElement ? element.closest<HTMLElement>(INTERACTIVE_SELECTOR) : null).find((element): element is HTMLElement => Boolean(element && !element.closest('.webpet-shell') && element.dataset.webpetIgnore !== 'true')); if (covered) { clickThrough.current = { pointerId: event.pointerId, target: covered, x: event.clientX, y: event.clientY, offsetX, offsetY }; event.currentTarget.setPointerCapture(event.pointerId); return } beginDrag(event, offsetX, offsetY); event.currentTarget.setPointerCapture(event.pointerId) }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => { const pending = clickThrough.current; if (pending?.pointerId === event.pointerId && !dragRef.current) { if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) <= config.clickTolerance) return; clickThrough.current = null; beginDrag(event, pending.offsetX, pending.offsetY) } const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; const now = performance.now(); const elapsed = Math.max(8, now - drag.lastAt); drag.velocityX = drag.velocityX * 0.55 + ((event.clientX - drag.lastX) / elapsed * 1000) * 0.45; drag.velocityY = drag.velocityY * 0.55 + ((event.clientY - drag.lastY) / elapsed * 1000) * 0.45; drag.lastX = event.clientX; drag.lastY = event.clientY; drag.lastAt = now; setCandidate(targetAtPoint(event.clientX, event.clientY, config)); setPosition(clamp({ x: event.clientX + window.scrollX - drag.offsetX, y: event.clientY + window.scrollY - drag.offsetY }, config)) }
  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => { const pending = clickThrough.current; if (pending?.pointerId === event.pointerId && !dragRef.current) { clickThrough.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) <= config.clickTolerance && pending.target.isConnected) pending.target.click(); return } const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; const target = dropRef.current; clearDrop(); dragRef.current = null; setDragging(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (target) { const rect = event.currentTarget.getBoundingClientRect(); attach(target, choosePlacement(target, config, event.clientX, event.clientY), { x: rect.left + window.scrollX, y: rect.top + window.scrollY }, duration) } }

  const selectedAnimation: WebPetAnimation = dragging ? 'catching' : patrolling ? (patrolFacing === 'left' ? 'runningLeft' : 'runningRight') : attachment?.pose ?? animation ?? config.moodAnimations[mood]
  const node = (
    <div ref={shellRef} className={`webpet-shell${className ? ` ${className}` : ''}`} style={{ position: 'absolute', left: position.x, top: position.y, width: config.size, height: config.size * config.atlas.frameHeight / config.atlas.frameWidth, zIndex: attachment?.layer === 'back' ? 40 : 70 }} data-webpet-state={attachment ? 'attached' : dragging ? 'dragging' : 'free'} data-webpet-layer={attachment?.layer} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopDragging} onPointerCancel={stopDragging}>
      <PetCharacter mood={mood} animation={selectedAnimation} config={config} flipped={attachment?.flip ?? false} />
      {bubble && <div className="webpet-bubble" role="status">{bubble}</div>}
    </div>
  )
  if (typeof document === 'undefined') return null
  return createPortal(node, document.body)
}
