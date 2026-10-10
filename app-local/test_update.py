"""Testa a autoatualização sem tocar no app real.

Sobe HTTP local servindo versao.json + zip falso (com atualizador.bat de
 mentira e um marcador), e valida: comparação de versões, detecção de update,
download com sha ok, rejeição com sha errado e extração do atualizador.
O .bat real é testado à parte em sandbox (ver teste_bat_sandbox abaixo).
"""
import hashlib
import http.server
import io
import json
import os
import sys
import tempfile
import threading
import zipfile

DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIR)

import autoupdate


def construir_zip_falso(destino):
    with zipfile.ZipFile(destino, "w") as z:
        z.writestr("atualizador.bat", "@echo off\r\nREM falso\r\n")
        z.writestr("marcador.txt", "novo")
    with open(destino, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest().upper()


class H(http.server.BaseHTTPRequestHandler):
    ZIP = None
    SHA = ""
    VERSAO = "9.9.9"

    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith("/downloads/versao.json"):
            corpo = json.dumps({"versao": H.VERSAO, "zip": "downloads/up.zip",
                                "sha256": H.SHA, "notas": "teste",
                                "obrigatoria": False}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)
        elif self.path.startswith("/downloads/up.zip"):
            with open(H.ZIP, "rb") as f:
                corpo = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Length", str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)
        else:
            self.send_response(404)
            self.end_headers()


def main():
    tmp = tempfile.mkdtemp(prefix="ctad-upd-test-")
    zipp = os.path.join(tmp, "up.zip")
    sha = construir_zip_falso(zipp)
    H.ZIP, H.SHA = zipp, sha
    srv = http.server.HTTPServer(("127.0.0.1", 8776), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:8776"
    cfg = {"update_url": base + "/downloads/versao.json", "timeout_segundos": 10}

    # 1. comparação de versões
    assert autoupdate.versao_maior("1.2.0", "1.1.3")
    assert not autoupdate.versao_maior("1.1.3", "1.1.3")
    assert not autoupdate.versao_maior("1.1.3", "1.2.0")
    assert autoupdate.versao_maior("v2.0", "1.9.9")
    assert autoupdate.parse_versao("v1.2.0") == (1, 2, 0)
    print("VERSAO-OK")

    # 2. checar() acha update e respeita versão igual
    info = autoupdate.checar(cfg, "1.1.3")
    assert info and info["versao"] == "9.9.9", info
    H.VERSAO = "1.1.3"
    assert autoupdate.checar(cfg, "1.1.3") is None, "não devia achar update"
    H.VERSAO = "9.9.9"
    print("CHECK-OK")

    # 3. download + sha ok / sha errado
    dest = os.path.join(tmp, "baixo.zip")
    autoupdate.baixar_e_verificar(info, cfg, dest)
    assert os.path.exists(dest)
    info_ruim = dict(info, sha256="0" * 64)
    try:
        autoupdate.baixar_e_verificar(info_ruim, cfg, dest + "2")
        raise SystemExit("devia ter rejeitado sha errado")
    except ValueError:
        pass
    print("DOWNLOAD-OK")

    # 4. extrai atualizador.bat do próprio zip
    bat = autoupdate.extrair_atualizador(dest, tmp)
    assert os.path.exists(bat) and bat.lower().endswith(".bat"), bat
    print("EXTRACT-OK")

    # 5. fora do .exe, outras_copias() é sempre [] (nunca mata python.exe)
    assert autoupdate.outras_copias() == []
    print("SEGURANCA-OK")
    srv.shutdown()
    print("UPDATE-OK")


if __name__ == "__main__":
    main()
