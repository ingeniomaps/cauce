---
caso: 312
titulo: una comilla escapada deja a la vista lo que el comando solo busca
estado: resuelto
resuelto-en: 0.103.6
prioridad: media
version-detectada: 0.103.5
---

# 312 — `grep -n "\"test\|jest" package.json` se frena como si ejecutara `jest`

**🟢 resuelto en 0.103.6** · detectado en 0.103.5 · prioridad **media**.

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

## Cierre

**Resuelto en 0.103.6**, y distinto de lo que este caso proponía.

### El recorrido de lo que este caso enumeró

- **La comilla escapada dentro de comillas dobles — se hizo.** `"\"test\|jest"` es una sola cadena.
- **Las comillas simples no cambian — se cumplió.**
- **«La barra invertida fuera de comillas no se toca» — se hizo distinto, y es lo que este caso tenía mal.**
  Arreglar sólo la mitad de adentro era una regresión hacia el lado que deja pasar. En
  `echo \"a\" ; rm -rf / ; echo "b"` la cadena pasaba a empezar en una comilla que no abre nada y escondía
  el `rm`. Las dos mitades van juntas: fuera de comillas, lo que sigue a una barra es literal y no abre cadena.
- **Una comilla sin cerrar se lee como antes — se cumplió**, con prueba.
- **Los dos sentidos con el guard instalado — se hizo**, abajo.
- **Cada guard que usa la lectura, con un comando propio — se hizo**: la revisión pasó 82 comandos corrientes
  por nueve guards.
- **Mutaciones y revisión independiente — se hicieron.**

### Lo que este caso encontró y no preveía

- **La lectura anterior ya dejaba pasar.** `echo \"; rm -rf / ; echo \"` pasaba el guard: tomaba por cadena lo
  que hay entre dos comillas escapadas sueltas. No lo había reportado nadie.
- **Un comentario con una comilla suelta escondía el renglón siguiente.** `echo a # don't`, y abajo un
  `rm -rf /`, pasaba. Lo encontró la revisión, que además mostró una forma rebuscada en que el arreglo lo
  empeoraba. Ahora un comentario no abre cadenas y queda a la vista entero.
- **Lo que la lectura todavía no conoce salió como caso 328**: `$'…'`, las comillas dentro de `$(…)` dentro
  de comillas dobles, las comillas dentro de backticks, y un shell nombrado por su ruta después de una tubería.
  Son anteriores a este cambio y este cambio no las mueve.

### Qué se corrió

- **La lectura contra bash de verdad.** Se arman comandos con prefijos y sufijos de comillas, barras,
  comentarios y saltos de línea alrededor de `;echo X7;`, se le pregunta a bash si ejecutó el `echo`, y se
  compara con lo que la lectura deja a la vista. No se ejecuta nada más que ese `echo`.

  | | Antes | Después |
  |---|---|---|
  | Comillas y barras (24.336 comandos): bash lo ejecuta y la lectura lo esconde | 165 | 0 |
  | Con comentarios y saltos de línea: bash lo ejecuta y la lectura lo esconde | 630 | 0 |
  | Comillas y barras: era dato y quedaba a la vista | 1.096 | 994 |

  Con comentarios, lo que queda a la vista sin ejecutarse sube: de 2.391 comandos que cambian, 2.323 tienen
  el `echo` dentro de un comentario. Es el precio elegido: un comentario que cita entre comillas un comando
  que un guard frena, ahora frena. Sacar el comentario en vez de dejarlo escondería lo que sigue a un `#`
  que no es comentario, como en `${x/ #/y}`.
- **La revisión, con dos alfabetos más anchos** (194.712 comandos cada uno, con `$`, backticks, paréntesis y
  heredocs): escondidos por la lectura, 82 → 9 y 312 → 0, sin ninguna regresión. Los 9 son del caso 328.
- **El guard instalado, en un banco, con 41 comandos antes y después.** Cambian los esperados y ninguno más:

  ```
  grep -n "\"test\|jest" package.json            FRENA -> pasa
  echo "a\" > <afuera>/zz \"b"                    FRENA -> pasa    es una cadena, no una redirección
  echo "a \" ; rm -rf / ; \" b"                   FRENA -> pasa    es una cadena
  echo \"; rm -rf / ; echo \"                     pasa  -> FRENA
  echo a # don't ⏎ rm -rf / ⏎ echo 'listo'        pasa  -> FRENA
  ```

  Siguen frenando, entre otros: `echo "a\"b"; rm -rf /`, `echo \"a\" ; rm -rf / ; echo "b"`,
  `echo "x\"y" > <afuera>/zz`, `cat "a\"b" .env`, `bash -c "echo \"hi\"; npx jest"` y una cadena sin cerrar
  seguida de `npx jest`.
- **Las pruebas nuevas en rojo con el motor anterior**, y **once mutaciones en rojo en una copia**: cada
  mitad de la lectura, el salto de línea escapado, la barra doble, la comilla simple escapada afuera, el
  prefijo que decide quién lee una cadena, y las tres formas de leer mal un comentario. La revisión encontró
  tres que sobrevivían; cada una tiene ahora su aserción.
- **Rendimiento**, medido por la revisión: sin retroceso catastrófico, entre 0,6 y 2,4 ms sobre 50 a 100 KB
  adversos.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: una instancia real.
