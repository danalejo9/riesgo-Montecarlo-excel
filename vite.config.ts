import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Configurar los certificados oficiales de Microsoft Office Addins
const certPath = resolve(os.homedir(), '.office-addin-dev-certs/localhost.crt');
const keyPath = resolve(os.homedir(), '.office-addin-dev-certs/localhost.key');

const httpsOptions = fs.existsSync(certPath) && fs.existsSync(keyPath)
  ? {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    }
  : {};

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        taskpane: resolve(__dirname, 'index.html'),
        functions: resolve(__dirname, 'functions.html'),
        commands: resolve(__dirname, 'commands.html'),
        dialog: resolve(__dirname, 'dialog.html')
      }
    }
  },
  server: {
    port: 9090,
    https: httpsOptions,
    headers: {
      "Access-Control-Allow-Origin": "*",
    }
  }
});
