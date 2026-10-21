---
caso: 402
titulo: secrets-shell toma `cat > .npmrc` como una lectura de credencial, aunque el comando escribe el archivo
estado: resuelto
resuelto-en: 0.112.0
prioridad: baja
version-detectada: 0.111.0
---

# 402 — `readTokens` junta todas las palabras de un tramo que empieza con un lector, incluidas las que van después de `>`: escribir `.npmrc` con `cat` se frena como si se leyera

**🟢 resuelto en 0.112.0** · detectado en 0.111.0 · prioridad **baja**. El freno es por una razón equivocada: lo que el guard
cuida —que el secreto entre al contexto de la sesión— no pasa al escribir.

## Resumen

`secrets-shell` busca credenciales en los tramos de un comando que leen. Un tramo lee si su verbo está en `READERS`
(`cat` está) o si redirige un archivo a la entrada. En ese tramo toma **todas** las palabras como lo leído, sin
separar el destino de una redirección de salida. `cat > .npmrc <<EOF … EOF` queda como lectura de `.npmrc`.

Escribir `.npmrc` con las herramientas de edición lo frena, a propósito, el guard de archivos
(`engine/hooks/files.js:49`), y desde el caso 117 eso se puede aprobar. **Desde el shell no lo frena ningún guard de
escritura**: `writesWithBase` (`engine/hooks/shell.js:413`) alimenta a `shell-boundary` y a `ops-config`, y ninguno de
los dos mira archivos de credenciales. O sea que hoy el freno equivocado de este caso es la única defensa que tiene
`cat > .npmrc`, y `echo … > .npmrc` ya pasa sin ella (medido abajo). Ese hueco es el caso 405.

## Reproducción

Registrada en una instancia real al publicar un paquete (`[<instancia>][guard-lee-una-escritura-como-lectura]` en su
INBOX). La entrada agrega que en un caso el guard resolvió la ruta contra el directorio anterior y no contra el del
comando; **eso no se comprobó** en esta corrida.

Medido el 2026-10-19 con el motor del repositorio en 0.111.0, `execute(<guard>, …)` sobre un repo vacío:

```
secrets-shell  FRENA | cat > .npmrc <<EOF
shell-boundary PASA  | cat > .npmrc <<EOF
secrets-shell  PASA  | echo "//r/:_authToken=x" > .npmrc
shell-boundary PASA  | echo "//r/:_authToken=x" > .npmrc
secrets-shell  FRENA | cat .npmrc
secrets-shell  FRENA | cat .npmrc > copia
```

## Causa raíz

`engine/hooks/secrets-shell.js:92-101` (`readTokens`): con `cat` como verbo, `segment.match(...)` devuelve también
`.npmrc`, que va después de `>`.

## Fix propuesto

**Va después del 405, o junto con él.** Solo, deja a `cat > .npmrc` igual que `echo > .npmrc`: no abre un hueco que
no exista, pero le quita la única defensa que tiene, y el hueco deja de verse.

En un tramo con verbo lector, quitar del conjunto lo que va después de `>` o `>>` (sin tocar `<`), y dejar que lo
juzgue la defensa de escritura del 405. La aceptación pide la mutación: con el recorte quitado, la prueba
`cat > .npmrc <<EOF` vuelve a frenar como lectura y falla; y `cat .npmrc` tiene que seguir frenando.

## Tradeoffs

- `cat .npmrc > copia` sigue siendo una lectura de `.npmrc`: el recorte es sólo del destino.

## Relacionados

- 405 — escribir un archivo de credenciales desde el shell no lo frena ningún guard.

## Contexto de descubrimiento

Revisión mensual del INBOX de una instancia real, el 2026-10-19.

## Cierre

**Resuelto en 0.112.0**, junto con el 405, como el caso pedía. `readTokens` (`engine/hooks/secrets-shell.js`) quita de
cada tramo lo que va después de `>` o `>>` antes de juntar lo leído, con la misma expresión con que `shell.js` encuentra
esos destinos (`REDIRECT`, ahora exportada). Lo que se escribe lo juzga `writtenCredentials`, del 405, como escritura.

El enunciado, ítem por ítem:

- **Quitar el destino de `>` y `>>` sin tocar `<`**: se hizo así. `cat < .npmrc > copia` sigue frenando como lectura.
- **Que lo juzgue la defensa de escritura del 405**: sí; ahí `cat > .npmrc` frena con «es un archivo de credenciales
  que su herramienta mantiene» y no con «el comando lee».
- **La mutación**: con el recorte quitado, la prueba ve frenar como lectura `cat > .env <<EOF` y falla (`Got unwanted
  exception: cat > .env <<EOF`). **La primera versión de la prueba no la veía**: sólo usaba `.npmrc`, y ahí el freno
  de escritura salta antes y tapa a la lectura. El recorte sólo se observa donde la escritura pasa, y eso es el `.env`.
- **`cat .npmrc` y `cat .npmrc > copia` siguen frenando**: sí, en la misma prueba y en la corrida real.
- **Lo que la entrada de la instancia agregaba, una ruta resuelta contra el directorio anterior**: no se reprodujo
  ni se miró aparte. `writesWithBase` ya resuelve cada destino contra el `cd` de su tramo (caso 298), así que si
  vuelve a pasar, entra como caso propio, con su comando.

**Lo que se corrió para saber que funciona.**

- `test/hooks/secrets-shell.test.js`, la prueba del 405, que cubre las dos mitades.
- Real, el grupo `pre-shell` entero como proceso (`engine/hooks/run.js pre-shell` con el payload del runner) sobre
  `ops bench suelto`, con el motor de `main` y con el de la rama:

  ```
  == main
  exit=0 | echo "//r/:_authToken=x" > .npmrc |
  exit=2 | cat > .npmrc <<EOF                | BLOQUEADO: el comando lee <banco>/.npmrc, que es una credencial: …
  exit=2 | cat > .env <<EOF                  | BLOQUEADO: el comando lee <banco>/.env, que es una credencial: …
  exit=0 | cp .env.example .env              |
  exit=2 | cat .npmrc                        | BLOQUEADO: el comando lee <banco>/.npmrc, que es una credencial: …
  exit=0 | echo hola > notas.txt             |
  == rama
  exit=2 | echo "//r/:_authToken=x" > .npmrc | BLOQUEADO: <banco>/.npmrc es un archivo de credenciales que su herramienta …
  exit=2 | cat > .npmrc <<EOF                | BLOQUEADO: <banco>/.npmrc es un archivo de credenciales que su herramienta …
  exit=0 | cat > .env <<EOF                  |
  exit=0 | cp .env.example .env              |
  exit=2 | cat .npmrc                        | BLOQUEADO: el comando lee <banco>/.npmrc, que es una credencial: …
  exit=0 | echo hola > notas.txt             |
  ```
