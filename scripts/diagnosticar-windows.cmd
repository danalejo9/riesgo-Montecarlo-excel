@echo off
rem Reune en un archivo de texto lo necesario para saber por que el complemento
rem Riesgo Monte Carlo no aparece en Excel para Windows. No cambia nada.
rem Lo genera scripts/publicar-manifiesto.mjs con la direccion, la version y el Id publicados.
setlocal
set "CARPETA=%LOCALAPPDATA%\RiesgoMonteCarlo"
set "MANIFIESTO=%CARPETA%\manifest.xml"
set "INFORME=%USERPROFILE%\Desktop\diagnostico-riesgo-montecarlo.txt"
if not exist "%USERPROFILE%\Desktop" set "INFORME=%TEMP%\diagnostico-riesgo-montecarlo.txt"

echo.
echo   Riesgo Monte Carlo - diagnostico
echo   Revisando el equipo, tarda unos segundos...

> "%INFORME%" (
  echo Diagnostico Riesgo Monte Carlo {{VERSION}} - %DATE% %TIME%
  ver
  echo.
  echo == Excel en ejecucion
  tasklist /fi "imagename eq excel.exe"
  echo.
  echo == Office instalado
  reg query "HKLM\SOFTWARE\Microsoft\Office\ClickToRun\Configuration" /v VersionToReport 2>&1
  reg query "HKLM\SOFTWARE\Microsoft\Office\ClickToRun\Configuration" /v Platform 2>&1
  reg query "HKLM\SOFTWARE\Microsoft\Office\ClickToRun\Configuration" /v ProductReleaseIds 2>&1
  reg query "HKLM\SOFTWARE\Microsoft\Office\ClickToRun\Configuration" /v UpdateChannel 2>&1
  reg query "HKLM\SOFTWARE\Microsoft\Office\ClickToRun\Configuration" /v CDNBaseUrl 2>&1
  echo.
  echo == Complementos registrados
  reg query "HKCU\Software\Microsoft\Office\16.0\WEF\Developer" 2>&1
  echo.
  echo == Manifiesto instalado
  if exist "%MANIFIESTO%" (
    dir "%MANIFIESTO%"
    findstr /c:"<Id>" /c:"<Version>" /c:"<SourceLocation" "%MANIFIESTO%"
  ) else (
    echo No existe %MANIFIESTO%
  )
  echo Id esperado: {{ID}}
  echo.
  echo == Descarga desde la pagina publicada
  where curl 2>&1
  curl -sS -o nul -w "manifest.xml: HTTP %%{http_code}, %%{size_download} bytes\n" "{{URL}}/manifest.xml" 2>&1
  curl -sS -o nul -w "taskpane.html: HTTP %%{http_code}, %%{size_download} bytes\n" "{{URL}}/taskpane.html" 2>&1
  echo.
  echo == Politicas de complementos de la organizacion
  reg query "HKCU\Software\Policies\Microsoft\Office\16.0\WEF" /s 2>&1
  reg query "HKLM\SOFTWARE\Policies\Microsoft\Office\16.0\WEF" /s 2>&1
  reg query "HKCU\Software\Policies\Microsoft\Office\16.0\Excel\Security" /s 2>&1
  echo.
  echo == Cache de complementos
  if exist "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef" (dir /s /b "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef") else (echo Vacia)
)

echo.
echo   Listo. El informe esta en:
echo   %INFORME%
echo   Se abre ahora en el Bloc de notas: copia todo su texto y envialo.
echo.
start "" notepad "%INFORME%"
pause
