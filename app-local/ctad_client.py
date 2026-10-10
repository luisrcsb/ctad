"""Cliente Firebase do app local CTAD — autentica COMO O SITE FAZ.

O site usa Firebase Auth (signInWithEmailAndPassword). Aqui replicamos via
REST do Identity Toolkit: login com e-mail/senha de uma conta com nivel
(superuser/admin/gestor), refresh automatico do idToken, e escrita via
REST do Realtime Database + upload ao Storage com o token do usuario
(respeitando as regras — sem chave de servico).
"""
import time

import requests


class ErroAuth(Exception):
    pass


class ErroBanco(Exception):
    pass


NIVEIS_UPLOAD = ("superuser", "admin", "gestor")


class CtadClient:
    def __init__(self, cfg):
        fb = cfg.get("firebase", {})
        urls = cfg.get("auth_urls", {})
        self.apikey = fb.get("apiKey", "")
        self.db = fb.get("databaseURL", "").rstrip("/")
        self.bucket = fb.get("storageBucket", "")
        self.identity = urls.get("identity", "https://identitytoolkit.googleapis.com/v1")
        self.secure = urls.get("securetoken", "https://securetoken.googleapis.com/v1")
        self.storage_base = urls.get("storage", "https://firebasestorage.googleapis.com/v0")
        self.email = cfg.get("email", "")
        self.password = cfg.get("password", "")
        self.timeout = int(cfg.get("timeout_segundos", 60))
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": "CTAD-Upload-Auto/1.0"})
        self.id_token = None
        self.refresh_token = None
        self.uid = None
        self.expira_em = 0
        self.nivel = None

    # ----- autenticacao (igual ao site) -----
    def login(self):
        """signInWithPassword + checagem de nivel (espelha regras do banco)."""
        try:
            r = self.s.post(f"{self.identity}/accounts:signInWithPassword",
                            params={"key": self.apikey},
                            json={"email": self.email, "password": self.password,
                                  "returnSecureToken": True},
                            timeout=self.timeout)
        except requests.RequestException as e:
            raise ErroAuth(f"Sem conexao com o Auth: {e}")
        if r.status_code != 200:
            detalhe = ""
            try:
                detalhe = r.json().get("error", {}).get("message", "")
            except ValueError:
                pass
            raise ErroAuth(f"Login recusado ({r.status_code} {detalhe}). "
                           "Confira e-mail/senha da conta.")
        js = r.json()
        self.id_token = js["idToken"]
        self.refresh_token = js["refreshToken"]
        self.uid = js["localId"]
        self.expira_em = time.time() + int(js.get("expiresIn", "3600"))
        self.nivel = self._verificar_acesso()
        return self.nivel

    def _verificar_acesso(self):
        """Conta precisa de nivel com escrita em baterias (ou admins legada)."""
        nivel = self.rtdb_get(f"usuarios/{self.uid}/nivel")
        if nivel in NIVEIS_UPLOAD:
            return nivel
        legado = self.rtdb_get(f"admins/{self.uid}")
        if legado is True:
            return "admin"
        raise ErroAuth(f"Conta '{self.email}' sem nivel de upload (nivel={nivel}). "
                       "Peca ao superuser para aprovar/vincular a conta.")

    def _token(self):
        if not self.id_token:
            self.login()
        elif time.time() > self.expira_em - 300:
            try:
                r = self.s.post(f"{self.secure}/token",
                                params={"key": self.apikey},
                                data={"grant_type": "refresh_token",
                                      "refresh_token": self.refresh_token},
                                timeout=self.timeout)
                r.raise_for_status()
                js = r.json()
                self.id_token = js["id_token"]
                self.refresh_token = js.get("refresh_token", self.refresh_token)
                self.expira_em = time.time() + int(js.get("expires_in", "3600"))
            except requests.RequestException:
                self.login()  # refresh falhou: login cheio de novo
        return self.id_token

    # ----- Realtime Database via REST -----
    def rtdb_get(self, caminho, params=None):
        q = dict(params or {})
        q["auth"] = self._token()
        try:
            r = self.s.get(f"{self.db}/{caminho}.json", params=q, timeout=self.timeout)
        except requests.RequestException as e:
            raise ErroBanco(f"Falha de conexao ao ler {caminho}: {e}")
        if r.status_code in (401, 403):
            self.login()
            q["auth"] = self.id_token
            r = self.s.get(f"{self.db}/{caminho}.json", params=q, timeout=self.timeout)
        if r.status_code != 200:
            corpo = ""
            try:
                corpo = (r.json().get("error", "") if "application/json" in r.headers.get("Content-Type", "") else r.text[:200]) or ""
            except ValueError:
                corpo = r.text[:200]
            raise ErroBanco(f"Leitura {caminho} -> HTTP {r.status_code} {corpo}")
        return r.json()

    def rtdb_put(self, caminho, dados):
        try:
            r = self.s.put(f"{self.db}/{caminho}.json", params={"auth": self._token()},
                           json=dados, timeout=self.timeout)
        except requests.RequestException as e:
            raise ErroBanco(f"Falha de conexao ao gravar {caminho}: {e}")
        if r.status_code in (401, 403):
            self.login()
            r = self.s.put(f"{self.db}/{caminho}.json", params={"auth": self.id_token},
                           json=dados, timeout=self.timeout)
        if r.status_code != 200:
            raise ErroBanco(f"Gravacao {caminho} -> HTTP {r.status_code}: {r.text[:200]}")
        return True

    def rtdb_delete(self, caminho):
        r = self.s.delete(f"{self.db}/{caminho}.json", params={"auth": self._token()},
                          timeout=self.timeout)
        if r.status_code != 200:
            raise ErroBanco(f"Exclusao {caminho} -> HTTP {r.status_code}")
        return True

    def existe_hash(self, file_hash):
        """Dedup igual ao site: baterias com mesmo fileHash."""
        js = self.rtdb_get("baterias", params={"orderBy": '"fileHash"',
                                               "equalTo": f'"{file_hash}"',
                                               "limitToFirst": 1})
        if js:
            chave, reg = next(iter(js.items()))
            return True, (reg.get("nomeArquivoOriginal") or reg.get("sessao") or chave)
        return False, None

    def salvar_bateria(self, bat_key, upload_data, resumo):
        self.rtdb_put(f"baterias/{bat_key}", upload_data)
        try:
            self.rtdb_put(f"publicResumo/baterias/{bat_key}", resumo)
        except ErroBanco as e:
            raise ErroBanco(f"Bateria salva, mas resumo falhou: {e}")
        self.rtdb_put(f"uploadLog/{bat_key}",
                      {"uid": self.uid, "acao": "upload", "bateriaKey": bat_key,
                       "fileHash": upload_data.get("fileHash"),
                       "timestamp": int(time.time() * 1000)})

    # ----- Storage (melhor esforco: regras padrao podem negar) -----
    def storage_upload(self, nome_remoto, conteudo, mime):
        """Sobe o arquivo original p/ uploads/<batKey>/<arq>. Retorna True/False."""
        try:
            r = self.s.post(f"{self.storage_base}/b/{self.bucket}/o",
                            params={"uploadType": "media", "name": nome_remoto},
                            headers={"Authorization": f"Firebase {self._token()}",
                                     "Content-Type": mime},
                            data=conteudo, timeout=self.timeout)
        except requests.RequestException as e:
            raise ErroBanco(f"Falha de conexao no Storage: {e}")
        if r.status_code in (401, 403):
            return False  # regras do Storage nao liberam: segue so com o banco
        if r.status_code not in (200,):
            raise ErroBanco(f"Storage -> HTTP {r.status_code}: {r.text[:200]}")
        return True

    def testar_conexao(self):
        nivel = self.login()
        return {"nivel": nivel, "uid": self.uid}
