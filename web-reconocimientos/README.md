# Web de Seniar · gestión externalizada de reconocimientos médicos

Web estática (HTML, CSS y JavaScript sin dependencias). Se puede publicar tal cual en Netlify, Cloudflare Pages, Vercel o GitHub Pages.

## Ver la web en local

```bash
cd web-reconocimientos
python3 -m http.server 8080
# abre http://localhost:8080
```

## Antes de publicar

| Qué | Dónde |
| --- | --- |
| Email de contacto `hola@seniar.es` (provisional) | `index.html`, `assets/js/main.js` (`CONFIG.email`), páginas legales, `404.html` |
| Dominio `https://www.seniar.es` (provisional) | `index.html` (canonical, Open Graph y JSON-LD), páginas legales (canonical), `robots.txt`, `sitemap.xml` |
| Datos del titular: nombre o razón social, NIF, domicilio, teléfono y datos registrales | `aviso-legal.html`, `privacidad.html` y la primera capa del formulario en `index.html` (marcados en amarillo con la clase `ph`) |
| Proveedores de alojamiento, correo y formulario | `privacidad.html` |
| Marca | Comprueba que «Seniar» esté libre en la OEPM y la EUIPO antes de registrarla |

Busca y reemplaza en toda la carpeta para no dejarte ninguno. Tras publicar, comprueba que el alojamiento o su CDN no añaden cookies ni analítica: la política de cookies dice que no hay ninguna.

## Formulario de contacto

Sin configurar, el formulario valida los datos y prepara un correo con la solicitud para que el visitante lo envíe desde su programa de correo (o lo copie). Sin JavaScript, abre el programa de correo con los datos.

Para recibir las solicitudes directamente, pon la URL de un servicio de formularios en el atributo `data-endpoint` del formulario (`index.html`, `id="form-contacto"`) y cambia su `action` por esa misma URL. La web envía un `POST` con JSON: `nombre`, `empresa`, `trabajadores`, `email`, `telefono`, `servicio_prevencion`, `mensaje`, `_gotcha` (campo trampa para bots: descarta las solicitudes que lo traigan relleno), `origen` y `fecha`. Funciona, por ejemplo, con:

- un webhook de Make o Zapier que te reenvíe el correo;
- Formspree (`https://formspree.io/f/XXXX`).

Añade el dominio del servicio a `connect-src` y `form-action` en `_headers`.

## Cabeceras del alojamiento

`_headers` (formato de Netlify y Cloudflare Pages) define la caché, la política de seguridad de contenidos y otras cabeceras. Activa también la compresión Brotli o Gzip y redirige `http`, la versión sin `www` y `/index.html` a la URL canónica.

Si cambias el script en línea del `<head>` de `index.html`, recalcula su hash para la CSP:

```bash
python3 -c "import hashlib,base64,re;s=open('index.html',encoding='utf-8').read();m=re.search(r'<script>(.*?)</script>',s,re.S).group(1);print(base64.b64encode(hashlib.sha256(m.encode()).digest()).decode())"
```

## Estructura

```
index.html            Página principal
aviso-legal.html      Aviso legal (LSSI-CE)
privacidad.html       Política de privacidad (RGPD y LOPDGDD)
cookies.html          Política de cookies (la web no usa cookies)
404.html              Página de error (rutas absolutas: pensada para la raíz del dominio)
assets/css/main.css   Estilos y sistema de diseño
assets/js/main.js     Animaciones e interacciones
assets/fonts/         Seniar Sans y Seniar Mono (adaptaciones de Mona Sans y Geist Mono, licencia SIL OFL)
assets/img/           Iconos e imagen para redes sociales
favicon.ico, robots.txt, sitemap.xml, site.webmanifest, _headers
```

## Notas

- Las fuentes son subconjuntos en español de Mona Sans y Geist Mono, renombradas como exige su licencia. El cero de las cifras tabulares se ha cambiado por el cero normal, sin barra.
- La web respeta la preferencia «reducir movimiento» del sistema: sin animaciones y con todo el contenido visible.
- Las animaciones ligadas al scroll usan CSS (`animation-timeline`) donde el navegador lo admite y JavaScript en el resto.
