# Web · Vigente (gestión externalizada de reconocimientos médicos)

Web estática (HTML, CSS y JavaScript sin dependencias). Se puede publicar tal cual en Netlify, Vercel, Cloudflare Pages o GitHub Pages.

## Ver la web en local

```bash
cd web-reconocimientos
python3 -m http.server 8080
# abre http://localhost:8080
```

## Antes de publicar: datos que tienes que cambiar

| Qué | Dónde |
| --- | --- |
| Nombre de marca «Vigente» (propuesta provisional) | `index.html`, páginas legales, `404.html`, `site.webmanifest`, `assets/img/*` |
| Email de contacto `hola@vigente.es` | `index.html`, `assets/js/main.js` (`CONFIG.email`), páginas legales |
| Dominio `https://www.vigente.es` | `index.html` (canonical, Open Graph, JSON-LD), páginas legales (canonical), `robots.txt`, `sitemap.xml` |
| Datos del titular (nombre o razón social, NIF, domicilio) | `aviso-legal.html` y `privacidad.html` (marcados en amarillo) |
| Proveedores de alojamiento y correo | `privacidad.html` |

Busca y reemplaza en toda la carpeta para no dejarte ninguno.

## Formulario de contacto

Sin configurar, el formulario valida los datos y prepara un correo con la solicitud para que el visitante lo envíe desde su programa de correo (o lo copie).

Para recibir las solicitudes directamente, pon la URL de un servicio de formularios en el atributo `data-endpoint` del formulario (`index.html`, `id="form-contacto"`). La web envía un `POST` con JSON (`nombre`, `empresa`, `trabajadores`, `email`, `telefono`, `servicio_prevencion`, `mensaje`, `origen`, `fecha`). Funciona con:

- Un webhook de Make o Zapier que te reenvíe el correo.
- Formspree (`https://formspree.io/f/XXXX`).

## Estructura

```
index.html            Página principal
aviso-legal.html      Aviso legal (LSSI-CE)
privacidad.html       Política de privacidad (RGPD y LOPDGDD)
cookies.html          Política de cookies (la web no usa cookies)
404.html              Página de error
assets/css/main.css   Estilos y sistema de diseño
assets/js/main.js     Animaciones e interacciones
assets/fonts/         Mona Sans y Geist Mono (licencia SIL OFL, autoalojadas)
assets/img/           Iconos e imagen para redes sociales
robots.txt, sitemap.xml, site.webmanifest
```

## Notas

- Las fuentes se sirven desde la propia web: no hay conexiones a Google ni a terceros, así que no hace falta banner de cookies.
- Respeta la preferencia «reducir movimiento» del sistema: sin animaciones, todo el contenido queda visible.
- `404.html` usa rutas absolutas (`/assets/...`), pensadas para publicar la web en la raíz del dominio.
