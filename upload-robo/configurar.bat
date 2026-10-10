@echo off
REM CTAD robo-upload — assistente para configurar a pasta vigiada e opcoes
cd /d "%~dp0"
node robo-upload.js --configurar
pause
