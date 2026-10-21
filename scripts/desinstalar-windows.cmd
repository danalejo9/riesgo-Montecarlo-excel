@echo off
rem Quita el complemento Riesgo Monte Carlo de Excel para Windows.
setlocal
set "CLAVE=HKCU\Software\Microsoft\Office\16.0\WEF\Developer"

echo.
echo   Riesgo Monte Carlo - desinstalar
echo.
echo   Cierra Excel antes de seguir.
pause

rem El nombre de la version 0.9.1 del instalador y el actual, el Id.
reg delete "%CLAVE%" /v "RiesgoMonteCarlo" /f >nul 2>nul
reg delete "%CLAVE%" /v "{{ID}}" /f >nul 2>nul
if exist "%LOCALAPPDATA%\RiesgoMonteCarlo" rmdir /s /q "%LOCALAPPDATA%\RiesgoMonteCarlo"
if exist "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef" rmdir /s /q "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef" 2>nul

echo.
echo   Listo. La pestana Riesgo ya no aparece en Excel.
echo.
pause
