import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { AgentMessage } from '../types'

export function AgentSection() {
  const [messages, setMessages] = useState<AgentMessage[]>([
    { role: 'agent', text: 'Hi! Ask me about your budget, guests, or what to do next.' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setMessages((m) => [...m, { role: 'user', text }])
    setInput('')
    setBusy(true)
    try {
      const { reply } = await api.askAgent(text)
      setMessages((m) => [...m, { role: 'agent', text: reply }])
    } catch (err) {
      setMessages((m) => [...m, { role: 'agent', text: `Error: ${(err as Error).message}` }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card page-card agent">
      <h2>Ask the Agent</h2>
      <div className="chat">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="add-form" onSubmit={send}>
        <input
          aria-label="Message the agent"
          placeholder="e.g. How's my budget?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </section>
  )
}
