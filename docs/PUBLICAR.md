# Publicar el complemento para los colegas

El complemento se publica en GitHub Pages:
<https://danalejo9.github.io/riesgo-Montecarlo-excel/>. Esa página es la que
se comparte: tiene el instalador de Windows, el comando para Mac y el
`manifest.xml` para Excel en la Web.

## Una sola vez: activar GitHub Pages

1. En GitHub, el repositorio → **Settings → Pages**.
2. En **Build and deployment → Source** elige **GitHub Actions**.
3. El repositorio es privado: GitHub Pages en un repositorio privado pide
   **GitHub Pro** (o un plan de organización). Si en Settings → Pages sale
   un aviso de «Upgrade», hay que elegir entre pasar a Pro o hacer público el
   repositorio. La página publicada es pública en los dos casos (es lo que
   Excel descarga); el código fuente solo queda privado con Pro.

## Cada versión

Todo cambio que llega a `main` se publica solo (workflow
**Publicar en GitHub Pages**, en la pestaña Actions; tarda unos 2 minutos).
También se puede lanzar a mano desde Actions → Publicar en GitHub Pages →
**Run workflow**.

- Si solo cambia el panel o el motor, los colegas no hacen nada: lo reciben
  al abrir Excel.
- Si cambia el `manifest.xml` (botones de la cinta, funciones nuevas,
  permisos), sube `<Version>` en el manifiesto y avisa para que cada uno
  vuelva a instalar desde la página.

## Probar la versión publicada sin publicarla

```
RIESGO_BASE=/riesgo-Montecarlo-excel/ npm run build
node scripts/publicar-manifiesto.mjs https://danalejo9.github.io/riesgo-Montecarlo-excel
```

Deja en `dist/` exactamente lo que se sube. La versión de desarrollo
(`npm start`, `localhost:9090`) sigue igual y tiene otro Id, así que las dos
pueden estar cargadas a la vez en el mismo Excel.
