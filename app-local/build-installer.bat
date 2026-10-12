@echo off
REM CTAD Upload Auto — compila o instalador Windows (Inno Setup)
REM A versao sai de ctad_upload.py (APP_VERSAO) — fonte unica.
cd /d "%~dp0"
set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
  echo ERRO: Inno Setup nao encontrado em "%ISCC%".
  echo Instale com:  winget install --id JRSoftware.InnoSetup
  pause
  exit /b 1
)
for /f "delims=" %%V in ('python -c "import re; print(re.search(r'APP_VERSAO[^0-9]*([0-9][0-9.]*)', open('ctad_upload.py', encoding='utf-8').read()).group(1))"') do set "VERSAO=%%V"
echo Compilando instalador v%VERSAO% ...
"%ISCC%" /DMyAppVersion=%VERSAO% "CTAD-Upload-Auto.iss"
if errorlevel 1 (
  echo.
  echo ERRO na compilacao. Veja as mensagens acima.
  pause
  exit /b 1
)
echo.
echo Copiando instalador para downloads/ (copia sempre na pasta do projeto)...
copy /y "dist\CTAD-Upload-Auto-Setup-%VERSAO%.exe" "..\downloads\CTAD-Upload-Auto-Setup-%VERSAO%.exe"
echo Compactando o Setup.exe em .zip (o Hosting proibe .exe puro)...
powershell -NoProfile -Command "Compress-Archive -Path 'dist\CTAD-Upload-Auto-Setup-%VERSAO%.exe' -DestinationPath '..\downloads\CTAD-Upload-Auto-Setup-%VERSAO%.zip' -Force"
python -c "import hashlib;z=r'..\downloads\CTAD-Upload-Auto-Setup-%VERSAO%.zip';o=r'..\downloads\CTAD-Upload-Auto-Setup-%VERSAO%.sha256.txt';open(o,'w').write(hashlib.sha256(open(z,'rb').read()).hexdigest().upper()+'  CTAD-Upload-Auto-Setup-%VERSAO%.zip')"
echo Sincronizando a secao Downloads do site (versao + SHA-256)...
python "publicar_downloads.py"
if errorlevel 1 (
  echo ERRO ao atualizar index.html/manuais.js. Veja as mensagens acima.
  pause
  exit /b 1
)
echo.
echo Pronto: dist\CTAD-Upload-Auto-Setup-%VERSAO%.exe
echo Publicado em downloads\CTAD-Upload-Auto-Setup-%VERSAO%.zip (rode: firebase deploy)
pause
