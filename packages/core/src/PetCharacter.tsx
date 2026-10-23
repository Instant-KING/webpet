import { PetX, type CodexPetAnimations } from '@petx/react'
import '@petx/react/styles.css'
import { useEffect, useRef, useState } from 'react'
import type { WebPetAnimation, WebPetConfig, WebPetMood } from './types'

type Props = {
  mood: WebPetMood
  animation?: WebPetAnimation
  config: WebPetConfig
  flipped?: boolean
}

type TimelineStep = { frame: number; duration: number; y?: number; spriteAnimation?: WebPetAnimation }
type Timeline = { steps: readonly TimelineStep[]; loopFrom?: number; exitSteps?: readonly TimelineStep[] }

const CONTROLLED: Partial<Record<WebPetAnimation, Timeline>> = {
  idle: {
    loopFrom: 0,
    steps: [
      { frame: 5, duration: 2200 },
      { frame: 0, duration: 100 }, { frame: 1, duration: 100 },
      { frame: 2, duration: 120 }, { frame: 3, duration: 100 },
      { frame: 4, duration: 120 }, { frame: 5, duration: 700 },
    ],
  },
  waiting: {
    loopFrom: 2,
    steps: [
      { frame: 0, duration: 180 }, { frame: 1, duration: 200 },
      { frame: 2, duration: 260 }, { frame: 3, duration: 260 },
      { frame: 4, duration: 260 }, { frame: 5, duration: 260 },
    ],
    exitSteps: [
      { frame: 5, duration: 90 }, { frame: 4, duration: 90 },
      { frame: 3, duration: 90 }, { frame: 2, duration: 90 },
      { frame: 1, duration: 220 }, { frame: 0, duration: 260 },
    ],
  },
  waving: {
    steps: [
      { frame: 0, duration: 120 }, { frame: 1, duration: 140 },
      { frame: 2, duration: 170 }, { frame: 3, duration: 210 },
      { frame: 2, duration: 160 }, { frame: 1, duration: 140 },
      { frame: 0, duration: 260 },
    ],
  },
  review: {
    loopFrom: 3,
    steps: [
      { frame: 0, duration: 140 }, { frame: 1, duration: 180 },
      { frame: 2, duration: 220 }, { frame: 3, duration: 220 },
      { frame: 4, duration: 220 }, { frame: 5, duration: 260 },
    ],
    exitSteps: [
      { frame: 5, duration: 80 }, { frame: 4, duration: 80 },
      { frame: 3, duration: 80 }, { frame: 2, duration: 120 },
      { frame: 1, duration: 180 }, { frame: 0, duration: 260 },
    ],
  },
  jumping: {
    steps: [
      { spriteAnimation: 'idle', frame: 5, duration: 120 },
      { frame: 0, duration: 140 }, { frame: 1, duration: 160 },
      { frame: 2, duration: 180, y: -20 }, { frame: 3, duration: 220, y: -48 },
      { frame: 4, duration: 180 }, { spriteAnimation: 'idle', frame: 5, duration: 300 },
    ],
  },
  working: {
    loopFrom: 4,
    steps: [
      { frame: 0, duration: 180 }, { frame: 1, duration: 200 },
      { frame: 2, duration: 220 }, { frame: 3, duration: 240 },
      { frame: 4, duration: 260 }, { frame: 5, duration: 420 },
    ],
    exitSteps: [
      { frame: 5, duration: 200 }, { frame: 4, duration: 200 },
      { frame: 3, duration: 180 }, { frame: 2, duration: 170 },
      { frame: 1, duration: 150 }, { frame: 0, duration: 180 },
    ],
  },
  catching: {
    steps: [
      { frame: 0, duration: 150 }, { frame: 1, duration: 180 },
      { frame: 2, duration: 220 }, { frame: 3, duration: 520 },
    ],
  },
  peekTop: { loopFrom: 0, steps: [
    { frame: 0, duration: 2400 }, { frame: 1, duration: 100 },
    { frame: 2, duration: 120 }, { frame: 3, duration: 100 }, { frame: 4, duration: 700 },
  ] },
  hangBottom: { steps: [{ frame: 0, duration: 999999 }] },
  sitTop: { loopFrom: 0, steps: [
    { frame: 0, duration: 2500 }, { frame: 1, duration: 110 },
    { frame: 2, duration: 120 }, { frame: 3, duration: 110 }, { frame: 4, duration: 750 },
  ] },
  peekSide: { steps: [{ frame: 0, duration: 999999 }] },
  hideSide: { steps: [{ frame: 0, duration: 999999 }] },
  grabSide: { steps: [{ frame: 0, duration: 999999 }] },
  cornerGrab: { steps: [{ frame: 0, duration: 999999 }] },
}

type PlaybackCursor = { animation: WebPetAnimation; phase: 'main' | 'exit'; step: number }

function useTimeline(requestedAnimation: WebPetAnimation) {
  const pendingAnimation = useRef(requestedAnimation)
  const [cursor, setCursor] = useState<PlaybackCursor>({ animation: requestedAnimation, phase: 'main', step: 0 })
  const timeline = CONTROLLED[cursor.animation]
  const steps = cursor.phase === 'exit' ? timeline?.exitSteps : timeline?.steps
  const current = steps?.[Math.min(cursor.step, (steps?.length ?? 1) - 1)]

  useEffect(() => {
    pendingAnimation.current = requestedAnimation
    setCursor((active) => {
      if (active.animation === requestedAnimation && active.phase === 'main') return active
      if (active.phase === 'exit') return active
      const activeTimeline = CONTROLLED[active.animation]
      return activeTimeline?.exitSteps?.length
        ? { ...active, phase: 'exit', step: 0 }
        : { animation: requestedAnimation, phase: 'main', step: 0 }
    })
  }, [requestedAnimation])

  useEffect(() => {
    if (!timeline || !steps || !current) return
    const atEnd = cursor.step >= steps.length - 1
    if (cursor.phase === 'main' && atEnd && timeline.loopFrom === undefined) return
    const timer = window.setTimeout(() => {
      setCursor((active) => {
        if (active.animation !== cursor.animation || active.phase !== cursor.phase || active.step !== cursor.step) return active
        if (cursor.phase === 'exit' && atEnd) return { animation: pendingAnimation.current, phase: 'main', step: 0 }
        return { ...active, step: atEnd ? timeline.loopFrom ?? active.step : active.step + 1 }
      })
    }, current.duration)
    return () => window.clearTimeout(timer)
  }, [current, cursor.animation, cursor.phase, cursor.step, steps, timeline])

  return {
    animation: cursor.animation,
    frame: current?.frame,
    spriteAnimation: current?.spriteAnimation ?? cursor.animation,
    y: current?.y ?? 0,
    controlled: Boolean(timeline),
  }
}

export function PetCharacter({ mood, animation, config, flipped = false }: Props) {
  const activeAnimation = animation ?? config.moodAnimations[mood]
  const playback = useTimeline(activeAnimation)
  const animations = config.animations as CodexPetAnimations
  return (
    <div
      className={`webpet-character webpet-mood-${mood}${flipped ? ' webpet-flipped' : ''}`}
      style={{ transform: `${flipped ? 'scaleX(-1)' : ''}${playback.y ? ` translateY(${playback.y}px)` : ''}`.trim() || undefined }}
      aria-hidden
    >
      <PetX
        src={config.src}
        spriteVersionNumber={config.spriteVersionNumber}
        atlas={config.atlas}
        key={playback.spriteAnimation}
        animation={playback.spriteAnimation}
        animations={animations}
        frame={playback.frame}
        playing={!playback.controlled}
        size={config.size}
        title="Web Pet"
      />
    </div>
  )
}
