import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Certificados de office-addin-dev-certs para servir el panel por HTTPS.
// Excel **exige** HTTPS incluso en localhost: sin certificado no carga el
// panel y el error que enseña no dice por qué.
const certPath = resolve(os.homedir(), '.office-addin-dev-certs/localhost.crt');
const keyPath = resolve(os.homedir(), '.office-addin-dev-certs/localhost.key');

const hayCertificados = fs.existsSync(certPath) && fs.existsSync(keyPath);
if (!hayCertificados) {
  console.warn(
    '\n  Aviso: no hay certificados de desarrollo en ~/.office-addin-dev-certs.\n' +
    '  Excel no cargará el panel por HTTP. Ejecuta:\n' +
    '      npx office-addin-dev-certs install\n',
  );
}

const httpsOptions = hayCertificados
  ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
  : undefined;

/**
 * La raíz es `ui/`, así que las páginas quedan servidas en la raíz del
 * servidor (`/taskpane.html`) y no bajo `/ui/…`: son las URL que declara el
 * manifiesto, y tienen que coincidir exactamente.
 *
 * `publicDir` apunta a la carpeta `public/` del repositorio, que está fuera de
 * la raíz: ahí viven los iconos que el manifiesto pide por URL absoluta.
 */
export default defineConfig({
  root: 'ui',
  publicDir: resolve(__dirname, 'public'),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        taskpane: resolve(__dirname, 'ui/taskpane.html'),
        commands: resolve(__dirname, 'ui/commands.html'),
        // El informe imprimible: se abre en el navegador del sistema.
        informe: resolve(__dirname, 'ui/informe.html'),
        // El banco de pruebas (`/banco/`): el panel sobre un Excel de mentira,
        // para poder desarrollar la interfaz sin Excel. No lo carga el
        // manifiesto; se abre a mano.
        banco: resolve(__dirname, 'ui/banco/index.html'),
      },
    },
  },
  server: {
    port: 9090,
    strictPort: true, // si el 9090 está ocupado, mejor fallar que servir en otro puerto que el manifiesto no conoce
    https: httpsOptions,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
});
