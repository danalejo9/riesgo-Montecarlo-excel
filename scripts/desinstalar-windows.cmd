@echo off
rem Quita el complemento Riesgo Monte Carlo de Excel para Windows.
setlocal

echo.
echo   Riesgo Monte Carlo - desinstalar
echo.
echo   Cierra Excel antes de seguir.
pause

reg delete "HKCU\Software\Microsoft\Office\16.0\WEF\Developer" /v "RiesgoMonteCarlo" /f >nul 2>nul
if exist "%LOCALAPPDATA%\RiesgoMonteCarlo" rmdir /s /q "%LOCALAPPDATA%\RiesgoMonteCarlo"
if exist "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef" rmdir /s /q "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef" 2>nul

echo.
echo   Listo. La pestana Riesgo ya no aparece en Excel.
echo.
pause
