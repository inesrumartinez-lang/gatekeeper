// Batería de pruebas funcionales de Gatekeeper (Playwright + Chromium).
//
// Uso:  npm install playwright   (una vez, donde sea)
//       node tests/test.js       (desde la raíz del repositorio)
// Si Chromium no está en el PATH de Playwright, exporta CHROMIUM_PATH
// con la ruta del ejecutable.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PUERTO = 8931;

let webhookRecibido = null;   // último cuerpo recibido en /hook
const servidor = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/hook'){
    let cuerpo = '';
    req.on('data', c => cuerpo += c);
    req.on('end', () => { webhookRecibido = cuerpo; res.writeHead(200); res.end('ok'); });
    return;
  }
  let f = req.url.split('?')[0];
  if (f === '/') f = '/index.html';
  const ruta = path.join(RAIZ, f);
  if (!fs.existsSync(ruta)) { res.writeHead(404); res.end(); return; }
  const tipos = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.png':'image/png' };
  res.writeHead(200, {'Content-Type': tipos[path.extname(ruta)] || 'application/octet-stream'});
  res.end(fs.readFileSync(ruta));
});

let fallos = 0;
function comprobar(nombre, cond){
  console.log((cond ? '✅' : '❌') + ' ' + nombre);
  if (!cond) fallos++;
}

(async () => {
  await new Promise(r => servidor.listen(PUERTO, r));
  const opciones = {};
  if (process.env.CHROMIUM_PATH) opciones.executablePath = process.env.CHROMIUM_PATH;
  const navegador = await chromium.launch(opciones);
  const pag = await (await navegador.newContext({ viewport: { width: 390, height: 844 } })).newPage();

  const erroresJS = [];
  pag.on('pageerror', e => erroresJS.push(e.message));

  // La ruleta gira ~2s tras confirmar la creación de un bloqueado
  async function pasarRuleta(){
    await pag.waitForSelector('#velo-ruleta.visible', { timeout: 5000 });
    await pag.waitForSelector('#ruleta-continuar', { state: 'visible', timeout: 8000 });
    const texto = await pag.locator('#ruleta-msj').textContent();
    await pag.click('#ruleta-continuar');
    await pag.waitForTimeout(200);
    return texto;
  }

  await pag.goto(`http://localhost:${PUERTO}/`);
  await pag.waitForTimeout(600);

  comprobar('La página carga con su título', await pag.locator('h1').first().textContent() === 'Gatekeeper.');
  comprobar('La pantalla principal es el registro de tiempo', await pag.locator('#vista-tiempo').isVisible());

  // --- Crear el primer prioritario (tesis, azul, sin deslizador) ---
  await pag.click('nav button[data-vista="proyectos"]');
  await pag.click('#fab-nuevo');
  comprobar('Primer proyecto: tipo autoseleccionado a tesis', (await pag.inputValue('#np-tipo')) === 'tesis');
  await pag.fill('#np-nombre', 'Tesis doctoral');
  await pag.fill('#np-dias', '10');
  await pag.click('#np-crear');
  await pag.waitForSelector('#velo-confirmar.visible');
  await pag.click('#conf-ok');
  await pag.waitForTimeout(200);
  comprobar('Prioritario creado', (await pag.locator('.proy-prioritario').count()) === 1);
  const estiloPrio = await pag.getAttribute('.proy-prioritario', 'style');
  comprobar('Los proyectos de tesis van en azules', /#8fb8d8/.test(estiloPrio || ''));
  comprobar('Sin deslizador: la barra se llena con los días trabajados', (await pag.locator('.proy-prioritario input[type=range]').count()) === 0);

  // --- Crear un bloqueado (personal) pasando por la ruleta sin premio ---
  await pag.click('#fab-nuevo');
  comprobar('Tipo personal no puede ser prioritario', !(await pag.locator('#np-campo-prio').isVisible()));
  await pag.fill('#np-nombre', 'Curso de piano');
  await pag.fill('#np-dias', '2');
  await pag.click('#np-crear');
  await pag.waitForSelector('#velo-confirmar.visible');
  comprobar('Peaje de 1h por día estimado', /peaje de 2h/.test(await pag.locator('#conf-msj').textContent()));
  await pag.evaluate(() => { Math.random = () => 0.99; });   // sin premio
  await pag.click('#conf-ok');
  const msjRuleta = await pasarRuleta();
  comprobar('La ruleta sin premio anuncia el peaje', /Peaje de 2h/.test(msjRuleta));
  comprobar('El proyecto nace bloqueado', (await pag.locator('.proy-bloqueado').count()) === 1);

  // --- Bolsa de horas: llenar, ver el contador y canjear (vaciado total) ---
  await pag.click('nav button[data-vista="tiempo"]');
  await pag.fill('#in-horas', '1');
  await pag.click('#btn-manual');
  await pag.waitForTimeout(300);
  comprobar('La sesión de hoy aparece en la lista', (await pag.locator('#lista-sesiones .ses-fila').count()) === 1);
  comprobar('El contador de bolsa marca 1h', (await pag.locator('#bolsa-valor').textContent()) === '1h');
  await pag.fill('#in-horas', '2');
  await pag.click('#btn-manual');
  await pag.waitForTimeout(300);
  await pag.click('nav button[data-vista="panel"]');
  comprobar('Métricas muestra la bolsa y los peajes', /Bolsa disponible/.test(await pag.locator('#bolsa-linea').textContent()));
  comprobar('La puntuación media aparece vacía al principio', /—/.test(await pag.locator('#metricas-extra').textContent()));
  await pag.click('nav button[data-vista="proyectos"]');
  comprobar('Con la bolsa llena aparece Desbloquear', (await pag.locator('[data-accion="desbloquear"]').count()) === 1);
  await pag.click('[data-accion="desbloquear"]');
  await pag.waitForSelector('#velo-confirmar.visible');
  comprobar('El canje avisa de que vaciará TODA la bolsa', /vaciará TODA la bolsa/.test(await pag.locator('#conf-msj').textContent()));
  await pag.click('#conf-ok');
  await pag.waitForTimeout(300);
  comprobar('El proyecto pasa a activo', (await pag.locator('.proy-activo').count()) === 1);
  const gastada = await pag.evaluate(() => JSON.parse(localStorage.getItem('gatekeeper_v1')).bolsaGastada);
  comprobar('El canje vació la bolsa entera (3h de 3h)', gastada === 3);

  // --- Terminar un proyecto pide la puntuación (1-5 estrellas) ---
  await pag.locator('.proy-activo [data-accion="terminar"]').click();
  await pag.waitForSelector('#velo-confirmar.visible');
  await pag.click('#conf-ok');
  await pag.waitForSelector('#velo-valorar.visible', { timeout: 5000 });
  comprobar('Al terminar aparece el modal de puntuación', /Puntúa «Curso de piano»/.test(await pag.locator('#val-titulo').textContent()));
  comprobar('Hay cinco estrellas para elegir', (await pag.locator('#val-estrellas [data-val]').count()) === 5);
  await pag.locator('#val-estrellas [data-val="4"]').click();
  await pag.waitForTimeout(300);
  const valorado = await pag.evaluate(() => JSON.parse(localStorage.getItem('gatekeeper_v1')).proyectos.find(p => p.nombre === 'Curso de piano').valoracion);
  comprobar('La puntuación elegida se guarda (4 de 5)', valorado === 4);

  // --- La ficha del historial muestra la nota y permite cambiarla ---
  await pag.click('nav button[data-vista="historial"]');
  const ficha = await pag.locator('#hist-terminados').textContent();
  comprobar('La ficha muestra la puntuación', /Puntuación/.test(ficha) && /★/.test(ficha));
  await pag.locator('#hist-terminados [data-accion="valorar"]').click();
  await pag.waitForSelector('#velo-valorar.visible');
  await pag.locator('#val-estrellas [data-val="5"]').click();
  await pag.waitForTimeout(300);
  await pag.click('nav button[data-vista="panel"]');
  comprobar('La media de Métricas refleja la nota (5 ★)', /5 ★/.test(await pag.locator('#metricas-extra').textContent()));

  // --- El último prioritario no se puede terminar si quedan bloqueados ---
  await pag.click('nav button[data-vista="proyectos"]');
  await pag.click('#fab-nuevo');
  await pag.fill('#np-nombre', 'Otro en cola');
  await pag.fill('#np-dias', '3');
  await pag.click('#np-crear');
  await pag.waitForSelector('#velo-confirmar.visible');
  await pag.click('#conf-ok');
  await pasarRuleta();
  await pag.locator('.proy-prioritario [data-accion="terminar"]').click();
  await pag.waitForTimeout(300);
  comprobar('Guardia del último prioritario con bloqueados', /único prioritario/.test(await pag.locator('#toast').textContent()));

  // --- "Ahora no" en la valoración deja el proyecto sin puntuar ---
  await pag.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('gatekeeper_v1'));
    d.proyectos.push({ id: 'aux', nombre: 'Auxiliar', tipo: 'otro', estado: 'activo', avance: 0, creadoEn: new Date().toISOString(), peaje: null });
    localStorage.setItem('gatekeeper_v1', JSON.stringify(d));
  });
  await pag.reload();
  await pag.waitForTimeout(400);
  await pag.click('nav button[data-vista="proyectos"]');
  await pag.locator('.proy[data-id="aux"] [data-accion="terminar"]').click();
  await pag.waitForSelector('#velo-confirmar.visible');
  await pag.click('#conf-ok');
  await pag.waitForSelector('#velo-valorar.visible');
  await pag.click('#val-saltar');
  await pag.waitForTimeout(300);
  await pag.click('nav button[data-vista="historial"]');
  comprobar('Saltar la puntuación deja la ficha "sin puntuar"', /sin puntuar/.test(await pag.locator('#hist-terminados').textContent()));

  // --- Pausar un prioritario (en manos de otra persona) ---
  await pag.click('nav button[data-vista="proyectos"]');
  comprobar('Los prioritarios también tienen botón Pausar', (await pag.locator('.proy-prioritario [data-accion="pausar"]').count()) === 1);
  await pag.locator('.proy-prioritario [data-accion="pausar"]').click();
  await pag.waitForTimeout(300);
  comprobar('El prioritario pausado queda inactivo', (await pag.locator('.proy-prioritario').count()) === 0 && (await pag.locator('.proy-pausado').count()) === 1);

  // --- Sin prioritarios en marcha: vía libre (premio por llegar al tope) ---
  comprobar('El bloqueado ofrece la vía libre', (await pag.locator('[data-accion="via-libre"]').count()) === 1);
  await pag.locator('[data-accion="via-libre"]').click();
  await pag.waitForSelector('#velo-confirmar.visible');
  const msjVia = await pag.locator('#conf-msj').textContent();
  comprobar('La vía libre se presenta en positivo (llegar al tope)', /Has llegado al tope/.test(msjVia) && /sin peaje/.test(msjVia));
  await pag.click('#conf-ok');
  await pag.waitForTimeout(300);
  const trasViaLibre = await pag.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('gatekeeper_v1'));
    return { estado: d.proyectos.find(p => p.nombre === 'Otro en cola').estado,
             gastada: d.bolsaGastada, usada: d.viaLibreUsada };
  });
  comprobar('El proyecto se activa sin gastar bolsa', trasViaLibre.estado === 'activo' && trasViaLibre.gastada === 3);
  comprobar('La vía libre queda consumida', trasViaLibre.usada === true);

  // --- Solo una vía libre cada vez: otro bloqueado no la ofrece ---
  await pag.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('gatekeeper_v1'));
    d.proyectos.push({ id: 'blq2', nombre: 'Segundo en cola', tipo: 'otro', estado: 'bloqueado', avance: 0,
      creadoEn: new Date().toISOString(),
      peaje: { horas: 5, horasBase: 5, dias: 5, diasUsuario: 5, suerte: false } });
    localStorage.setItem('gatekeeper_v1', JSON.stringify(d));
  });
  await pag.reload();
  await pag.waitForTimeout(400);
  await pag.click('nav button[data-vista="proyectos"]');
  comprobar('No hay segunda vía libre', (await pag.locator('[data-accion="via-libre"]').count()) === 0);

  // --- Terminar el proyecto de vía libre tampoco regala otra ---
  await pag.locator('.proy-activo [data-accion="terminar"]').click();
  await pag.waitForSelector('#velo-confirmar.visible');
  await pag.click('#conf-ok');
  await pag.waitForSelector('#velo-valorar.visible');
  await pag.click('#val-saltar');
  await pag.waitForTimeout(300);
  comprobar('Terminado el de vía libre, sigue sin haber otra', (await pag.locator('[data-accion="via-libre"]').count()) === 0);

  // --- Reactivar el prioritario pausado: vuelve como prioritario ---
  await pag.locator('.proy-pausado [data-accion="reactivar"]').click();
  await pag.waitForTimeout(300);
  comprobar('El pausado vuelve como prioritario, no como activo', (await pag.locator('.proy-prioritario').count()) === 1);
  const viaLibreReset = await pag.evaluate(() => JSON.parse(localStorage.getItem('gatekeeper_v1')).viaLibreUsada);
  comprobar('Con un prioritario de vuelta, la vía libre se renueva', viaLibreReset === false);
  comprobar('Con prioritario en marcha no se ofrece la vía libre', (await pag.locator('[data-accion="via-libre"]').count()) === 0);

  // --- Guardián del cronómetro: nunca más de 6h por registro ---
  await pag.click('nav button[data-vista="tiempo"]');
  await pag.fill('#in-horas', '7');
  await pag.click('#btn-manual');
  await pag.waitForTimeout(300);
  comprobar('La entrada manual rechaza más de 6h', /Máximo 6h/.test(await pag.locator('#toast').textContent()));
  // Cronómetro olvidado: simular 7h corriendo y pararlo
  await pag.selectOption('#sel-crono', { index: 0 });
  await pag.click('#btn-crono');
  await pag.waitForTimeout(300);
  await pag.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('gatekeeper_v1'));
    d.crono.inicio = Date.now() - 7 * 3600000;   // como si llevara 7 horas
    localStorage.setItem('gatekeeper_v1', JSON.stringify(d));
  });
  await pag.reload();
  await pag.waitForTimeout(400);
  await pag.click('nav button[data-vista="tiempo"]');
  comprobar('El cronómetro pasado de 6h avisa en pantalla', /Más de 6h/.test(await pag.locator('#crono-etiqueta').textContent()));
  await pag.click('#btn-crono');   // parar
  await pag.waitForSelector('#velo-sesion.visible', { timeout: 5000 });
  comprobar('Al parar, se abre la edición para ajustar la duración real', (await pag.inputValue('#ses-horas')) === '6');
  await pag.fill('#ses-horas', '2');
  await pag.click('#ses-guardar');
  await pag.waitForTimeout(300);
  const sesionesLargas = await pag.evaluate(() =>
    JSON.parse(localStorage.getItem('gatekeeper_v1')).sesiones.filter(s => s.horas > 6).length);
  comprobar('Ningún registro supera las 6h', sesionesLargas === 0);

  // --- Sesgo de estimación en Métricas ---
  await pag.evaluate(() => {
    const hoyC = (() => { const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })();
    const ayerC = (() => { const d = new Date(Date.now() - 86400000);
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })();
    const d = JSON.parse(localStorage.getItem('gatekeeper_v1'));
    // Dos terminados con estimación: tú estimaste 1 y 1 día; fueron 2 y 2 (50% de menos)
    // La IA estimó 4 y 4 (100% de más)
    d.proyectos.push({ id: 'sg1', nombre: 'Sesgo uno', tipo: 'personal', estado: 'terminado', avance: 100,
      creadoEn: '2020-01-01T00:00:00.000Z', terminadoEn: new Date().toISOString(),
      peaje: { horas: 1, horasBase: 1, dias: 1, diasUsuario: 1, diasIA: 4, suerte: false } });
    d.proyectos.push({ id: 'sg2', nombre: 'Sesgo dos', tipo: 'personal', estado: 'terminado', avance: 100,
      creadoEn: '2020-01-01T00:00:00.000Z', terminadoEn: new Date().toISOString(),
      peaje: { horas: 1, horasBase: 1, dias: 1, diasUsuario: 1, diasIA: 4, suerte: false } });
    d.sesiones.push({ id: 'sgs1', proyectoId: 'sg1', fecha: ayerC, horas: 1, prioritario: false, tipo: 'personal', manual: true });
    d.sesiones.push({ id: 'sgs2', proyectoId: 'sg1', fecha: hoyC, horas: 1, prioritario: false, tipo: 'personal', manual: true });
    d.sesiones.push({ id: 'sgs3', proyectoId: 'sg2', fecha: ayerC, horas: 1, prioritario: false, tipo: 'personal', manual: true });
    d.sesiones.push({ id: 'sgs4', proyectoId: 'sg2', fecha: hoyC, horas: 1, prioritario: false, tipo: 'personal', manual: true });
    localStorage.setItem('gatekeeper_v1', JSON.stringify(d));
  });
  await pag.reload();
  await pag.waitForTimeout(400);
  await pag.click('nav button[data-vista="panel"]');
  const metricasSesgo = await pag.locator('#metricas-extra').textContent();
  comprobar('Tu sesgo: estimas un 50% de menos', /estimas un 50% de menos/.test(metricasSesgo));
  comprobar('El sesgo de la IA: estima un 100% de más', /estima un 100% de más/.test(metricasSesgo));

  // --- Protección de datos: recordatorio de copia y webhook semanal ---
  await pag.click('nav button[data-vista="tiempo"]');
  comprobar('Sin copia nunca hecha, aparece el recordatorio', await pag.locator('#banner-copia').isVisible());
  await pag.click('#banner-copia');   // sin Web Share en headless cae a la descarga
  await pag.waitForTimeout(400);
  comprobar('Hacer la copia apaga el recordatorio', (await pag.locator('#banner-copia').count()) === 0);
  const ultimaCopia = await pag.evaluate(() => JSON.parse(localStorage.getItem('gatekeeper_v1')).ultimaCopia);
  comprobar('Queda registrada la fecha de la copia', typeof ultimaCopia === 'string');
  // Configurar el webhook local y comprobar el envío automático
  await pag.click('nav button[data-vista="ajustes"]');
  await pag.fill('#aj-webhook', 'http://localhost:' + PUERTO + '/hook');
  await pag.click('#btn-guardar-webhook');
  await pag.waitForTimeout(600);
  comprobar('La copia automática llega al webhook', webhookRecibido !== null && /"proyectos"/.test(webhookRecibido));
  comprobar('La clave de OpenRouter no viaja en la copia automática', webhookRecibido !== null && JSON.parse(webhookRecibido).config.orClave === '');
  const copiaAuto = await pag.evaluate(() => JSON.parse(localStorage.getItem('gatekeeper_v1')).ultimaCopiaAuto);
  comprobar('Queda registrado el envío automático', typeof copiaAuto === 'string');
  // En la próxima apertura, antes de 7 días, no se reenvía
  webhookRecibido = null;
  await pag.reload();
  await pag.waitForTimeout(800);
  comprobar('Antes de 7 días no se reenvía otra copia', webhookRecibido === null);

  comprobar('Sin errores de JavaScript en consola', erroresJS.length === 0);
  if (erroresJS.length) console.log('Errores:', erroresJS);

  await navegador.close();
  servidor.close();
  console.log(fallos === 0 ? '\n🎉 TODO OK' : `\n💥 ${fallos} fallos`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR FATAL:', e); process.exit(1); });
