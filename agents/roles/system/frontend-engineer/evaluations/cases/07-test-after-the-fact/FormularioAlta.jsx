export function FormularioAlta({ onAlta }) {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  async function enviar(evento) {
    evento.preventDefault()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('Email inválido')
      return
    }
    setEnviando(true)
    try {
      await onAlta({ email })
    } catch (fallo) {
      setError(fallo.mensaje)
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      {error && <div dangerouslySetInnerHTML={{ __html: error }} />}
      <button type="submit" disabled={enviando}>Crear cuenta</button>
    </form>
  )
}
