@echo off
REM CTAD robo-upload — instala as dependencias (rodar 1 vez)
cd /d "%~dp0"
echo Instalando dependencias do robo de upload...
call npm install
echo.
echo Pronto! Edite o config.json (pasta do ZRound) e rode iniciar.bat
pause
