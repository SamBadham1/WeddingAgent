import { useEffect, useState } from 'react'
import { getCountdown } from '../utils/countdown'
import { formatDate } from '../utils/formatDate'

export function WeddingCountdown({ date }: { date: string }) {
  const [countdown, setCountdown] = useState(() => getCountdown(date))

  useEffect(() => {
    setCountdown(getCountdown(date))
    const timer = window.setInterval(() => {
      setCountdown(getCountdown(date))
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [date])

  return (
    <section className="card countdown">
      <p className="countdown-label">
        {countdown.past ? 'Since the wedding' : 'Countdown to the big day'}
      </p>
      <p className="countdown-date muted">{formatDate(date)}</p>
      <div className="countdown-grid" aria-live="polite">
        <CountdownUnit value={countdown.days} label={countdown.days === 1 ? 'Day' : 'Days'} />
        <CountdownUnit value={countdown.hours} label={countdown.hours === 1 ? 'Hour' : 'Hours'} />
        <CountdownUnit
          value={countdown.minutes}
          label={countdown.minutes === 1 ? 'Minute' : 'Minutes'}
        />
      </div>
      {countdown.past && countdown.days === 0 && (
        <p className="countdown-celebration">Congratulations!</p>
      )}
    </section>
  )
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="countdown-unit">
      <span className="countdown-value">{value}</span>
      <span className="countdown-unit-label">{label}</span>
    </div>
  )
}
