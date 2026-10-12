#!/usr/bin/env python3
"""Sincroniza a secao "Downloads" do site com os artefatos reais.

Fonte unica da versao: APP_VERSAO em ctad_upload.py.
Entradas usadas:
  - downloads/versao.json ............... sha256 do .zip portatil (gerado por build-exe.bat)
  - downloads/CTAD-Upload-Auto-Setup-<v>.zip ... sha256 calculado aqui

Regrava, de forma idempotente:
  - index.html: window.APP_LOCAL_VERSAO, links de download e os SHA-256 exibidos;
  - manuais.js: nome do arquivo do instalador e a versao citada no texto.

Uso:  python publicar_downloads.py
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent
RAIZ = APP.parent
DOWNLOADS = RAIZ / "downloads"
INDEX = RAIZ / "index.html"
MANUAIS = RAIZ / "manuais.js"
CTAD_UPLOAD = APP / "ctad_upload.py"


def sha256(arquivo: Path) -> str:
    h = hashlib.sha256()
    with arquivo.open("rb") as f:
        for bloco in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloco)
    return h.hexdigest().upper()


def versao_app() -> str:
    m = re.search(r'APP_VERSAO\s*=\s*["\']([0-9][0-9.]*)["\']',
                  CTAD_UPLOAD.read_text(encoding="utf-8"))
    if not m:
        raise SystemExit("ERRO: APP_VERSAO nao encontrado em ctad_upload.py")
    return m.group(1)


def substituir(texto: str, padrao: str, novo: str, arquivo: str) -> str:
    texto, n = re.subn(padrao, novo, texto, count=1)
    if n != 1:
        raise SystemExit(f"ERRO: padrao nao encontrado (1x) em {arquivo}: {padrao}")
    return texto


def main() -> int:
    ver = versao_app()
    zip_portatil = DOWNLOADS / f"CTAD-Upload-Auto-v{ver}.zip"
    zip_setup = DOWNLOADS / f"CTAD-Upload-Auto-Setup-{ver}.zip"

    # Portatil: prefere o sha registrado em versao.json (fonte do autoupdate).
    sha_portatil = None
    versao_json = DOWNLOADS / "versao.json"
    if versao_json.exists():
        try:
            dados = json.loads(versao_json.read_text(encoding="utf-8"))
            if str(dados.get("versao")) == ver:
                sha_portatil = str(dados.get("sha256", "")).upper() or None
        except (ValueError, OSError):
            sha_portatil = None
    if not sha_portatil and zip_portatil.exists():
        sha_portatil = sha256(zip_portatil)
    if not sha_portatil:
        raise SystemExit(
            f"ERRO: sem sha256 do portatil (nem versao.json valido nem {zip_portatil.name})")

    if not zip_setup.exists():
        raise SystemExit(
            f"ERRO: instalador nao encontrado: {zip_setup}\n"
            "Rode antes:  build-installer.bat")
    sha_setup = sha256(zip_setup)

    # index.html (preserva bytes/CRLF: substitui no texto decodificado)
    html = INDEX.read_bytes().decode("utf-8")
    html = substituir(html, r"window\.APP_LOCAL_VERSAO\s*=\s*'[^']*';",
                      f"window.APP_LOCAL_VERSAO = '{ver}';", "index.html")
    html = substituir(html, r"downloads/CTAD-Upload-Auto-Setup-[0-9.]+\.zip",
                      f"downloads/CTAD-Upload-Auto-Setup-{ver}.zip", "index.html")
    html = substituir(html, r"downloads/CTAD-Upload-Auto-v[0-9.]+\.zip",
                      f"downloads/CTAD-Upload-Auto-v{ver}.zip", "index.html")
    html = substituir(html, r"let shaInst = '[0-9A-Fa-f]*';",
                      f"let shaInst = '{sha_setup}';", "index.html")
    html = substituir(html, r"let shaZip = '[0-9A-Fa-f]*';",
                      f"let shaZip = '{sha_portatil}';", "index.html")
    INDEX.write_bytes(html.encode("utf-8"))

    # manuais.js (se existir)
    if MANUAIS.exists():
        js = MANUAIS.read_bytes().decode("utf-8")
        js = substituir(js, r"CTAD-Upload-Auto-Setup-[0-9.]+\.zip",
                        f"CTAD-Upload-Auto-Setup-{ver}.zip", "manuais.js")
        js = substituir(js, r"(CTAD-Upload-Auto v)[0-9][0-9.]*",
                        rf"\g<1>{ver}", "manuais.js")
        MANUAIS.write_bytes(js.encode("utf-8"))

    print(f"Site atualizado para v{ver}")
    print(f"  instalador  {zip_setup.name}  {sha_setup}")
    print(f"  portatil    {zip_portatil.name}  {sha_portatil}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
