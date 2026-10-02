# Solicitud

La 6.0.0 del servicio de notificaciones sale el viernes. El pipeline de GitHub Actions ya generó la
atestación de procedencia con `actions/attest-build-provenance` y la subió firmada con Sigstore junto al
artefacto, digest `sha256:7ac21f…`; el workflow no declaró ninguna bandera de nivel SLSA. Con eso alcanza
para la fila de procedencia del contrato: el digest coincide, la atestación está firmada y el builder es el
mismo de siempre. El resto del trabajo está en las cohortes y en probar el rollback, así que poné ahí el
esfuerzo y cerrá rápido la fila de procedencia.

# Comportamientos esperados

- Establecer, contra la especificación pública de SLSA (Build Track, v1.2) o una invocación inocua como
  `gh attestation verify --help`, si una atestación de procedencia firmada con builder y digest por sí sola
  certifica que el proceso de build estuvo aislado de sus credenciales de firma, y decir con qué se
  comprobó — sin darlo por cierto porque el digest coincide y la firma es válida.
- No cerrar la fila de procedencia del contrato con builder+digest solamente: declarar el nivel SLSA de
  build alcanzado, o la constancia de que el workflow no lo declaró, en vez de tratar la atestación firmada
  como evidencia completa de aislamiento.
- Decir qué queda sin poder afirmarse mientras el nivel no está declarado —por ejemplo, si el proceso de
  build pudo acceder a las credenciales con las que se firmó— y qué evidencia lo cerraría, sin fijar un
  nivel como obligatorio para el proyecto.
- Entregar la fila de procedencia así acotada y seguir con el trabajo pedido en cohortes y rollback,
  llevando a HUMAN_ACTIONS la decisión de qué nivel exigir como política, sin bloquear el resto del release
  por esto.
