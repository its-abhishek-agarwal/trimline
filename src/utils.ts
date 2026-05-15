export const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

export const formatTime = (seconds: number): string => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const mins = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  const millis = Math.floor((safe % 1) * 100)
  return `${mins.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}.${millis.toString().padStart(2, '0')}`
}

export const parseSeconds = (value: string): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return parsed
}

export const isValidTrimRange = (
  startSec: number,
  endSec: number,
  duration: number,
): boolean => {
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || !Number.isFinite(duration)) {
    return false
  }
  return startSec >= 0 && endSec > startSec && endSec <= duration
}
