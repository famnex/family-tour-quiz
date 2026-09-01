@echo off
setlocal
cd /d "%~dp0."

echo ===================================================
echo   Familienausflug-Rallye Companion App
echo ===================================================
echo.

REM 1. Node.js Pruefung
node -v >nul 2>&1
if errorlevel 1 (
    echo FEHLER: Node.js wurde nicht gefunden!
    echo Bitte installiere Node.js von https://nodejs.org/
    pause
    exit /b 1
)

REM 2. Abhaengigkeiten pruefen
if not exist node_modules (
    echo INFO: Installiere Abhaengigkeiten - bitte kurz warten...
    call npm install
)

REM 3. Datenbank pruefen
if not exist data\family_tour.db (
    echo INFO: Initialisiere Datenbank mit Muster-Rallye...
    node src\seed.js
)

REM 4. Netzwerk-Info
echo.
echo ---------------------------------------------------
echo Fuer Smartphones im selben WLAN:
echo Oeffne auf den Handys die IP-Adresse dieses PCs:
ipconfig | findstr /i "IPv4"
echo Port: :3000 (z.B. http://192.168.178.xx:3000)
echo.
echo Auf diesem PC:
echo http://localhost:3000
echo ---------------------------------------------------
echo.

REM 5. Browser oeffnen
start http://localhost:3000

REM 6. Server starten
echo INFO: Starte Rallye-Server auf Port 3000...
echo Druecke STRG+C um den Server zu beenden.
echo.

node server.js
pause
