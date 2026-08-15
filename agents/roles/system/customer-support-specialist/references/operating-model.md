# Modelo operativo de Customer Support

## Contrato de caso

```markdown
Canal, fecha y zona horaria:
Cliente/cuenta verificados:
Objetivo e impacto:
Producto, versión y entorno:
Inicio, frecuencia y alcance:
Pasos mínimos:
Esperado y actual:
Errores y evidencia redactada:
Cambios y acciones previas:
Clasificación y severidad:
Hipótesis y confianza:
Diagnóstico/workaround/resolución:
Escalación, owner y SLA aplicable:
Próxima actualización:
```

## Triage

Priorizar seguridad y riesgo humano primero; después indisponibilidad, pérdida/corrupción de datos, alcance, ausencia de workaround y tiempo. Un cliente molesto merece atención clara, pero el tono no sustituye impacto. Separar solicitud, pregunta, problema de uso, acceso, facturación, defecto, incidente, queja y feedback para activar el proceso correcto.

## Troubleshooting seguro

1. Confirmar estado y comportamiento esperado para versión/rol.
2. Reducir variables y reproducir en entorno seguro cuando sea posible.
3. Cambiar una condición a la vez y registrar resultado.
4. Preferir observación y pasos reversibles antes de reset, reinstalación o borrado.
5. Detenerse si aparece riesgo de datos, seguridad, facturación o producción.
6. Confirmar recuperación del objetivo y efectos secundarios.

No atribuir causa por coincidencia temporal. Si sólo existe workaround, registrar limitaciones, reversión y seguimiento del defecto.

## Escalación

```markdown
Resumen e impacto:
Severidad y fundamento:
Versión/entorno/alcance:
Reproducción mínima:
Evidencia segura:
Hipótesis probadas y resultados:
Workaround y limitaciones:
Cliente bloqueado hasta:
Owner solicitado:
Próxima comunicación comprometida:
```

Escalar con señal útil, no sólo “urgente”. Mantener ownership de la comunicación aunque el diagnóstico pase a otro equipo, salvo handoff explícito.

## Comunicación

- Apertura: reconocer impacto y confirmar comprensión.
- Estado: decir qué se sabe, qué no y qué se está verificando.
- Acción: ofrecer pasos claros, seguros y proporcionales.
- Expectativa: usar sólo SLA/ETA aprobados y próxima actualización concreta.
- Cierre: confirmar resultado, resumir y mostrar ruta si reaparece.

Para incidentes, usar la fuente y cadencia autorizadas. No especular causa, alcance o seguridad. Para quejas, explicar proceso y opciones de revisión sin ponerse a la defensiva.

## Conocimiento

```markdown
Título buscable por síntoma/tarea:
Aplica a versiones/roles:
Síntomas y errores:
Causa confirmada o contexto:
Pasos y resultado esperado:
Advertencias y reversión:
Escalación:
Fuentes y verificación:
Owner y fecha de revisión:
```

## Control de calidad

- ¿Objetivo, impacto, identidad y autoridad son claros?
- ¿Versión, entorno, pasos y evidencia permiten reproducir?
- ¿Se distinguen síntoma, hipótesis, causa y resolución?
- ¿Los pasos minimizan riesgo y tienen resultado/reversión?
- ¿Severidad y escalación reflejan impacto observable?
- ¿La respuesta evita datos sensibles, culpa y promesas inventadas?
- ¿La recuperación se verificó desde el objetivo del cliente?
- ¿El aprendizaje reusable tiene owner, alcance y revisión?

## Fundamento externo

Modelo sintetizado con fuentes revisadas en agosto de 2026:

- [ISO 10002:2018](https://www.iso.org/standard/71580.html): accesibilidad, objetividad, confidencialidad, responsabilidad y mejora en manejo de quejas.
- [ISO 18295-1:2017](https://www.iso.org/standard/64739.html): requisitos para centros de contacto orientados a experiencia consistente y medición.
- [ITIL 4 Incident Management](https://www.peoplecert.org/browse-certifications/it-governance-and-service-management/ITIL-1): restauración del servicio, coordinación y prácticas de gestión; verificar materiales licenciados aplicables.
- [W3C Writing for Web Accessibility](https://www.w3.org/WAI/tips/writing/): instrucciones, headings, enlaces y mensajes comprensibles.

Verificar siempre producto, políticas, SLA, contratos y requisitos sectoriales reales de cada empresa.
