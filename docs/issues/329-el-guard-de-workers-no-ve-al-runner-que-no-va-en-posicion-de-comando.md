---
caso: 329
titulo: el guard de workers no ve al runner que no va en posición de comando
estado: abierto
prioridad: media
version-detectada: 0.103.5
---

# 329 — `docker run node:24 npx jest` pasa sin ningún tope, y `sh -c 'npx jest'` con los mismos argumentos frena

**🔴 abierto** · detectado en 0.103.5 · prioridad **media**.

**Prioridad media**: el guard frena la forma con `sh -c` y deja pasar la directa, así que la exigencia se
esquiva sin querer, con sólo escribir el comando más corto.

## Resumen

El guard de workers reconoce un runner de pruebas cuando está en posición de comando: al principio, después
de un separador, o detrás del `-c` de un shell. Un runner que otro programa recibe como argumento no lo ve.

## Reproducción

Las mostraron las revisiones del caso 313, con el guard real y sin nada declarado. Pasan todas:

```
docker run --rm node:24 npx jest                         el contenedor no tiene ningún tope
docker run --entrypoint sh node:24 -c 'npx vitest run'
echo `npx jest`                                           la máquina lo ejecuta
cat <<EOF ⏎ $(sh -c 'npx jest') ⏎ EOF                    el cuerpo de un heredoc no se lee
case $x in a) npx jest;; esac
f() { npx jest; }
```

Y hacia el otro lado, formas con el comando declarado o con los dos topes que frenan sin necesidad:

```
sudo scripts/run.sh sh -c 'npx jest'        time scripts/run.sh …        ( scripts/run.sh … )
docker run -m4g --cpus 4 …                   docker run --memory "4g" --cpus "4" …
docker --context ci run --memory 4g --cpus 4 …
```

## Causa raíz

`engine/hooks/workers.js`: `AT` abre posición de comando en `^`, `;`, `&`, `|`, `(`, salto de línea y la
comilla de un `sh -c`. Lo demás no es posición de comando, se ejecute o no.

## Fix propuesto

Hay que decidir primero qué se quiere, porque los dos caminos cambian el producto:

- **Ver al runner como argumento de un lanzador conocido** (`docker run`, `podman run`, `env`, `time`,
  `sudo`, `xargs`): frena formas que hoy pasan, y cada lanzador que falte sigue pasando.
- **O dejarlo dicho**: el guard cuida la llamada directa, y lo demás lo sostiene la regla.

Lo que frena de más es aparte y más barato: aceptar `sudo` y `time` delante del comando declarado, y el
valor de un tope pegado o entrecomillado.

## Por qué hacerlo

Un freno que se esquiva escribiendo menos no cuida lo que dice cuidar, y además enseña la forma que lo
esquiva.

## Riesgos y regresiones

- **El primer camino frena comandos que hoy corren**, en toda instancia que lance pruebas dentro de un
  contenedor sin `sh -c`. Hay que contar cuántas lo hacen antes de elegirlo.
- **Cada forma nueva de leer un comando es una forma de errar**: el 313 necesitó dos revisiones para una
  sola.

## Qué habría que probar

- Las seis formas de arriba con el guard instalado, antes y después.
- Que nada de lo que el 313 dejó pasando cambie.

## Recomendación

**Decidir antes de hacer.** Propongo el segundo camino más el arreglo barato de lo que frena de más, salvo
que una instancia real muestre la forma directa tirando una máquina.

## Relacionados

- 313, 291, 286 y 232.
