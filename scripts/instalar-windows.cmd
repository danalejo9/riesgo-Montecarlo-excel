@echo off
rem Instala el complemento Riesgo Monte Carlo en Excel para Windows.
rem Descarga el manifiesto y lo registra para este usuario (no pide administrador).
rem Lo genera scripts/publicar-manifiesto.mjs: {{URL}} es la direccion publicada.
setlocal
set "CARPETA=%LOCALAPPDATA%\RiesgoMonteCarlo"
set "MANIFIESTO=%CARPETA%\manifest.xml"

echo.
echo   Riesgo Monte Carlo {{VERSION}} - instalacion para Excel
echo.
echo   Cierra Excel antes de seguir.
pause

if not exist "%CARPETA%" mkdir "%CARPETA%"
curl -fsSL "{{URL}}/manifest.xml" -o "%MANIFIESTO%"
if errorlevel 1 (
  echo.
  echo   No se pudo descargar el manifiesto. Revisa la conexion a internet y vuelve a intentarlo.
  pause
  exit /b 1
)

reg add "HKCU\Software\Microsoft\Office\16.0\WEF\Developer" /v "RiesgoMonteCarlo" /t REG_SZ /d "%MANIFIESTO%" /f >nul
if errorlevel 1 (
  echo.
  echo   No se pudo registrar el complemento en Excel.
  pause
  exit /b 1
)

rem La cache de complementos de Office: si queda una version vieja, Excel la sigue usando.
if exist "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef" rmdir /s /q "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef" 2>nul

echo.
echo   Listo. Abre Excel: aparece la pestana Riesgo.
echo.
pause
