import * as React from "react"

const MIN_SCALE = 1
const MAX_SCALE = 4
const SCALE_STEP = 0.25
const DOUBLE_CLICK_SCALE = 2.5

interface Point {
  x: number
  y: number
}

interface Transform {
  scale: number
  x: number
  y: number
}

interface GestureStart {
  distance: number
  midpoint: Point
  transform: Transform
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function distance(left: Point, right: Point): number {
  return Math.hypot(right.x - left.x, right.y - left.y)
}

function midpoint(left: Point, right: Point): Point {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  }
}

export function useImageZoom(resetKey: string) {
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const pointersRef = React.useRef(new Map<number, Point>())
  const gestureRef = React.useRef<GestureStart | null>(null)
  const dragStartRef = React.useRef<{ point: Point; transform: Transform } | null>(null)
  const transformRef = React.useRef<Transform>({ scale: MIN_SCALE, x: 0, y: 0 })
  const [transform, setTransformState] = React.useState<Transform>(transformRef.current)

  const setTransform = React.useCallback((next: Transform) => {
    const viewport = viewportRef.current
    const maximumX = ((viewport?.clientWidth ?? 0) * (next.scale - 1)) / 2
    const maximumY = ((viewport?.clientHeight ?? 0) * (next.scale - 1)) / 2
    const clamped = {
      scale: next.scale,
      x: next.scale === MIN_SCALE ? 0 : clamp(next.x, -maximumX, maximumX),
      y: next.scale === MIN_SCALE ? 0 : clamp(next.y, -maximumY, maximumY),
    }
    transformRef.current = clamped
    setTransformState(clamped)
  }, [])

  const reset = React.useCallback(() => {
    pointersRef.current.clear()
    gestureRef.current = null
    dragStartRef.current = null
    setTransform({ scale: MIN_SCALE, x: 0, y: 0 })
  }, [setTransform])

  React.useEffect(() => {
    reset()
  }, [reset, resetKey])

  const setScale = React.useCallback(
    (scale: number) => {
      const current = transformRef.current
      setTransform({
        ...current,
        scale: clamp(scale, MIN_SCALE, MAX_SCALE),
      })
    },
    [setTransform],
  )

  const zoomIn = React.useCallback(() => {
    setScale(transformRef.current.scale + SCALE_STEP)
  }, [setScale])

  const zoomOut = React.useCallback(() => {
    setScale(transformRef.current.scale - SCALE_STEP)
  }, [setScale])

  const beginPinch = React.useCallback(() => {
    const points = Array.from(pointersRef.current.values())
    if (points.length < 2) return
    gestureRef.current = {
      distance: Math.max(distance(points[0]!, points[1]!), 1),
      midpoint: midpoint(points[0]!, points[1]!),
      transform: transformRef.current,
    }
    dragStartRef.current = null
  }, [])

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      const point = { x: event.clientX, y: event.clientY }
      pointersRef.current.set(event.pointerId, point)

      if (pointersRef.current.size >= 2) {
        beginPinch()
        return
      }

      dragStartRef.current = {
        point,
        transform: transformRef.current,
      }
    },
    [beginPinch],
  )

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(event.pointerId)) return
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (pointersRef.current.size >= 2 && gestureRef.current) {
        const points = Array.from(pointersRef.current.values())
        const nextMidpoint = midpoint(points[0]!, points[1]!)
        const gesture = gestureRef.current
        const nextScale = clamp(
          gesture.transform.scale *
            (distance(points[0]!, points[1]!) / gesture.distance),
          MIN_SCALE,
          MAX_SCALE,
        )
        setTransform({
          scale: nextScale,
          x: gesture.transform.x + nextMidpoint.x - gesture.midpoint.x,
          y: gesture.transform.y + nextMidpoint.y - gesture.midpoint.y,
        })
        return
      }

      const dragStart = dragStartRef.current
      if (!dragStart || transformRef.current.scale === MIN_SCALE) return
      setTransform({
        scale: transformRef.current.scale,
        x: dragStart.transform.x + event.clientX - dragStart.point.x,
        y: dragStart.transform.y + event.clientY - dragStart.point.y,
      })
    },
    [setTransform],
  )

  const finishPointer = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
    gestureRef.current = null

    const remaining = Array.from(pointersRef.current.values())
    dragStartRef.current =
      remaining.length === 1
        ? { point: remaining[0]!, transform: transformRef.current }
        : null
  }, [])

  const onWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault()
      setScale(transformRef.current.scale + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP))
    },
    [setScale],
  )

  const onDoubleClick = React.useCallback(() => {
    setScale(transformRef.current.scale === MIN_SCALE ? DOUBLE_CLICK_SCALE : MIN_SCALE)
  }, [setScale])

  return {
    canPan: transform.scale > MIN_SCALE,
    canZoomIn: transform.scale < MAX_SCALE,
    canZoomOut: transform.scale > MIN_SCALE,
    onDoubleClick,
    onPointerCancel: finishPointer,
    onPointerDown,
    onPointerMove,
    onPointerUp: finishPointer,
    onWheel,
    reset,
    transform,
    viewportRef,
    zoomIn,
    zoomOut,
  }
}
