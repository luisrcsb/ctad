@echo off
REM CTAD Upload Auto — gera o executavel e publica em downloads/
set VERSAO=1.2.1
cd /d "%~dp0"
echo [1/5] Instalando dependencias...
call python -m pip install -r requirements.txt pyinstaller
echo [2/5] Gerando CTAD-Upload-Auto.exe v%VERSAO% (pode demorar alguns minutos)...
call python -m PyInstaller --noconfirm --onefile --console --name CTAD-Upload-Auto ctad_upload.py
if not exist "dist\CTAD-Upload-Auto.exe" (
  echo ERRO: o exe nao foi gerado. Veja as mensagens acima.
  pause
  exit /b 1
)
echo [3/5] Publicando em downloads/ ...
if not exist "..\downloads" mkdir "..\downloads"
copy /y "config.json" "..\downloads\CTAD-Upload-Auto-config-modelo.json"
copy /y "LEIA-ME.txt" "..\downloads\LEIA-ME-CTAD-Upload-Auto.txt"
copy /y "atualizador.bat" "..\downloads\atualizador.bat"
echo [4/5] Compactando v%VERSAO% (.zip — o Hosting proibe .exe puro) ...
powershell -NoProfile -Command "Compress-Archive -Path 'dist\CTAD-Upload-Auto.exe','..\downloads\CTAD-Upload-Auto-config-modelo.json','LEIA-ME.txt','atualizador.bat' -DestinationPath '..\downloads\CTAD-Upload-Auto-v%VERSAO%.zip' -Force"
echo [5/5] Gerando versao.json (autoatualizacao) ...
python -c "import json,hashlib; z=r'..\downloads\CTAD-Upload-Auto-v%VERSAO%.zip'; h=hashlib.sha256(open(z,'rb').read()).hexdigest().upper(); json.dump({'versao':'%VERSAO%','zip':'downloads/CTAD-Upload-Auto-v%VERSAO%.zip','sha256':h,'notas':'Autoatualizacao com confirmacao + retry de falhas reprocessa','obrigatoria':False}, open(r'..\downloads\versao.json','w'), indent=2); print('versao.json OK', h[:16])"
echo.
echo Pronto! CTAD\downloads\CTAD-Upload-Auto-v%VERSAO%.zip — faca deploy (firebase deploy) para liberar no site.
pause
