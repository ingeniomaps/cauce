---
caso: 312
titulo: una comilla escapada deja a la vista lo que el comando solo busca
estado: abierto
prioridad: media
version-detectada: 0.103.5
---

# 312 — `grep -n "\"test\|jest" package.json` se frena como si ejecutara `jest`

**🔴 abierto** · detectado en 0.103.5 · prioridad **media**.

**Prioridad media**: es un freno de más que se repite en cada corrida de una instancia real, sobre un comando que sólo lee.

## Resumen

Los guards leen un comando sacando primero lo que va entre comillas, porque ahí hay dato y no orden. La
expresión que lo hace no conoce la comilla escapada: en `"\"test\|jest"` corta en la segunda comilla y deja
el resto a la vista.

## Reproducción

Con el guard real, en un proyecto con `boundedCommands` declarado:

```
grep -n "\"test\|jest" package.json   → FRENA: 'jest' sin cota de workers lanza tantos procesos como núcleos …
grep -n "test\|jest" package.json      → PASA
```

Y lo que el guard termina leyendo del primero: `grep -n ␀test\|jest" package.json`.

## Causa raíz

`engine/hooks/input.js:166`, `unquoted`: `/'[^']*'|"[^"]*"/g`. Dentro de comillas dobles, `\"` es una comilla
que no cierra. El caso 286 arregló otra forma del mismo freno —el `grep` sin comillas escapadas— y no ésta.

## Fix propuesto

- Que la cadena entre comillas dobles admita el carácter escapado: `"(?:[^"\\]|\\.)*"`.
- Las comillas simples no cambian: en shell no admiten escape.

## Por qué hacerlo

Es el freno que más se repite en la instancia que lo reportó: tres veces en dos corridas, siempre sobre un
`grep`. Cada uno cuesta una vuelta de un agente completo, y un guard que frena lo que sólo lee termina
apagado.

## Riesgos y regresiones

**Es el cambio más delicado de la tanda.** `unquoted` lo usan todos los guards que leen comandos, así que
mover dónde termina una cadena cambia qué ven todos.

- **Hacia el lado que deja pasar**: si la lectura nueva da por cadena algo que el shell ejecuta, un comando
  destructivo queda escondido. Con la expresión de hoy pasa lo contrario —expone de más—, que es el lado
  seguro. El arreglo es más fiel al shell, y hay que demostrarlo, no suponerlo.
- **La barra invertida fuera de comillas** no entra en este cambio y no se toca.
- **Una comilla sin cerrar** tiene que seguir leyéndose como hoy.

## Qué habría que probar

- Los dos sentidos, con el guard instalado: el `grep` real pasa, y un `rm -rf` puesto después de una cadena
  con comilla escapada se sigue frenando.
- Cada guard que usa `unquoted`, con un comando propio que lleve `\"`.
- Mutaciones en una copia, y una revisión independiente del diff antes de cerrar.

## Recomendación

**Hacerlo**, con esa disciplina. Es de los pocos que una empresa siente todos los días.

## Relacionados

- 286 y 259 — el mismo freno por otras formas.
