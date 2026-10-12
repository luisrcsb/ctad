; ---------------------------------------------------------------------------
; CTAD Upload Auto — Instalador Windows (Inno Setup 6)
; Gera um Setup.exe padrao Windows: assistente, atalhos, entrada em
; "Aplicativos e recursos" com desinstalador e upgrade entre versoes.
;
; Compilar: build-installer.bat   (le a versao de ctad_upload.py: APP_VERSAO)
;
; Instalacao POR USUARIO (LocalAppData\Programs): o app grava config.json,
; upload-auto.log, .estado.json e enviados\ ao lado do executavel — por isso
; NAO vai para "Arquivos de Programas" (protegido p/ usuarios padrao).
; ---------------------------------------------------------------------------
#ifndef MyAppVersion
  #define MyAppVersion "1.2.3"
#endif
#define MyAppName "CTAD Upload Auto"
#define MyAppNameVer MyAppName + " " + MyAppVersion
#define MyAppPublisher "CTAD Team"
#define MyAppURL "https://krathus-telemetria.web.app"
#define MyAppExeName "CTAD-Upload-Auto.exe"
#define MyAppDirName "CTAD\CTAD Upload Auto"

[Setup]
; AppId fixo: identifica o app nas atualizacoes (nao trocar entre versoes)
AppId={{8F3A2C41-9E7B-4D5A-B6C8-2E1F0A9D4B77}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppNameVer}
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppNameVer} — Instalador
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\{#MyAppDirName}
DefaultGroupName=CTAD
DisableProgramGroupPage=yes
AllowNoIcons=yes
LicenseFile=LICENSE.txt
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
CloseApplications=yes
RestartApplications=no
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
OutputDir=dist
OutputBaseFilename=CTAD-Upload-Auto-Setup-{#MyAppVersion}
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName} {#MyAppVersion}

[Languages]
Name: brasilianportuguese; MessagesFile: compiler:Languages\BrazilianPortuguese.isl

[Tasks]
Name: desktopicon; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos:"
Name: autostart; Description: "Iniciar o monitor junto com o Windows (operação 24h)"; GroupDescription: "Inicialização:"; Flags: unchecked

[Files]
Source: "dist\CTAD-Upload-Auto.exe"; DestDir: "{app}"; Flags: ignoreversion
; config.json: so cria se nao existir (nunca sobrescreve a config do usuario)
Source: "config.json"; DestDir: "{app}"; Flags: onlyifdoesntexist
Source: "LEIA-ME.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "LICENSE.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "atualizador.bat"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Site do CTAD"; Filename: "{#MyAppURL}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\CTAD\CTAD Upload Auto"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "CTAD-Upload-Auto"; ValueData: """{app}\{#MyAppExeName}"" --monitor --no-pause"; Tasks: autostart; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir o painel do {#MyAppName}"; Flags: nowait postinstall skipifsilent

; Desinstalacao limpa: remove tudo, inclusive config (tem senha), logs e enviados
[UninstallDelete]
Type: filesandordirs; Name: "{app}"

; Migracao: se existir a instalacao antiga (NSIS) em Program Files,
; oferece remove-la antes de prosseguir (evita ficar com duas copias).
[Code]
function InitializeSetup(): Boolean;
var
  oldUnins: String;
  ResultCode: Integer;
begin
  Result := True;
  oldUnins := ExpandConstant('{commonpf}\CTAD\Upload Auto\uninstall.exe');
  if not FileExists(oldUnins) then
    oldUnins := ExpandConstant('{pf}\CTAD\Upload Auto\uninstall.exe');
  if FileExists(oldUnins) then
  begin
    if MsgBox('Foi encontrada uma instalação antiga do ' +
      ExpandConstant('{#MyAppName}') + ' (instalador anterior).' + #13#10 +
      'Deseja removê-la automaticamente antes de continuar?' + #13#10#13#10 +
      'Isso não afeta suas configurações: a nova instalação começa em uma pasta nova.',
      mbConfirmation, MB_YESNO) = IDYES then
    begin
      Exec(oldUnins, '/S', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Sleep(500);
    end;
  end;
end;
