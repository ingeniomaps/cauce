# Proceso

## R1 — Pensar antes de editar

Leer aceptación, contexto y código actual; escribir el plan antes del primer cambio.

## R2 — Ejecutar por objetivo

Cada paso termina en un estado verificable, no en una lista de archivos a tocar.

## R3 — Review proactivo

Buscar fallos de corrección, seguridad, compatibilidad y operabilidad antes de Verify.

## R4 — Sincronización de estados

El estado se mueve de forma atómica entre contratos; nunca se copia para representar progreso.

## R16 — El costo es el contexto, no las palabras

Cada llamada reenvía el contexto entero, así que gasta más quien da más vueltas que quien escribe más.
Los comandos independientes van en una sola invocación; el CLI antes que el archivo; el fragmento antes
que el archivo entero; un subagente o un workflow sólo cuando el trabajo no entra en la corrida actual.

Se lee para escribir, no para confirmar: un archivo se lee una vez y se escribe entero. Releerlo para
comprobar que quedó no comprueba nada que un error no hubiera dicho.

Verificar es la excepción, y no se negocia. Ahorrar una llamada nunca justifica afirmar sin haber
comprobado —R14 no admite descuentos— ni dar por terminado lo que no se corrió.
