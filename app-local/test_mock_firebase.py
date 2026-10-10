"""Mock do Firebase (Auth + RTDB + Storage) p/ teste fim a fim do app local.

Uso: python test_mock_firebase.py   (roda o autoteste)
     python test_mock_firebase.py --servir [porta]
"""
import http.server
import json
import os
import threading
import urllib.parse

DIR = os.path.dirname(os.path.abspath(__file__))
EMAIL, SENHA, UID = "admin@ctad.test", "segredo123", "uid-teste-1"
ID1, RF1 = "MOCK-ID-1", "MOCK-REFRESH-1"
ID2, RF2 = "MOCK-ID-2", "MOCK-REFRESH-2"

BANCO = {"usuarios": {UID: {"nivel": "admin"}}, "admins": {},
         "baterias": {}, "publicResumo": {"baterias": {}}, "uploadLog": {}}
ARQUIVOS = {}


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _corpo(self):
        n = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(n) if n else b""

    def _json(self, obj, status=200):
        corpo = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _auth_ok(self, q):
        return q.get("auth", [""])[0] in (ID1, ID2)

    # ---- Auth ----
    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(url.query)
        corpo = self._corpo()
        if url.path == "/v1/accounts:signInWithPassword":
            try:
                js = json.loads(corpo or b"{}")
            except ValueError:
                js = {}
            if js.get("email") == EMAIL and js.get("password") == SENHA:
                self._json({"idToken": ID1, "refreshToken": RF1,
                            "localId": UID, "expiresIn": "3600"})
            else:
                self._json({"error": {"message": "INVALID_PASSWORD"}}, 400)
            return
        if url.path == "/v1/token":
            form = urllib.parse.parse_qs(corpo.decode())
            if form.get("refresh_token", [""])[0] in (RF1, RF2):
                self._json({"id_token": ID2, "refresh_token": RF2,
                            "expires_in": "3600"})
            else:
                self._json({"error": "invalid_grant"}, 400)
            return
        # Storage: /v0/b/<bucket>/o?uploadType=media&name=...
        if url.path.startswith("/v0/b/") and url.path.endswith("/o"):
            if self.headers.get("Authorization", "") not in (f"Firebase {ID1}", f"Firebase {ID2}"):
                self._json({"error": "permissao negada"}, 403)
                return
            ARQUIVOS[q.get("name", ["?"])[0]] = corpo
            self._json({"name": q.get("name", ["?"])[0], "size": len(corpo)})
            return
        self.send_response(404)
        self.end_headers()

    # ---- RTDB ----
    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(url.query)
        if not self._auth_ok(q):
            self._json({"error": "auth invalido"}, 401)
            return
        caminho = url.path[1:].removesuffix(".json")
        if caminho == "baterias" and "orderBy" in q:  # dedup por fileHash
            alvo = (q.get("equalTo", ['""'])[0] or "").strip('"')
            achados = {k: v for k, v in BANCO["baterias"].items()
                       if v.get("fileHash") == alvo}
            chaves = list(achados)[:int(q.get("limitToFirst", ["1"])[0] or 1)]
            self._json({k: achados[k] for k in chaves})
            return
        no = BANCO
        for parte in caminho.split("/"):
            no = (no or {}).get(parte)
        self._json(no)

    def do_PUT(self):
        url = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(url.query)
        if not self._auth_ok(q):
            self._json({"error": "auth invalido"}, 401)
            return
        caminho = url.path[1:].removesuffix(".json")
        try:
            valor = json.loads(self._corpo() or b"null")
        except ValueError:
            self._json({"error": "json invalido"}, 400)
            return
        no = BANCO
        partes = caminho.split("/")
        for parte in partes[:-1]:
            no = no.setdefault(parte, {})
        no[partes[-1]] = valor
        self._json(valor)

    def do_DELETE(self):
        url = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(url.query)
        if not self._auth_ok(q):
            self._json({"error": "auth invalido"}, 401)
            return
        caminho = url.path[1:].removesuffix(".json")
        no = BANCO
        partes = caminho.split("/")
        for parte in partes[:-1]:
            no = no.get(parte, {})
        no.pop(partes[-1], None)
        self._json(None)


def autoteste():
    import sys
    import tempfile
    sys.path.insert(0, DIR)
    import ctad_upload as app
    from ctad_client import CtadClient

    srv = http.server.HTTPServer(("127.0.0.1", 8775), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:8775"
    cfg = {"firebase": {"apiKey": "fake", "databaseURL": base, "storageBucket": "fake"},
           "auth_urls": {"identity": base + "/v1", "securetoken": base + "/v1",
                         "storage": base + "/v0"},
           "email": EMAIL, "password": SENHA, "pasta": tempfile.mkdtemp(),
           "intervalo_segundos": 15, "tempo_real": False, "extensoes": [".html"],
           "pistaId": "krathus", "mover_para_enviados": False, "apagar_remoto": False,
           "tentativas": 2, "timeout_segundos": 10, "log_nivel": "ERROR"}

    cli = CtadClient(cfg)
    info = cli.testar_conexao()
    assert info["nivel"] == "admin", info

    # refresh forcado
    cli.expira_em = 0
    cli._token()
    assert cli.id_token == ID2, "refresh nao trocou o token"

    # fixture zround em subpasta
    os.makedirs(os.path.join(cfg["pasta"], "treino"))
    with open(os.path.join(cfg["pasta"], "treino", "bat1.html"), "w", encoding="utf-8") as f:
        f.write("<html><body><p>ZRound</p><p>Pos Piloto Voltas Tempo</p>"
                "<p>1º EDGARD 3 8,123</p><p>2º LUIS 3 8,456</p>"
                "<p>Volta por piloto</p><p>1 8,500 8,700</p>"
                "<p>2 8,300 8,600</p><p>3 8,123 8,456</p></body></html>")

    log = app.montar_log("ERROR")
    up = app.Uploader(cfg, log)
    up.ciclo()
    assert len(BANCO["baterias"]) == 1, BANCO["baterias"]
    bat = next(iter(BANCO["baterias"].values()))
    assert bat["pistaId"] == "krathus" and len(bat["dados"]) == 2, bat
    assert len(BANCO["publicResumo"]["baterias"]) == 1
    assert len(BANCO["uploadLog"]) == 1
    assert len(ARQUIVOS) == 1, "storage nao recebeu o arquivo"

    up.ciclo()  # idempotente
    assert len(BANCO["baterias"]) == 1, "duplicou!"

    os.remove(os.path.join(cfg["pasta"], "treino", "bat1.html"))
    up.ciclo()  # exclusao detectada (sem apagar remoto por padrao)
    assert len(BANCO["baterias"]) == 1
    print("AUTOTESTE FIREBASE OK | login+refresh+upload+dedup+storage+exclusao")
    srv.shutdown()


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--servir":
        porta = int(sys.argv[2]) if len(sys.argv) > 2 else 8775
        print(f"Mock Firebase em http://127.0.0.1:{porta} ({EMAIL}/{SENHA})")
        http.server.HTTPServer(("127.0.0.1", porta), H).serve_forever()
    else:
        autoteste()
