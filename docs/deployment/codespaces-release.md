# VYBE V1 — nube funcional de pruebas

Aplicación: https://vybe-v1-pruebas-qjvq44j7rjx2x79w-3000.app.github.dev
Entorno: https://vybe-v1-pruebas-qjvq44j7rjx2x79w.github.dev
Correo privado de pruebas: https://vybe-v1-pruebas-qjvq44j7rjx2x79w-8025.app.github.dev
Repositorio privado: https://github.com/Juanexgo/vybe

## Verificación
11 de 11 recorridos Chrome pasaron contra la URL HTTPS pública en 1.4 minutos: registro/verificación/login/perfiles/logout, catálogo/filtros/búsqueda/móvil, reproducción real HLS/audio/subtítulos/progreso, episodios, salas con dos navegadores/chat/sincronización/reconexión/permisos, listas compartidas, preferencias/analítica y colecciones.

También pasaron la carga y transcodificación remota de dos videos originales, segmentos HLS reales de 461352 bytes, progreso y rechazo de acceso anónimo. Modelo IA listo; outbox sin pendientes al comprobarlo. Imágenes Docker construidas en el servidor y servicios activos. Se corrigieron permisos del caché IA, direccionamiento del almacenamiento y el origen WebSocket que Codespaces reescribe a localhost. La excepción del origen se limita a la configuración de Codespaces y sigue exigiendo sesión/permisos.

## Cómo probar
Abre la aplicación y pulsa Continue si GitHub presenta su aviso. Registra una cuenta de prueba; consulta el mensaje en el correo privado, que requiere tu sesión GitHub, y verifica tu cuenta. Mailpit captura los mensajes: no envía correo externo.

Busca VYBE Signal Study o VYBE Test Series para reproducir videos originales de prueba. Los títulos editoriales contienen metadatos e ilustraciones; no se subieron sus películas completas. Prueba perfiles, listas y salas con dos navegadores.

Para administrar, registra y verifica tu propia cuenta y ejecuta en la terminal integrada: bash infrastructure/scripts/grant-admin.sh TU_CORREO_VERIFICADO. No hay administrador público con contraseña fija.

## Suspensión y datos
Máquina de 2 CPU y 8 GB RAM. Se suspende tras 15 minutos de inactividad. Abre el enlace del entorno para reactivarlo. Si es necesario ejecuta bash infrastructure/codespaces/resume.sh desde su terminal. Después de reactivar, si el enlace compartido pide sesión GitHub, cambia únicamente el puerto 3000 a Public en Ports. Conserva 8025 como Private.

Retención configurada: eliminación automática del Codespace después de 24 horas detenido. El repositorio se conserva; los usuarios y videos del entorno pueden perderse. Exporta lo necesario antes. El almacenamiento consume cuota incluso detenido; mantén bloqueado el gasto pagado.

## Pendiente para producción
Este es un entorno de desarrollo funcional, no hosting permanente. Faltan correo SMTP externo, backups/restauración y validación de capacidad para muchos usuarios. S3rver es almacenamiento de pruebas. Los servicios de monitoreo arrancaron, pero no se verificó su ingesta completa. V2/iOS no iniciada.
