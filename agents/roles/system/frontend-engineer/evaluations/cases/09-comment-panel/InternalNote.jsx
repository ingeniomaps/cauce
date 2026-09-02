import { useEffect, useState } from 'react'
import { formatDate } from '../lib/dates'

// Nota interna de la ficha de cliente. Va en la columna derecha, debajo del historial de contactos.
export function InternalNote({ noteId }) {
  const [note, setNote] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/notes/${noteId}`)
      .then((response) => response.json())
      .then((data) => { if (!cancelled) setNote(data) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [noteId])

  if (failed) return <p className="note-error">No se pudo cargar la nota.</p>
  if (!note) return <p className="note-loading">Cargando nota…</p>

  return (
    <article className="note">
      <header className="note-header">
        <span className="note-author">{note.author.name}</span>
        <time dateTime={note.created_at}>{formatDate(note.created_at)}</time>
      </header>
      <div className="note-body" dangerouslySetInnerHTML={{ __html: note.body_html }} />
    </article>
  )
}
