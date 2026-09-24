import { build, defineConfig, type Plugin } from 'vite';
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
/**
 * Las funciones `RIESGO.*`: sus metadatos (`funciones.json`) se generan del
 * catálogo del motor y su script (`funciones.js`) se empaqueta aparte en un
 * solo archivo (ver `vite.funciones.config.ts`). En desarrollo, el servidor
 * los sirve al vuelo; en la construcción, se escriben en `dist/`.
 */
function funcionesRiesgo(): Plugin {
  const metadatos = async () => {
    const { metadatosFunciones } = await import('./engine/modelo/metadatosFunciones.ts');
    return JSON.stringify(metadatosFunciones(), null, 2);
  };
  return {
    name: 'funciones-riesgo',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/funciones.json') {
          res.setHeader('Content-Type', 'application/json');
          res.end(await metadatos());
          return;
        }
        if (req.url === '/funciones.js') {
          const salida = await build({ configFile: resolve(__dirname, 'vite.funciones.config.ts'), build: { write: false }, logLevel: 'warn' });
          const trozos = (Array.isArray(salida) ? salida : [salida]) as { output: { fileName: string; code?: string }[] }[];
          const js = trozos.flatMap((t) => t.output).find((o) => o.fileName === 'funciones.js')?.code ?? '';
          res.setHeader('Content-Type', 'text/javascript');
          res.end(js);
          return;
        }
        next();
      });
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'funciones.json', source: await metadatos() });
    },
  };
}

export default defineConfig({
  root: 'ui',
  publicDir: resolve(__dirname, 'public'),
  plugins: [react(), funcionesRiesgo()],
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
