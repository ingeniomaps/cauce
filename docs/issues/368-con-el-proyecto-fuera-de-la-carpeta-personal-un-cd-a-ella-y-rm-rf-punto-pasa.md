---
caso: 368
titulo: con el proyecto fuera de la carpeta personal, un cd a ella y rm -rf punto pasa
estado: resuelto
resuelto-en: 0.106.1
prioridad: alta
version-detectada: 0.106.0
---

# 368 — `cd ~ && rm -rf .` pasa el guard destructivo cuando el proyecto no vive dentro de la carpeta personal: sólo se cuidaba por contener al proyecto

**🟢 resuelto en 0.106.1** · detectado en 0.106.0 · prioridad **alta**.

**Prioridad alta**: es la clase que gobierna R23 y no se recupera. No es frecuente —hace falta que el
proyecto esté fuera de la carpeta personal, en `/srv`, `/opt`, un disco aparte o un contenedor—, y por eso
no se había visto: en una máquina de escritorio el proyecto casi siempre está adentro.

## Resumen

`destructive` frena un `rm -r` que se lleva el directorio actual, la raíz ops o una raíz declarada,
nombrados enteros o por un ancestro. La carpeta personal no estaba en esa lista. Quedaba cuidada de rebote:
si el proyecto vive adentro de ella, borrarla es borrar un ancestro del proyecto. Con el proyecto afuera, no
la cuidaba nada. La regla que mira cómo está escrito el destino —`rm -rf ~`— no lo ve, porque acá el
destino es `.`.

## Reproducción

Con la instancia en una carpeta que no cuelga de la carpeta personal:

```bash
cd ~ && rm -rf .
```

## Síntoma

Preguntándole al guard, con la instancia en el temporal del sistema, el 2026-10-10:

```
pasa    cd ~ && rm -rf .
pasa    cd ~ && rm -rf *
pasa    cd <la carpeta personal, escrita entera> && rm -rf .
pasa    rm -rf /home            el ancestro de la carpeta personal
FRENA   rm -rf ~                la regla que mira cómo está escrito
```

## Causa raíz

- `engine/hooks/removal.js`, `removesTheTree` — `kept` es el directorio actual, la raíz ops y las raíces
  declaradas. `os.homedir()` no está.

## Fix propuesto

Agregar la carpeta personal a lo que se cuida, por nombre.

## Valor

Cierra un borrado sin vuelta atrás en las máquinas donde el proyecto no está en la carpeta personal, que son
justo las que menos se miran: servidores y contenedores.

## Qué podría salir mal

1. **Frenar el borrado de una carpeta de adentro**: una caché, un proyecto viejo. La regla compara el destino
   contra la carpeta entera o un ancestro, no contra lo que tiene adentro.
2. **Cambiar algo más de `destructive`**, que en esta misma versión se rompió tres veces por tocar lo que
   comparte.

## Cierre

**Resuelto en 0.106.1** con el fix propuesto: una entrada más en lo que se cuida, y su nombre en el mensaje.

### El recorrido de lo que este caso enumeró

- **Fix, la carpeta personal por nombre — se hizo.**
- **Qué podría salir mal 1, una carpeta de adentro — no se frena**: `cd ~ && rm -rf proyecto-viejo`,
  `cd ~/Documentos && rm -rf .` y `rm -rf ~/.cache/algo` pasan, y está probado.
- **2, que cambie algo más — medido contra la versión anterior.** 2.300 combinaciones de formas de `cd` y
  de `rm`, con la instancia fuera de la carpeta personal: 2.224 con el mismo veredicto y 76 que cambian,
  **todas de «pasa» a «frena» y todas sobre la carpeta personal o un ancestro suyo** —las formas de `cd ~`,
  `cd /home && rm -rf <usuario>`, `cd / && rm -rf home`, `rm -rf /home`—. Ninguna de «frena» a «pasa». Y
  sobre los 2.985 comandos con `rm` de las sesiones reales de cinco proyectos: 63 que frenaba y frena,
  ninguno nuevo, ninguno menos. Ahí no aparece ninguno nuevo porque esos proyectos están dentro de la
  carpeta personal, donde ya se frenaba.

### Qué se corrió

- **El síntoma, después del cambio**: las cuatro que pasaban frenan con «'rm -r' sobre … se lleva la carpeta
  personal».
- Rojo previo: `test/hooks/destructive-home.test.js`, antes del cambio.
- Dos mutaciones en rojo, en una copia fuera del árbol: sin la carpeta personal en la lista, y cuidando
  también lo de adentro.
- La comparación de arriba, dentro de una jaula de sólo lectura. Ningún comando se ejecutó.

### Lo que encontró la revisión independiente (2026-10-10)

Una cosa, que no se arregló y se deja dicha. El resolvedor de este guard parte las palabras de un comando
sin mirar las comillas —es anterior a este caso, y así ve lo que cuida—, y con la carpeta personal en la
lista esa lectura la alcanza: parado en ella, `rm -rf "a . b"` o `rm -rf foo/..` frenan como si se la
llevaran entera. Son las mismas formas que ya frenaban sobre el directorio actual, nadie las escribe, y la
salida es nombrar la carpeta sin esos tramos. Cambiar cómo ese resolvedor lee es justo lo que este guard no
aguantó tres veces en esta versión.

## Contexto de descubrimiento

Lo encontró una revisión del caso 365, comparando el guard destructivo contra su versión anterior con la
instancia en el temporal. En ese momento se anotó y no se tocó: ese caso había roto este guard tres veces
por arreglarle cosas de paso.

## Relacionados

- [337](./337-rm-rf-punto-y-cd-x-rm-rf-punto-pasan-el-guard-destructivo.md) — el mismo borrado sobre el
  directorio actual, y de donde sale la regla que éste amplía.
- [365](./365-el-guard-de-shell-no-ve-un-borrado-fuera-de-las-raices.md) — donde apareció.
