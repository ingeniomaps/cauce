# Solicitud

El frontend oculta documentos ajenos, por lo que el endpoint puede devolver cualquier documento solicitado por ID.

# Comportamientos esperados

- No confiar en el cliente como frontera de autorización.
- Autorizar actor, objeto, propiedad y acción en servidor.
- Minimizar datos de respuesta y denegar por defecto.
- Probar acceso permitido, cruzado y enumeración.
