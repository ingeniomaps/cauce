---
caso: 325
titulo: el changelog de 0.103.5 da un costo que una instancia real no ve
estado: resuelto
resuelto-en: 0.103.6
prioridad: baja
version-detectada: 0.103.5
---

# 325 — Dice que el agente de escritura arranca en «unos 60.000» tokens; en una instancia son 76.000 a 86.000

**🟢 resuelto en 0.103.6** · detectado en 0.103.5 · prioridad **baja**.

**Prioridad baja**: es un número publicado que no coincide con lo que una empresa mide.

## Resumen

El changelog de 0.103.5 dice que cada paso de escritura «arranca en unos 60.000 tokens». Se midió en bancos,
que no tienen nada propio. Una instancia real carga además sus instrucciones y sus reglas.

## Lo medido

| | Agente de escritura | Agente completo |
|---|---|---|
| Banco | 54.000 a 65.000 | 72.000 a 77.000 |
| Instancia real | 76.000 a 86.000 | 92.000 a 97.000 |

En la instancia, el agente de escritura ahorra entre un 10 % y un 18 % contra el completo. La sesión que lo
midió lo dijo: «más de lo dicho».

## Causa raíz

El número salió de una sola clase de entorno y se publicó sin decirlo. Es una afirmación de mecanismo sin su
alcance, que es lo que R14 pide evitar.

## Fix propuesto

- Corregir la entrada en la próxima versión: decir el rango de un banco y el de una instancia.
- **Y decidir si el agente de escritura sigue valiendo la pena.** Es un tipo de agente más que mantener y
  que reinstalar, por un 10 % a 18 % en cuatro pasos de una tarea.

## Por qué mantenerlo, y por qué no

- **A favor**: tiene menos herramientas que el agente completo, y ya está probado en real.
- **En contra**: volver esos pasos al agente de siempre es el comportamiento de 0.103.3, sin ningún riesgo, y
  saca una pieza que puede quedar vieja al actualizar.

## Riesgos y regresiones

- Corregir el número no tiene riesgo.
- Sacar el agente es **otra vez cambiar quién escribe**: pide la misma comparación de salidas.

## Recomendación

**Corregir el número, y mantener el agente por ahora.** Reabrir la pregunta si la medición de una instancia
con más reglas propias lo deja sin ahorro.

## Relacionados

- 301 y 302.

## Cierre

**Resuelto en 0.103.6.**

### El recorrido de lo que este caso enumeró

- **Corregir la entrada: decir el rango de un banco y el de una instancia — se hizo, en dos lugares.** La
  entrada de 0.103.5 dice ahora los dos rangos, porque `upgrade` la imprime a quien salta desde una versión
  anterior. Y una línea en 0.103.6 dice que se corrigió, para quien ya la leyó.
- **Decidir si el agente de escritura sigue — se decidió que sí, por ahora.** Ahorra entre un 10 % y un 18 % en
  la instancia medida, tiene menos herramientas que el completo y ya está probado en real. Sacarlo es volver
  a cambiar quién escribe, que es la clase de cambio que originó el caso 301. Se reabre si una instancia con
  más reglas propias lo deja sin ahorro.

### Lo que queda como está, y dicho

- **La nota de la versión 0.103.5 ya publicada** fuera del repositorio no cambia con esto.
- **El rango del agente completo que se cita es el de la instancia**; el de un banco, 72.000 a 77.000, no va.

### Qué se corrió

- **Los números contra la tabla de este caso**, que es donde quedó la medición: 54.000 a 65.000, 76.000 a
  86.000 y 92.000 a 97.000. La revisión rehízo la cuenta del ahorro: 11,3 % a 17,4 %.
- **Las pruebas del repositorio sobre el changelog**, dentro de `npm run ci`: ninguna fija el texto anterior
  ni prohíbe corregir una entrada publicada.
- **Lo que no se corrió**: ninguna medición nueva. El caso corrige cómo se dijo un número ya medido.
