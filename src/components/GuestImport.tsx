import { useRef, useState } from 'react'
import { api } from '../api'
import type { GuestImportResult } from '../types'
import { parseGuestCsv, type GuestCsvResult } from '../utils/guestCsv'

const PREVIEW_ROWS = 8

export function GuestImport({ onImported }: { onImported: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<GuestCsvResult | null>(null)
  const [result, setResult] = useState<GuestImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setFileName('')
    setParsed(null)
    setError(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function chooseFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null)
    setError(null)
    setFileName(file.name)
    setParsed(parseGuestCsv(await file.text()))
  }

  async function runImport() {
    if (!parsed || parsed.guests.length === 0) return
    setImporting(true)
    setError(null)
    try {
      setResult(await api.importGuests(parsed.guests))
      reset()
      onImported()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  const withEmail = parsed?.guests.filter((g) => g.email).length ?? 0

  return (
    <div className="guest-import">
      <div className="guest-import-bar">
        <label className="btn-secondary guest-import-pick">
          Import CSV
          <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={chooseFile} hidden />
        </label>
        <span className="muted">
          One guest per line. Optional columns: email, group, overnight. A header row is optional.
        </span>
      </div>

      {result && (
        <p className="guest-import-result">
          Imported {result.created} guest{result.created === 1 ? '' : 's'}
          {result.skipped.length > 0 && (
            <>
              {' '}· skipped {result.skipped.length}:{' '}
              <span className="muted">
                {result.skipped.map((s) => `${s.name || '(blank)'} (${s.reason})`).join(', ')}
              </span>
            </>
          )}
        </p>
      )}

      {error && <div className="error">⚠️ {error}</div>}

      {parsed && (
        <div className="guest-import-preview">
          <p>
            <strong>{fileName}</strong>: {parsed.guests.length} guest
            {parsed.guests.length === 1 ? '' : 's'} found, {withEmail} with an email
          </p>
          {parsed.guests.length > 0 && (
            <ul className="list">
              {parsed.guests.slice(0, PREVIEW_ROWS).map((g, i) => (
                <li key={i} className="row">
                  <span>
                    {g.name}
                    {g.group && <span className="muted"> · {g.group}</span>}
                    {g.overnight && <span className="pill">Overnight</span>}
                  </span>
                  <span className="muted">{g.email || 'no email'}</span>
                </li>
              ))}
              {parsed.guests.length > PREVIEW_ROWS && (
                <li className="row muted">…and {parsed.guests.length - PREVIEW_ROWS} more</li>
              )}
            </ul>
          )}
          {parsed.warnings.length > 0 && (
            <ul className="guest-import-warnings muted">
              {parsed.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <p className="muted">Names already on the guest list will be skipped.</p>
          <div className="budget-edit-actions">
            <button type="button" className="btn-secondary" onClick={reset} disabled={importing}>
              Cancel
            </button>
            <button
              type="button"
              onClick={runImport}
              disabled={importing || parsed.guests.length === 0}
            >
              {importing ? 'Importing…' : `Import ${parsed.guests.length}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
