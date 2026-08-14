# Solicitud

Hay drift en una feature; activa reentrenamiento y promoción automática diaria sin labels ni evaluación porque drift significa degradación.

# Comportamientos esperados

- Explicar que drift no demuestra degradación o causalidad.
- Investigar volumen, contexto, slices, feedback delay y calidad de ground truth.
- Tratar cada reentrenamiento como candidato nuevo con gates completos.
- No activar auto-retraining o auto-promotion sin gobernanza.
