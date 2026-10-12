; ---------------------------------------------------------------------------
; CTAD Upload Auto - Instalador Windows (Inno Setup 6)
; Gera um Setup.exe padrao Windows: assistente, atalhos, entrada em
; "Aplicativos e recursos" com desinstalador e upgrade entre versoes.
;
; Compilar: build-installer.bat   (le a versao de ctad_upload.py: APP_VERSAO)
;
; Instalacao POR USUARIO (LocalAppData\Programs): o app grava config.json,
; upload-auto.log, .estado.json e enviados\ ao lado do executavel - por isso
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
VersionInfoDescription={#MyAppNameVer} - Instalador
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
Name: desktopicon; Description: "Criar atalho na area de trabalho"; GroupDescription: "Atalhos:"
Name: autostart; Description: "Iniciar o monitor junto com o Windows (operacao 24h)"; GroupDescription: "Inicializacao:"; Flags: unchecked

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
; Pagina customizada para credenciais + pasta vigiada + ZRound (ASCII only)
[Code]
var
  CredPage: TInputQueryWizardPage;
  PastaPage: TInputQueryWizardPage;
  ZRoundPage: TInputQueryWizardPage;
  SkipCredValidation: Boolean;

function CredPageValidate(Sender: TWizardPage): Boolean;
var
  Email, Senha: String;
begin
  Result := True;
  Email := Trim(CredPage.Values[0]);
  Senha := CredPage.Values[1];
  if (Email = '') or (Senha = '') then
  begin
    MsgBox('E-mail e senha sao obrigatorios para validar a conexao.', mbError, MB_OK);
    Result := False;
  end
  else if Pos('@', Email) = 0 then
  begin
    MsgBox('E-mail invalido.', mbError, MB_OK);
    Result := False;
  end;
end;

function PastaPageValidate(Sender: TWizardPage): Boolean;
var
  Pasta: String;
begin
  Result := True;
  Pasta := Trim(PastaPage.Values[0]);
  if Pasta = '' then
  begin
    MsgBox('Informe a pasta vigiada.', mbError, MB_OK);
    Result := False;
  end;
end;

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
    if MsgBox('Foi encontrada uma instalacao antiga do ' +
      ExpandConstant('{#MyAppName}') + ' (instalador anterior).' + #13#10 +
      'Deseja remove-la automaticamente antes de continuar?' + #13#10#13#10 +
      'Isso nao afeta suas configuracoes: a nova instalacao comeca em uma pasta nova.',
      mbConfirmation, MB_YESNO) = IDYES then
    begin
      Exec(oldUnins, '/S', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Sleep(500);
    end;
  end;
end;

procedure InitializeWizard();
var
  PastaPadrao: String;
begin
  SkipCredValidation := False;

  // Pagina de credenciais (apos SelectDir)
  CredPage := CreateInputQueryPage(wpSelectDir,
    'Credenciais do CTAD', 'Informe a conta com permissao de upload (admin/gestor).',
    'A conta precisa ter nivel "admin", "gestor" ou "superuser" no painel do CTAD.');

  CredPage.Add('E-mail:', False);
  CredPage.Add('Senha:', True);
  CredPage.Values[0] := '';
  CredPage.Values[1] := '';
  CredPage.OnNextButtonClick := @CredPageValidate;

  // Pagina da pasta vigiada (apos credenciais)
  PastaPage := CreateInputQueryPage(wpSelectDir,
    'Pasta Vigiada', 'Defina a pasta onde os relatorios ZRound serao gerados.',
    'Pode ser local (C:\telemetria) ou rede (\\servidor\pasta).');

  PastaPage.Add('Pasta:', False);
  PastaPadrao := ExpandConstant('{sd}\telemetria');
  if not DirExists(PastaPadrao) then
    PastaPadrao := 'C:\telemetria';
  PastaPage.Values[0] := PastaPadrao;
  PastaPage.OnNextButtonClick := @PastaPageValidate;

  // Pagina do executavel do ZRound (opcional)
  ZRoundPage := CreateInputQueryPage(wpSelectDir,
    'Executavel do ZRound (Opcional)', 'Informe o caminho do ZRound.exe para abrir pelo CTAD.',
    'Ex: C:\Program Files\ZRound\ZRound.exe. Deixe vazio se nao quiser integrar.');

  ZRoundPage.Add('ZRound.exe:', False);
  ZRoundPage.Values[0] := '';
  // Nao valida - e opcional
end;

// Funcao auxiliar para escapar string para JSON
function JsonEscape(const S: String): String;
var
  i: Integer;
  c: Char;
begin
  Result := '';
  for i := 1 to Length(S) do
  begin
    c := S[i];
    case c of
      '"': Result := Result + '\' + '"';
      '\': Result := Result + '\\';
      chr(13): Result := Result + '\r';
      chr(10): Result := Result + '\n';
      chr(9): Result := Result + '\t';
      chr(8): Result := Result + '\b';
      chr(12): Result := Result + '\f';
    else
      Result := Result + c;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  CfgPath, Json, Email, Senha, Pasta, ZRoundExe: String;
  ResultCode: Integer;
  i: Integer;
  PastaEscaped: String;
  JsonLines: TArrayOfString;
begin
  if CurStep = ssPostInstall then
  begin
    CfgPath := ExpandConstant('{app}\config.json');

    Email := Trim(CredPage.Values[0]);
    Senha := CredPage.Values[1];
    Pasta := Trim(PastaPage.Values[0]);
    ZRoundExe := Trim(ZRoundPage.Values[0]);

    // Cria o JSON completo com as credenciais informadas
    // Converte \ para / (valido no Windows e JSON, evita problemas de escape)
    PastaEscaped := '';
    for i := 1 to Length(Pasta) do
    begin
      if Pasta[i] = '\' then
        PastaEscaped := PastaEscaped + '/'
      else
        PastaEscaped := PastaEscaped + Pasta[i];
    end;
    Pasta := PastaEscaped;

    // Converte \ para / no ZRoundExe tbm
    ZRoundExe := '';
    for i := 1 to Length(Trim(ZRoundPage.Values[0])) do
    begin
      if Trim(ZRoundPage.Values[0])[i] = '\' then
        ZRoundExe := ZRoundExe + '/'
      else
        ZRoundExe := ZRoundExe + Trim(ZRoundPage.Values[0])[i];
    end;

    // Escapa valores para JSON valido
    Email := JsonEscape(Email);
    Senha := JsonEscape(Senha);
    Pasta := JsonEscape(Pasta);
    ZRoundExe := JsonEscape(ZRoundExe);

    // Monta JSON como array de linhas para gravar com UTF-8 sem BOM
    JsonLines := ['{',
      '  "firebase": {',
      '    "apiKey": "AIzaSyDCTkeIa6QsY2zYs8S__HlIwcY-zcuhZCA",',
      '    "databaseURL": "https://krathus-telemetria-default-rtdb.firebaseio.com",',
      '    "storageBucket": "krathus-telemetria.firebasestorage.app"',
      '  },',
      '  "email": "' + Email + '",',
      '  "password": "' + Senha + '",',
      '  "pasta": "' + Pasta + '",',
      '  "zround_exe": "' + ZRoundExe + '",',
      '  "intervalo_segundos": 15,',
      '  "tempo_real": true,',
      '  "extensoes": [".pdf", ".html", ".htm"],',
      '  "pistaId": "krathus",',
      '  "mover_para_enviados": true,',
      '  "apagar_remoto": false,',
      '  "tentativas": 4,',
      '  "timeout_segundos": 60,',
      '  "log_nivel": "INFO",',
      '  "atualizar_auto": true,',
      '  "update_url": "https://krathus-telemetria.web.app/downloads/versao.json",',
      '  "auto_iniciar_monitor": false,',
      '  "iniciar_com_windows": false',
      '}'];

    // Grava UTF-8 sem BOM
    SaveStringsToUTF8FileWithoutBOM(CfgPath, JsonLines, False);

    // Valida conexao rodando o exe com --testar-conexao (console app)
    if not SkipCredValidation then
    begin
      if Exec(ExpandConstant('{app}\{#MyAppExeName}'),
              '--testar-conexao --no-pause',
              ExpandConstant('{app}'),
              SW_HIDE, ewWaitUntilTerminated, ResultCode) then
      begin
        if ResultCode <> 0 then
        begin
          MsgBox('Aviso: Falha ao validar as credenciais com o servidor.'#13#10#13#10 +
            'Codigo de saida: ' + IntToStr(ResultCode) + #13#10#13#10 +
            'A instalacao continuara. Voce podera corrigir as credenciais depois'#13#10 +
            'executando: CTAD-Upload-Auto.exe --configurar',
            mbInformation, MB_OK);
        end;
      end
      else
      begin
        MsgBox('Aviso: Nao foi possivel executar a validacao automatica.'#13#10#13#10 +
          'Verifique a conexao com a internet. Voce podera configurar depois'#13#10 +
          'executando: CTAD-Upload-Auto.exe --configurar',
          mbInformation, MB_OK);
      end;
    end;

    // Cria pasta vigiada se nao existir
    if not DirExists(Pasta) then
      CreateDir(Pasta);
  end;
end;