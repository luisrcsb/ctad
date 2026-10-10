@echo off
REM CTAD Upload Auto — gera o executavel e publica em downloads/
cd /d "%~dp0"
echo [1/3] Instalando dependencias...
call python -m pip install -r requirements.txt pyinstaller
echo [2/3] Gerando CTAD-Upload-Auto.exe (pode demorar alguns minutos)...
call python -m PyInstaller --noconfirm --onefile --console --name CTAD-Upload-Auto ctad_upload.py
if not exist "dist\CTAD-Upload-Auto.exe" (
  echo ERRO: o exe nao foi gerado. Veja as mensagens acima.
  pause
  exit /b 1
)
echo [3/3] Publicando em downloads/ ...
if not exist "..\downloads" mkdir "..\downloads"
copy /y "dist\CTAD-Upload-Auto.exe" "..\downloads\CTAD-Upload-Auto.exe"
copy /y "config.json" "..\downloads\CTAD-Upload-Auto-config-modelo.json"
echo.
echo Pronto! Arquivos em CTAD\downloads\ — faca deploy (firebase deploy) para liberar no site.
pause
