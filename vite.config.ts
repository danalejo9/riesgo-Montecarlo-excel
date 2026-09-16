import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Certificados de office-addin-dev-certs para servir el panel por HTTPS.
const certPath = resolve(os.homedir(), '.office-addin-dev-certs/localhost.crt');
const keyPath = resolve(os.homedir(), '.office-addin-dev-certs/localhost.key');

const httpsOptions =
  fs.existsSync(certPath) && fs.existsSync(keyPath)
    ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
    : {};

// Nota (E0): los puntos de entrada HTML del complemento se reconstruyen en la
// etapa E3. Hasta entonces no hay `vite build`: `npm run build` solo comprueba
// tipos. El codigo heredado vive en `legacy/` y esta fuera del build.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 9090,
    https: httpsOptions,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
});
