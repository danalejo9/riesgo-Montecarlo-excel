# Instalar el complemento para probarlo

Para quien prueba el complemento **Riesgo Monte Carlo** por primera vez, en
Windows, en Mac o en Excel para la Web. Se instala una vez (unos 30
minutos); después, cada sesión de pruebas empieza con un solo comando.

El complemento todavía no está publicado en la tienda de Microsoft: corre
desde tu propio equipo. Por eso hay que descargar el proyecto y dejar un
pequeño servidor funcionando mientras pruebas.

## Qué necesitas

- Una **cuenta de GitHub** con la invitación al proyecto **aceptada** (llega
  por correo; el repositorio es privado).
- **Excel de Microsoft 365** (suscripción), actualizado. En Windows o Mac.
  Para Excel en la Web, una cuenta Microsoft (personal o del trabajo).
- Permiso para instalar programas en tu equipo.

---

## Windows

**1. Instala dos programas** (con las opciones que vienen por defecto):
- **Node.js**, versión **LTS**: <https://nodejs.org> → botón LTS → instalador
  `.msi`.
- **Git**: <https://git-scm.com/download/win> → «Click here to download».

**2. Abre PowerShell** (tecla Windows, escribe `PowerShell`, Enter) y
comprueba, una línea cada vez:

```
node -v
git --version
```

`node -v` tiene que decir **v22.12** o más (v22, v24…). Si dice que no
reconoce el comando, cierra PowerShell y ábrelo otra vez.

**3. Descarga el proyecto** en Documentos:

```
cd "$HOME\Documents"
git clone https://github.com/danalejo9/riesgo-Montecarlo-excel.git riesgo-montecarlo-v2
cd riesgo-montecarlo-v2
```

La primera vez se abre una ventana para **iniciar sesión en GitHub**:
elige «Sign in with your browser» y autoriza. (Si prefieres no usar la
consola para esto, mira «Alternativa: GitHub Desktop» al final.)

**4. Instala lo que necesita el proyecto** (tarda unos minutos):

```
npm install
```

Si sale «la ejecución de scripts está deshabilitada en este sistema»:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, responde **S** y
repite `npm install`.

**5. Instala el certificado de desarrollo** (el panel se sirve por HTTPS
desde tu equipo):

```
npx office-addin-dev-certs install
```

Windows pregunta si confías en el certificado: **Sí**.

**6. Comprueba** que todo está listo:

```
npm run revisar
```

Tiene que decir **OK** en las dos líneas.

**7. Arranca.** Cierra Excel y:

```
npm start
```

Si pregunta «Allow localhost loopback for Microsoft Edge WebView?», responde
**Y**. Se abre Excel con una pestaña nueva, **Riesgo**. Pulsa **Modelo**: se
abre el panel a la derecha. **Deja PowerShell abierto** mientras pruebas.

Cada vez que cierres Excel, antes de volver a abrirlo: `npm run stop` y
`npm start` (desde la carpeta `riesgo-montecarlo-v2`).

**Si no aparece la pestaña Riesgo o Excel se cierra solo**, haz este
arranque limpio:

```
taskkill /IM EXCEL.EXE /F
npm run stop
Remove-Item "$env:LOCALAPPDATA\Microsoft\Office\16.0\Wef\*" -Recurse -Force
npm run revisar
npm start
```

---

## Mac

*Mac todavía no se ha probado a fondo: anota todo lo que veas distinto de
la guía.*

**1. Instala Node.js**, versión **LTS**: <https://nodejs.org> → botón LTS →
instalador `.pkg`.

**2. Abre Terminal** (Cmd + Espacio, escribe `Terminal`, Enter) y
comprueba:

```
node -v
git --version
```

`node -v` tiene que decir **v22.12** o más. Si `git --version` ofrece
instalar las «herramientas de línea de comandos para desarrolladores»,
acepta (**Instalar**) y espera a que termine.

**3. Descarga el proyecto.** En Mac, `git clone` de un repositorio privado
pide un token en vez de la contraseña; lo más sencillo es **GitHub Desktop**:
1. Instálalo desde <https://desktop.github.com> e inicia sesión con tu
   cuenta de GitHub.
2. **File → Clone repository…** → pestaña **GitHub.com** → elige
   `danalejo9/riesgo-Montecarlo-excel`.
3. En **Local path** pon `~/Documents/riesgo-montecarlo-v2` → **Clone**.

Luego, en Terminal:

```
cd ~/Documents/riesgo-montecarlo-v2
```

**4. Instala lo que necesita el proyecto:**

```
npm install
```

**5. Instala el certificado de desarrollo:**

```
npx office-addin-dev-certs install
```

Pide la **contraseña del Mac** para añadirlo al llavero: escríbela (no se ve
mientras escribes) y Enter.

**6. Comprueba:**

```
npm run revisar
```

Tiene que decir **OK** en las dos líneas.

**7. Arranca.** Cierra Excel (Cmd + Q) y:

```
npm start
```

Se abre Excel. Abre un libro y busca la pestaña **Riesgo**. Si no está:
**Insertar → Complementos → Mis complementos** y, en «Complementos de
desarrollador», elige **Riesgo Monte Carlo**. Deja Terminal abierto
mientras pruebas.

**Si `npm start` no consigue abrirlo**, cárgalo a mano:

```
mkdir -p ~/Library/Containers/com.microsoft.Excel/Data/Documents/wef
cp manifest.xml ~/Library/Containers/com.microsoft.Excel/Data/Documents/wef/
npm run dev-server
```

Espera a `Local: https://localhost:9090/`, deja esa ventana abierta y abre
Excel: **Insertar → Complementos → Mis complementos** → Riesgo Monte Carlo.

**Arranque limpio en Mac** (si la pestaña no aparece o se comporta raro):
cierra Excel (Cmd + Q) y

```
npm run stop
rm -rf ~/Library/Containers/com.microsoft.Excel/Data/Library/Caches/*
rm -rf ~/Library/Containers/com.microsoft.Excel/Data/Library/Application\ Support/Microsoft/Office/16.0/Wef/*
npm start
```

---

## Excel en la Web

El servidor del complemento corre **en tu equipo**: Excel en la Web solo lo
carga en el mismo equipo donde está funcionando.

**1.** Haz antes los pasos **1 a 6** de Windows o de Mac (descargar,
`npm install`, certificado, `npm run revisar`).

**2. Arranca solo el servidor**, desde la carpeta del proyecto:

```
npm run dev-server
```

Espera a `Local: https://localhost:9090/` y deja la ventana abierta.

**3. Comprueba el certificado**: en **Edge, Chrome o Safari** (Firefox no
sirve aquí) abre <https://localhost:9090/taskpane.html>. Debe verse el panel,
con un aviso de que falta Excel, y **sin** aviso de «conexión no segura».

**4. Sube el libro de prueba a OneDrive**: entra en <https://www.office.com>
con tu cuenta → **OneDrive** → **Agregar nuevo → Cargar archivos** → elige
`ejemplos/demo-proyecto-aurora.xlsx` de la carpeta del proyecto. Ábrelo: se
abre en Excel para la Web.

**5. Carga el complemento**: **Inicio → Complementos → Más complementos**
(en algunas versiones, «Obtener complementos») → pestaña **Mis
complementos** → **Cargar mi complemento** → **Examinar** → elige
`manifest.xml` de la carpeta del proyecto → **Cargar**. Aparece la pestaña
**Riesgo**.

- Si ya lo habías cargado antes, **quítalo primero** desde Mis complementos
  (la Web guarda en caché la lista de funciones).
- Si no ves «Cargar mi complemento», tu organización lo tiene bloqueado:
  prueba con una cuenta Microsoft personal.
- Al volver a abrir el libro otro día puede que tengas que cargarlo de
  nuevo.

---

## Qué probar y cómo mandar los resultados

La guía completa está en el proyecto, `docs/GUIA_PRUEBAS_EXCEL.md`. Se lee
bien en GitHub:
<https://github.com/danalejo9/riesgo-Montecarlo-excel/blob/main/docs/GUIA_PRUEBAS_EXCEL.md>

1. **Empieza en el «Paso 3. Preparar los libros»** de la guía: los pasos 1 y
   2 ya los hiciste con estas instrucciones. En Mac, las copias se hacen
   con `cp` en vez de `Copy-Item` (ver debajo).
2. Sigue los bloques en el orden del **Paso 4** de la guía. En Excel para
   la Web haz al menos el bloque **W**.
3. Anota en **`registro-pruebas.xlsx`** (en tu escritorio): en la hoja
   **Pruebas**, columna **Resultado**, elige OK, Falla, No aplica o
   Pendiente; si es Falla, escribe en **Qué ves** lo que sale y guarda una
   captura con el código en el nombre (`GT21.png`).
4. Antes de mandarlo, cambia el nombre del registro para que se sepa quién
   y dónde probó: `registro-pruebas-TUNOMBRE-windows.xlsx` (o `-mac`, o
   `-web`). Envíalo con las capturas a quien te compartió el proyecto.

**Copias en Mac** (desde la carpeta del proyecto, en vez de `Copy-Item`):

```
cp ejemplos/demo-proyecto-aurora.xlsx ~/Desktop/aurora-base.xlsx
cp docs/pruebas/registro-pruebas.xlsx ~/Desktop/registro-pruebas.xlsx
```

Y para cada bloque, por ejemplo:

```
cp ~/Desktop/aurora-base.xlsx ~/Desktop/aurora-A.xlsx
```

---

## Actualizar cuando haya cambios

Desde la carpeta del proyecto:

```
git pull origin main
npm install
npm run stop
npm start
```

Con GitHub Desktop: **Fetch origin** → **Pull origin**, y luego en la
consola `npm install`, `npm run stop` y `npm start`.

---

## Problemas frecuentes

| Qué ves | Qué hacer |
|---|---|
| `npm` o `node` «no se reconoce» | Cierra y abre otra vez PowerShell o Terminal después de instalar Node.js. |
| `npm run revisar`: faltan los certificados | `npx office-addin-dev-certs install` y acepta el aviso. |
| `npm run revisar`: el puerto 9090 está ocupado | Otro programa usa ese puerto. En Windows: `netstat -ano \| findstr :9090` y `tasklist /FI "PID eq N"` con el número de la última columna; manda lo que salga. En Mac: `lsof -i :9090`. |
| El panel dice «The service is unavailable» o sale en blanco | Arranque limpio de tu sistema (arriba). |
| Al escribir `=RIESGO.` Excel no propone las funciones | Arranque limpio. |
| `git pull` se queja de un `.xlsx` | Abriste y guardaste un libro dentro de la carpeta del proyecto: `git stash` y repite el pull. Trabaja siempre sobre copias en el escritorio. |

## Alternativa: GitHub Desktop (Windows y Mac)

Si no quieres usar `git` en la consola: instala GitHub Desktop
(<https://desktop.github.com>), inicia sesión, **File → Clone repository** →
`danalejo9/riesgo-Montecarlo-excel` → carpeta `Documentos\riesgo-montecarlo-v2`.
Todo lo demás (`npm install`, certificado, `npm start`) se hace igual en
PowerShell o Terminal, dentro de esa carpeta.
