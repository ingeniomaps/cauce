---
caso: 032
titulo: El cuerpo de un heredoc se juzga como comando, y un heredoc nunca se ejecuta
estado: resuelto
prioridad: media
version-detectada: 0.62.0
resuelto-en: 0.63.0
---

# 032 — Escribir un documento que menciona un comando peligroso se bloquea

**🟢 resuelto en 0.63.0** · detectado en 0.62.0 · prioridad **media** — falso positivo sobre datos, no sobre comandos

## Resumen

0.62.0 decidió que lo entrecomillado se lee como dato **sólo** cuando el comando es un commit, y que en
cualquier otro caso lo que va entre comillas se ejecuta y se sigue juzgando. Para argumentos
entrecomillados la decisión es correcta: `sh -c "rm -rf /"` sí ejecuta lo de adentro.

Un heredoc no es eso. Su cuerpo es **entrada estándar**: no se ejecuta nunca, en ningún caso, por
ninguna vía. Escribir un archivo con `cat > archivo <<'EOF' … EOF` es escribir texto, y el texto se
está juzgando como si fuera un programa.

La consecuencia práctica es que no se puede documentar lo que el guard vigila. Este mismo archivo, y
[030](030-la-exencion-del-mensaje-de-commit-no-ve-un-prefijo-de-entorno.md) antes que él, no se
pudieron escribir con un heredoc: el cuerpo los bloqueó por nombrar aquello de lo que hablan.

## Reproducción

```bash
cat > nota.md <<'FIN'
Este documento explica por qué rm -rf / es catastrófico.
FIN
```

```
BLOQUEADO: 'rm -r' sobre /, home o el directorio padre es catastrófico.
```

*Verificado* el 2026-09-06 sobre 0.62.0, con el destino dentro de las raíces declaradas —no es el
límite de escritura el que dispara, es el contenido—.

Sirve cualquier frase de la tabla de `destructive` o de las que vigila el guard de publicación. Y
sirve cualquier comando que reciba un heredoc: `cat`, `tee`, `python3 - <<PY`, `sed -f -`.

## Causa raíz

El comando llega al guard como una sola cadena y las reglas se evalúan sobre todo su texto. Un heredoc
mete el documento entero adentro de esa cadena, así que cada línea del documento queda expuesta a
reglas escritas para juzgar comandos.

La distinción que falta no es entre «comando» y «no comando», que es difícil, sino entre **argumento** y
**redirección de entrada**, que es sintáctica y está bien delimitada: lo que va entre el delimitador de
apertura y el de cierre no se ejecuta. `shell-boundary` resuelve bien el destino de `cat > destino <<EOF`, pero no
porque sepa qué es un heredoc: su patrón de redirección frena en el `<`, y eso alcanza por accidente.
O sea que el recorte que este caso pide hay que escribirlo, no reusarlo de ahí.

## Fix propuesto

Recortar los cuerpos de heredoc del texto antes de aplicar las reglas de contenido, conservando la
línea que los abre —que sí es comando y sí tiene que juzgarse, incluido su destino—:

```diff
+// El cuerpo de un heredoc es entrada estándar y no se ejecuta nunca: juzgarlo como comando bloquea
+// escribir un documento que menciona lo que el guard vigila. La línea de apertura sí es comando y se
+// conserva entera, con su redirección, para que `shell-boundary` siga viendo dónde escribe.
+function stripHeredocBodies(command) {
+  return command.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm, '<<$1$2$1')
+}
```

Vale para todas las reglas de contenido, no sólo para las tres de `destructive`: el guard de
publicación tiene el mismo falso positivo.

Un borde que apareció al implementarlo y que el diff de arriba no cubre: el cuerpo empieza en el salto
de línea, **no en el delimitador**. `cat <<FIN > salida` es una forma válida y su destino va después del
`<<`; recortando desde ahí se pierde, y no lo nota nadie porque en la forma común el destino va antes.
Lo encontró una mutación que sobrevivía —quitar la apertura entera no rompía ninguna prueba—, que es la
señal de que faltaba el caso, no de que la línea sobrara.

Lo que **no** hay que hacer es extender la exención de commits a cualquier comillado. Ahí la decisión
de 0.62.0 es correcta y este caso no la toca: `bash -c "…"` ejecuta su argumento, un heredoc no.

## Tradeoffs

Se pierde la capacidad de frenar un comando escondido en un cuerpo de heredoc que después alguien
ejecute —`cat > script.sh <<'EOF'` con algo destructivo adentro—. Es un intercambio aceptable y
consciente: ese archivo no ejecuta nada al escribirse, y cuando alguien lo corra, el guard verá el
comando de verdad. Frenar el texto no frena la ejecución, sólo la documentación.

## Prioridad

**Media.** No desprotege nada —bloquea de más, no de menos— y el bloqueo se ve. Pero cae justo sobre
escribir documentación de seguridad, que es trabajo que este proyecto hace seguido: los dos casos
anteriores a éste lo sufrieron, y la salida fue cambiar de herramienta para escribir un archivo, que es
el rodeo que un guard no debería estar enseñando.

## Contexto de descubrimiento

Al escribir el caso 030 en `gouduet`, el 2026-09-06. El heredoc que creaba el archivo fue bloqueado por
mencionar la operación que el caso analiza. El archivo terminó escribiéndose con otra herramienta.

## Relacionados

- [022](022-pre-shell-no-juzga-el-destino-de-una-escritura.md) — el guard que salió de ahí resuelve
  bien la **cabecera** del heredoc para saber dónde escribe. Este caso pide que el mismo parser recorte
  el **cuerpo** antes de juzgar contenido.
