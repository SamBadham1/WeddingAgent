export interface CountdownParts {
  past: boolean
  days: number
  hours: number
  minutes: number
}

export function getCountdown(weddingDateIso: string, now = new Date()): CountdownParts {
  const wedding = new Date(weddingDateIso + 'T00:00:00')
  const diff = wedding.getTime() - now.getTime()

  if (diff <= 0) {
    const elapsed = Math.abs(diff)
    return {
      past: true,
      days: Math.floor(elapsed / (1000 * 60 * 60 * 24)),
      hours: Math.floor((elapsed % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60)),
    }
  }

  return {
    past: false,
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
  }
}
