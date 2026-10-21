@echo off
rem Instala el complemento Riesgo Monte Carlo en Excel para Windows.
rem Descarga el manifiesto y lo registra para este usuario (no pide administrador).
rem Lo genera scripts/publicar-manifiesto.mjs con la direccion, la version y el Id publicados.
setlocal
set "CARPETA=%LOCALAPPDATA%\RiesgoMonteCarlo"
set "MANIFIESTO=%CARPETA%\manifest.xml"
set "CLAVE=HKCU\Software\Microsoft\Office\16.0\WEF\Developer"
set "ID={{ID}}"

echo.
echo   Riesgo Monte Carlo {{VERSION}} - instalacion para Excel
echo.
echo   Cierra Excel antes de seguir.
pause

rem Excel lee los complementos al arrancar: si sigue abierto, aunque sea sin
rem ventanas, no ve el nuevo hasta que se cierra del todo.
:excel_abierto
tasklist /fi "imagename eq excel.exe" 2>nul | find /i "excel.exe" >nul
if not errorlevel 1 (
  echo.
  echo   Excel sigue abierto. Cierra todas sus ventanas, guarda lo que tengas
  echo   y pulsa una tecla. Si no ves ninguna ventana de Excel, cierralo desde
  echo   el Administrador de tareas: Ctrl + Shift + Esc, Microsoft Excel, Finalizar tarea.
  pause >nul
  goto excel_abierto
)

rem Sin Microsoft 365 el complemento no se instala: pide SharedRuntime 1.1.
reg query "HKLM\SOFTWARE\Microsoft\Office\ClickToRun\Configuration" /v VersionToReport >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Aviso: no se encontro Office de Microsoft 365 en este equipo.
  echo   El complemento necesita Excel de Microsoft 365; con Office 2016, 2019
  echo   o 2021 de compra unica no aparece.
)

if not exist "%CARPETA%" mkdir "%CARPETA%"
curl -fsSL "{{URL}}/manifest.xml" -o "%MANIFIESTO%"
if errorlevel 1 (
  echo.
  echo   No se pudo descargar el manifiesto. Revisa la conexion a internet y vuelve a intentarlo.
  pause
  exit /b 1
)
findstr /c:"<Id>%ID%</Id>" "%MANIFIESTO%" >nul
if errorlevel 1 (
  echo.
  echo   Lo descargado no es el manifiesto del complemento: puede que la red de tu
  echo   organizacion lo bloquee. Ejecuta diagnosticar-windows.cmd y envia el informe.
  pause
  exit /b 1
)

rem Mismo registro que usa office-addin-debugging: el nombre es el Id del
rem complemento. Se quita el nombre de la version 0.9.1 del instalador.
reg delete "%CLAVE%" /v "RiesgoMonteCarlo" /f >nul 2>nul
reg add "%CLAVE%" /v "%ID%" /t REG_SZ /d "%MANIFIESTO%" /f >nul
reg query "%CLAVE%" /v "%ID%" >nul 2>nul
if errorlevel 1 (
  echo.
  echo   No se pudo registrar el complemento en Excel.
  pause
  exit /b 1
)

rem La cache de complementos de Office: si queda una version vieja, Excel la sigue usando.
if exist "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef" rmdir /s /q "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef" 2>nul

rem Las politicas de la organizacion pueden bloquear los complementos.
reg query "HKCU\Software\Policies\Microsoft\Office\16.0\WEF" >nul 2>nul && set "POLITICAS=1"
reg query "HKLM\SOFTWARE\Policies\Microsoft\Office\16.0\WEF" >nul 2>nul && set "POLITICAS=1"
if defined POLITICAS (
  echo.
  echo   Aviso: tu organizacion tiene reglas para los complementos de Office.
  echo   Si la pestana Riesgo no aparece, puede ser por eso.
)

echo.
echo   Listo. Abre Excel y un libro: aparece la pestana Riesgo.
echo   Si no aparece: Inicio, Complementos, y busca Riesgo Monte Carlo en
echo   Complementos de desarrollador o Mis complementos.
echo   Si tampoco esta ahi, ejecuta diagnosticar-windows.cmd y envia el informe.
echo.
pause
