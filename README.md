# StageDSP (GitHub Pages)

Versión 100 % estática de StageDSP: sin Node.js, sin Socket.IO y sin servicios externos.

## Publicar

1. Sube el contenido de esta carpeta a un repositorio de GitHub.
2. En **Settings → Pages**, elige la rama y la carpeta raíz (`/`).
3. Abre la URL publicada (la cabina es `index.html`).

## Uso

- Abre la cabina y pulsa **Abrir pantalla escenario**; la ventana de escenario se sincroniza con la cabina mediante `BroadcastChannel`.
- Cabina y escenario deben estar en el mismo navegador y origen. La pestaña de cabina debe permanecer abierta: ella ejecuta el temporizador y el mensaje.
- **Transmitir a pantalla** usa la Presentation API (Chrome + Chromecast); en GitHub Pages hay HTTPS, así que es posible.
- El micrófono requiere HTTPS (incluido en GitHub Pages) y permiso del navegador.

## Archivos

- `local-bus.js`: sustituye al servidor y a socket.io.
- `index.html` / `admin.js`: cabina. `stage.html` / `stage.js`: pantalla de escenario.
