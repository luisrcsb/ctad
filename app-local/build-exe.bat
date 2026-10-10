@echo off
REM CTAD Upload Auto — gera o executavel e publica em downloads/
set VERSAO=1.1.1
cd /d "%~dp0"
echo [1/4] Instalando dependencias...
call python -m pip install -r requirements.txt pyinstaller
echo [2/4] Gerando CTAD-Upload-Auto.exe v%VERSAO% (pode demorar alguns minutos)...
call python -m PyInstaller --noconfirm --onefile --console --name CTAD-Upload-Auto ctad_upload.py
if not exist "dist\CTAD-Upload-Auto.exe" (
  echo ERRO: o exe nao foi gerado. Veja as mensagens acima.
  pause
  exit /b 1
)
echo [3/4] Publicando em downloads/ ...
if not exist "..\downloads" mkdir "..\downloads"
copy /y "config.json" "..\downloads\CTAD-Upload-Auto-config-modelo.json"
echo [4/4] Compactando v%VERSAO% (.zip — o Hosting proibe .exe puro) ...
powershell -NoProfile -Command "Compress-Archive -Path 'dist\CTAD-Upload-Auto.exe','..\downloads\CTAD-Upload-Auto-config-modelo.json' -DestinationPath '..\downloads\CTAD-Upload-Auto-v%VERSAO%.zip' -Force"
echo.
echo Pronto! CTAD\downloads\CTAD-Upload-Auto-v%VERSAO%.zip — faca deploy (firebase deploy) para liberar no site.
pause
