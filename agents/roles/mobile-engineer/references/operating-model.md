# Modelo operativo de Mobile Engineering

## Contrato de funcionalidad móvil

```markdown
Objetivo y aceptación:
Plataformas y versiones:
Pantallas y navegación:
Estados de UI:
Lifecycle y restauración:
Red, caché y offline:
Persistencia y sincronización:
Permisos y APIs del dispositivo:
Privacidad y seguridad:
Accesibilidad y localización:
Rendimiento y recursos:
Telemetría:
Pruebas y matriz de dispositivos:
Release y recuperación:
```

## Lifecycle, conectividad y datos

- Preservar trabajo importante al pasar a background o terminar el proceso sin persistir secretos innecesarios.
- Asumir latencia, ausencia de red, respuestas tardías y cambios de conectividad.
- Definir fuente de verdad, caducidad de caché, cola de operaciones y política de conflictos.
- Hacer operaciones reintentables idempotentes o deduplicables; exponer estado pendiente y recuperación.
- Cancelar trabajo que perdió relevancia y evitar escrituras después de que una pantalla dejó de existir.

## Permisos, enlaces y notificaciones

Pedir permisos en contexto y permitir una ruta útil cuando se rechacen. Comprobar autorización en cada uso porque puede revocarse. Validar esquema, host, ruta y parámetros de enlaces profundos; después comprobar sesión y autorización. Mantener las notificaciones sin secretos y exigir verificación dentro de la aplicación antes de ejecutar acciones sensibles.

## Seguridad y privacidad

- Usar almacenamiento seguro para credenciales y evitar secretos embebidos en el paquete.
- Cifrar transporte con APIs mantenidas y no desactivar validación TLS.
- Minimizar datos locales, logs, clipboard, screenshots y telemetría según riesgo y política.
- Considerar dispositivo comprometido como reducción de confianza, no como autorización para inventar controles infalibles.
- Mantener la autorización y las decisiones críticas en servidor.

## Pruebas

- Unitarias para estado, dominio, serialización y resolución de conflictos.
- Integración para red, persistencia, autenticación y APIs de plataforma.
- UI para recorridos críticos, accesibilidad y navegación.
- Recorridos con red lenta/offline, permisos rechazados/revocados, background, terminación y restauración.
- Matriz proporcional a versiones soportadas, tamaños, orientaciones y hardware relevante; distinguir simulador de dispositivo real.

## Control de calidad

- ¿Los estados de carga, vacío, error, offline y éxito son recuperables?
- ¿La app conserva estado correcto bajo background, terminación y reintentos?
- ¿Permisos, enlaces y notificaciones fallan de forma segura?
- ¿Datos y credenciales se minimizan y almacenan correctamente?
- ¿Lector de pantalla, texto ampliado, foco y objetivos táctiles funcionan?
- ¿El trabajo evita bloqueos, consumo excesivo y fugas de recursos?
- ¿Las pruebas cubren plataformas, versiones y condiciones de fallo relevantes?
- ¿La entrega separa build técnico de firma y publicación autorizadas?

## Fundamento externo

Modelo sintetizado con fuentes revisadas en agosto de 2026:

- [Android Core app quality](https://developer.android.com/docs/quality-guidelines/core-app-quality): calidad funcional, experiencia, rendimiento, seguridad y compatibilidad.
- [Apple Human Interface Guidelines — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility): diseño accesible y adaptación a preferencias del sistema.
- [OWASP MASVS](https://mas.owasp.org/MASVS/): controles verificables para almacenamiento, criptografía, autenticación, red, plataforma, código, resiliencia y privacidad.
- [W3C Mobile Accessibility](https://www.w3.org/WAI/standards-guidelines/mobile/): aplicación de WCAG y otras guías de accesibilidad al contexto móvil.

Verificar siempre documentación oficial del framework, SDK y versiones reales de cada empresa.
