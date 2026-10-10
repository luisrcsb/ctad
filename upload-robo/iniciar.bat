@echo off
REM CTAD robo-upload — vigia a pasta e envia sozinho (deixe esta janela aberta)
cd /d "%~dp0"
echo CTAD robo de upload automatico — nao feche esta janela.
echo Pasta monitorada: veja config.json
node robo-upload.js
pause
