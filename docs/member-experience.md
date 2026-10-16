# VYBE — navegación y experiencia de usuario

Actualización del 16 de octubre de 2026.

- Menú de perfil junto al buscador: avatar del perfil activo, cambio de perfil, gestión de perfiles, colecciones, continuar viendo, biblioteca, listas compartidas, preferencias, salas, historial, actividad, cuenta, ayuda y cierre de sesión. La administración aparece únicamente para los roles autorizados.
- Búsqueda rápida en un diálogo: resultados reales del catálogo, acceso al detalle, atajo Cmd/Ctrl+K, cierre con Escape, foco del teclado y acceso a búsqueda por ánimo.
- Inicio personal: saludo por perfil, atajos a descubrimiento y funciones sociales, y fila para retomar videos con el progreso guardado.
- Navegación inferior en móvil, cabecera persistente, página de cuenta renovada y ayuda sobre funciones existentes.
- No se agregaron botones ficticios de facturación, notificaciones ni servicios inexistentes.

## Validación

Build de producción correcto. Las 7 pruebas unitarias del frontend pasaron. La suite de nube pasó 14 de 15 recorridos; se corrigió la etiqueta accesible del avatar que impedía seleccionar el perfil en la prueba restante. La repetición focalizada pasó 2 de 2: búsqueda/teclado/móvil y menú/cambio de perfil/cuenta/cierre de sesión. La revisión visual incluyó escritorio y 390 px de ancho.

## Pendiente externo

Google OAuth sigue pendiente de configurar las credenciales del propietario y probar una autorización real. Ver VYBE-Google.md. El sitio conserva las limitaciones de disponibilidad de GitHub Codespaces; esta mejora no cambia el alojamiento.

[Abrir VYBE](https://vybe-v1-pruebas-qjvq44j7rjx2x79w-3000.app.github.dev/explore)
