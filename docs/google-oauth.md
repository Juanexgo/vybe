# Activar Google en VYBE

El diseño nuevo y el acceso por correo funcionan sin Google. La integración Google está implementada, pero el botón solo aparece cuando se configuran credenciales reales. Las pruebas automatizadas verifican PKCE, state, nonce, rechazo de callbacks falsos, creación de perfiles y protección de cuentas existentes; falta probar el recorrido real con tu cuenta Google.

1. En [Google Cloud Console](https://console.cloud.google.com/auth/overview), crea o elige un proyecto. Configura Google Auth Platform con el nombre VYBE y tus correos de soporte y contacto. Para pruebas, usa audiencia externa y agrega tus usuarios de prueba cuando corresponda.
2. Crea un cliente OAuth de tipo **Aplicación web**. Registra exactamente esta URI de redirección:

```
https://vybe-v1-pruebas-qjvq44j7rjx2x79w-3000.app.github.dev/api/login/oauth2/code/google
```

3. Abre la terminal del [Codespace](https://vybe-v1-pruebas-qjvq44j7rjx2x79w.github.dev) y ejecuta:

```bash
cd /workspaces/vybe
bash infrastructure/codespaces/configure-google.sh
```

Introduce el client ID y el client secret cuando el script los solicite. El secreto se oculta mientras lo escribes. No los pegues en este chat. Se guardan en `.env.oauth`, con permisos 600, excluido de Git y de las imágenes Docker. También puedes usar secretos de Codespaces con esos nombres; el script los toma del entorno y guarda la configuración para que sobreviva a los reinicios de contenedores.

4. Espera a que la API arranque y abre [Iniciar sesión](https://vybe-v1-pruebas-qjvq44j7rjx2x79w-3000.app.github.dev/login). El botón **Continue with Google** aparecerá. Prueba entrar, elegir un perfil, cerrar sesión y volver a entrar.

Si ese correo ya tiene una cuenta VYBE creada con contraseña, usa esa contraseña: no se vinculan automáticamente cuentas preexistentes. Esta versión crea cuentas Google nuevas y permite volver a ellas; la vinculación explícita desde una cuenta existente queda fuera de este cambio.

El callback debe cambiar en Google si cambia el nombre del Codespace o el dominio. El alojamiento conserva sus límites de prueba: suspensión por inactividad, disponibilidad temporal y correos capturados en Mailpit.

Referencia: [Documentación oficial de Google para aplicaciones web](https://developers.google.com/identity/protocols/oauth2/web-server) y [configuración de Spring Security](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/advanced.html).
