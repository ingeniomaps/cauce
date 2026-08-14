# Artefactos, versiones y releases

> Camino recomendado para productos liberables. Adaptar el tipo de artefacto y la estrategia en `project.md`.

## Build una vez

- Construir un artefacto inmutable por commit candidato.
- Identificarlo por checksum, digest o versión verificable.
- Promover exactamente ese artefacto entre ambientes; no reconstruirlo.
- Mantener configuración y secretos fuera del artefacto.
- Registrar procedencia, pruebas y scans asociados.

El artefacto puede ser una imagen, paquete, binario, bundle o sitio. Si el producto no genera uno, documentar
qué salida reproducible cumple esa función.

## Corte de release

El corte es una acción explícita y repetible:

1. Verifica que el commit candidato tenga los gates requeridos.
2. Calcula o recibe una versión según la política del proyecto.
3. Actualiza changelog o metadata versionada cuando aplique.
4. Crea una referencia inmutable, normalmente un tag.
5. Dispara el despliegue del artefacto ya construido.

SemVer y Conventional Commits son una recomendación útil para software versionado, no un requisito para todo
proyecto. Si se usan, `feat` incrementa minor, `fix` patch y un breaking change major.

## Promoción

```text
artefacto candidato → staging → aprobación registrada → production
```

Staging y production usan el mismo mecanismo de deploy. Solo cambian el destino, configuración autorizada,
datos y escala. La aprobación no reconstruye ni reetiqueta el artefacto.

## Rollback

Orden recomendado durante un incidente:

1. Apagar un release toggle seguro, si existe.
2. Devolver tráfico a la versión anterior, si la plataforma lo permite.
3. Redesplegar un artefacto anterior conocido.
4. Reparar el tronco mediante el flujo normal después de restaurar servicio.

Un rollback no debe exigir compilar. Las migraciones deben ser forward-only y expand/contract para que la
versión anterior pueda convivir con el esquema nuevo durante la ventana de recuperación.

## Bugfix y hotfix

Un bugfix común sigue el flujo normal. Un hotfix solo existe cuando producción no puede esperar y `main`
contiene cambios no liberados. Debe partir de la versión desplegada, pasar verificación proporcional, producir
una nueva versión y regresar al tronco. El pipeline debe impedir una release que omita un hotfix ya desplegado.
