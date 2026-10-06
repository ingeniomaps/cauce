---
caso: 287
titulo: el guard de credenciales toma el patrón de un grep por un archivo
estado: resuelto
resuelto-en: 0.104.0
prioridad: alta
version-detectada: 0.103.0
---

# 287 — Buscar `\.env\.schema` o `process\.env\.` en el código se frena como si se leyera un `.env`

**🟢 resuelto en 0.104.0** · detectado en 0.103.0 · prioridad **alta**.

**Prioridad alta**: es el freno más frecuente dentro de un recorrido en una instancia real, y ninguna de las veces había una credencial en juego. Buscar dónde se usa una variable de entorno es lo primero que hace un agente antes de tocarla.

## Resumen

`secrets-shell` frena el comando que muestra el contenido de una credencial. Para saber qué archivos lee,
toma todas las palabras del tramo que empieza con un lector —`grep`, `sed`, `awk`, `jq`—, también la que es
el patrón de búsqueda o el script. Un patrón que nombra un archivo de entorno se lee como ese archivo.

## Reproducción

Instancia sidecar con una raíz `platform`, sin ningún `.env` en la carpeta de la sesión. Pasándole al hook
la llamada como la manda el runner:

```bash
grep -rn "\.env\.schema" platform
grep -rn "process\.env\." platform/src | head
grep -rln "credencialesDeApp" platform/src
```

## Síntoma

```
BLOQUEADO: el comando lee <sesión>/.env, que es una credencial: leerla la deja en el contexto de la sesión.
BLOQUEADO: el comando lee <sesión>/credencialesDeApp, que es una credencial: […]
```

El archivo que nombra el bloqueo no existe. En una instancia real, sobre los transcriptos de treinta
recorridos: 26 de 44 frenos fueron éste —22 resueltos como `.env` y 4 como `credencialesDeApp`—, todos sobre
búsquedas en el código y ninguno sobre un archivo de credenciales.

## Causa raíz

`engine/hooks/secrets-shell.js`, `readTokens`: con un lector al frente, parte el tramo entero con
`/[^\s'"\`\\;|&<>(){}=,]+/g`. La barra invertida está entre los cortes, así que de `\.env\.schema` salen
`.env` y `.schema`, y la primera coincide con el nombre de una credencial. El patrón nunca se distingue de
los archivos que vienen después.

El caso 259 separó lo que un programa sólo lee de lo que ejecuta, para los demás guards de shell. Este
quedó afuera a propósito: lo entrecomillado puede ser un archivo de verdad —`grep KEY ".env"`—, así que acá
no alcanzaba con vaciar las comillas.

## Fix propuesto

Saber cuál argumento es el patrón: el primero que no es una bandera, o el valor de `-e`. Ése no se mira; los
que siguen, sí.

Vale la pena mirar si lo mismo le pasa a `secrets-read` con el `pattern` de la herramienta de búsqueda.

## Tradeoffs

- Hay que conocer qué banderas llevan valor. Con una que no se conoce, su valor se toma por el patrón y el
  patrón de verdad por un archivo: vuelve a frenar de más, que es el lado que se elige.
- Un `grep` con el patrón en una variable y el archivo armado de otra forma sigue pasando, como antes.

## Contexto de descubrimiento

Al preguntarle a una instancia real qué había frenado sus recorridos, para comprobar la clasificación del 285.

## Relacionados

- 259 — el texto que un programa sólo lee no es un comando.
- 104 — leer una credencial por shell.
- 286 — el mismo defecto en el guard de workers.

## Cierre

**Resuelto en 0.104.0.**

### El recorrido de lo que este caso enumeró

- **Fix — se hizo**, para `grep`, `egrep`, `fgrep`, `rg`, `sed`, `awk` y `jq`. En `awk` y `jq` tampoco se miran
  los datos que no son archivos: el separador y las variables de uno, los `--arg` del otro.
- **«Vale la pena mirar si le pasa a `secrets-read`» — se miró y no.** Ese guard mira la ruta y el `glob`
  de la herramienta, no su `pattern`.
- **Tradeoffs — se pagan los dos.** El primero tiene su prueba: `grep --max-count 3 KEY .env` frena.

### Qué se corrió

- **La reproducción, antes y después**, contra el guard: los tres comandos salían con 2 y ahora con 0.
  Ocho comandos que sí leen la credencial siguen saliendo con 2, entre ellos `grep KEY .env`,
  `grep -e KEY .env`, `sed -n '1,5p' .env` y `grep -f .env notas.txt`.
- **Cinco mutaciones en rojo**, en una copia: el patrón leído otra vez como ruta, el patrón posicional sin
  saltear, el valor de `-e` mirado, todo lo que sigue al lector salteado, y los datos de `awk` y `jq` mirados.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: una sesión real. Se midió el guard con la entrada del runner, no un recorrido.
