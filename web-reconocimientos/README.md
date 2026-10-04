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
| Proveedores de alojamiento, correo y formulario, con su país y garantías, y el plazo de conservación de los registros de conexión | `privacidad.html` (si no usas un servicio de formularios, borra esa línea de la lista) |
| Fechas de «Última actualización» | Páginas legales y `sitemap.xml` (`lastmod`), cada vez que cambies su contenido |
| Marca | Comprueba que «Seniar» esté libre en la OEPM y la EUIPO antes de registrarla |

Busca y reemplaza en toda la carpeta para no dejarte ninguno. Tras publicar, comprueba que el alojamiento o su CDN no añaden cookies, píxeles de seguimiento ni analítica: la política de cookies dice que no hay ninguna.

## Protección de datos al prestar el servicio

La web promete que tratas los datos de los trabajadores de tus clientes como encargado del tratamiento. Antes de empezar con el primer cliente:

- Firma con cada cliente un contrato de encargo del tratamiento (artículo 28 del RGPD) que cubra datos identificativos y de contacto, disponibilidad, citas y la conclusión de aptitud.
- Lleva el registro de actividades de tratamiento como encargado (artículo 30.2 del RGPD).
- Aplica medidas de seguridad acordes con un dato de salud (artículo 32 del RGPD): acceso restringido, cifrado y doble factor en el correo y en el Excel compartido.
- Valora con un asesor si necesitas una evaluación de impacto o un delegado de protección de datos según tu volumen.
- Si algún proveedor (correo, almacenamiento) está fuera del Espacio Económico Europeo, comprueba que ofrece garantías válidas para la transferencia y guarda una copia: la política de privacidad ofrece enviarla.

## Formulario de contacto

Sin configurar, el formulario valida los datos y prepara un correo con la solicitud para que el visitante lo envíe desde su programa de correo (o lo copie). Sin JavaScript, abre el programa de correo con los datos.

Para recibir las solicitudes directamente, pon la URL de un servicio de formularios en el atributo `data-endpoint` del formulario (`index.html`, `id="form-contacto"`) y cambia su `action` por esa misma URL. La web envía un `POST` con JSON: `nombre`, `empresa`, `trabajadores`, `email`, `telefono`, `servicio_prevencion`, `mensaje`, `_gotcha` (campo trampa para bots: descarta las solicitudes que lo traigan relleno), `origen` y `fecha`. Funciona, por ejemplo, con:

- un webhook de Make o Zapier que te reenvíe el correo;
- Formspree (`https://formspree.io/f/XXXX`).

Añade el dominio del servicio a `connect-src` y `form-action` en `_headers`.

## Cabeceras del alojamiento

`_headers` (formato de Netlify y Cloudflare Pages) define la caché de los recursos inmutables, la política de seguridad de contenidos y otras cabeceras. Activa también la compresión Brotli o Gzip y redirige `http`, la versión sin `www` y `/index.html` a la URL canónica.

Cloudflare Pages redirige las URL acabadas en `.html` a su versión sin extensión (`/privacidad.html` → `/privacidad`). Funciona sin tocar nada; si quieres evitar ese salto, cambia los enlaces y los `canonical` de las páginas legales a la versión sin extensión.

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

- Las fuentes son subconjuntos en español de Mona Sans y Geist Mono (licencia SIL Open Font License 1.1). Mona Sans tiene «Mona» como nombre reservado, así que su versión modificada se llama Seniar Sans; Geist Mono no tiene nombres reservados y se ha renombrado como Seniar Mono por coherencia. Se conservan los avisos de copyright y licencia originales dentro de cada archivo. El cero de las cifras tabulares de Seniar Sans se ha cambiado por el cero normal, sin barra.
- La web respeta la preferencia «reducir movimiento» del sistema: sin animaciones y con todo el contenido visible.
- Las animaciones ligadas al scroll usan CSS (`animation-timeline`) donde el navegador lo admite y JavaScript en el resto.
