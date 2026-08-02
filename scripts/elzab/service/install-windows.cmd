@echo off
REM Mostek fiskalny GetRido jako zadanie startowe (Windows).
REM
REM Zadanie harmonogramu, nie usluga systemowa: mostek nasluchuje wylacznie na 127.0.0.1
REM i ma dzialac w sesji uzytkownika, ktory obsluguje warsztat. Zadanie wstaje przy
REM logowaniu i podnosi sie po awarii.
REM
REM Uruchom:  scripts\elzab\service\install-windows.cmd
REM Usun:     scripts\elzab\service\install-windows.cmd /uninstall

setlocal
set TASK=GetRido Mostek fiskalny
set REPO=%~dp0..\..\..

if /I "%~1"=="/uninstall" (
  schtasks /Delete /TN "%TASK%" /F
  echo Usunieto zadanie "%TASK%".
  exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo Nie znaleziono Node.js w PATH. Zainstaluj Node 20+ i uruchom ponownie.
  exit /b 1
)

if "%FISCAL_BRIDGE_PORT%"=="" set FISCAL_BRIDGE_PORT=9110

REM /RL LIMITED: mostek nie potrzebuje uprawnien administratora.
schtasks /Create /TN "%TASK%" /SC ONLOGON /RL LIMITED /F ^
  /TR "cmd /c cd /d \"%REPO%\" && node --no-warnings=ExperimentalWarning scripts\elzab\bridge.ts"

schtasks /Run /TN "%TASK%"

echo Zainstalowano zadanie "%TASK%".
echo   sprawdz: curl http://127.0.0.1:%FISCAL_BRIDGE_PORT%/health
endlocal
