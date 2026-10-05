/**
 * Revisa lo que necesita `npm start` antes de abrir Excel: certificados de
 * desarrollo, el puerto 9090 y qué responde en él. Uso: `npm run revisar`.
 * No cambia nada; solo informa.
 */

import { existsSync } from 'node:fs';
import { request } from 'node:https';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

const ok = (t) => console.log(`  OK     ${t}`);
const mal = (t) => console.log(`  FALLA  ${t}`);

console.log('\nRevisión del entorno del complemento\n');

const dir = join(homedir(), '.office-addin-dev-certs');
const certs = existsSync(join(dir, 'localhost.crt')) && existsSync(join(dir, 'localhost.key'));
if (certs) ok('Certificados de desarrollo instalados.');
else mal(`Faltan los certificados en ${dir}. Ejecuta: npx office-addin-dev-certs install`);

// Primero se pregunta qué responde en el 9090 (así se ve también lo que
// escucha a través de HTTP.sys de Windows, que no siempre impide abrir el
// puerto pero sí se queda con las peticiones).
const resp = await new Promise((r) => {
  const q = request({ host: 'localhost', port: 9090, path: '/taskpane.html', rejectUnauthorized: false, timeout: 4000 }, (res) => {
    let cuerpo = '';
    res.on('data', (d) => { cuerpo += d; });
    res.on('end', () => r({ estado: res.statusCode, cuerpo }));
  });
  q.on('error', (e) => r({ error: e.message.split('\n')[0].slice(0, 80), codigo: e.code }));
  q.on('timeout', () => { q.destroy(); r({ error: 'no responde' }); });
  q.end();
});

if (resp.codigo === 'ECONNREFUSED') {
  const libre = await new Promise((r) => {
    const s = createServer();
    s.once('error', () => r(false));
    s.once('listening', () => s.close(() => r(true)));
    s.listen(9090);
  });
  if (libre) ok('El puerto 9090 está libre: npm start puede arrancar el servidor.');
  else mal('El puerto 9090 no acepta conexiones pero tampoco se puede abrir: otro programa lo tiene reservado.\n'
    + '         Averigua cuál con:  netstat -ano | findstr :9090');
} else if (resp.estado === 200 && /raiz|taskpane|Riesgo/i.test(resp.cuerpo)) {
  ok('El servidor del complemento ya está arrancado en el 9090: bien.');
} else {
  mal('El puerto 9090 está ocupado por OTRO programa'
    + (resp.estado ? ` (responde ${resp.estado}${/service is unavailable/i.test(resp.cuerpo) ? ': «The service is unavailable»' : ''})` : ` (${resp.error})`)
    + '.\n         El complemento no puede arrancar. Averigua cuál con:\n'
    + '           netstat -ano | findstr :9090\n'
    + '           tasklist /FI "PID eq <número de la última columna>"');
}
console.log('');
