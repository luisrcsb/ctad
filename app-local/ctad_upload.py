"""CTAD Upload Auto — app local (pode virar .exe).

Vigia pasta + subpastas (local ou UNC), converte relatorios ZRound
(PDF/HTML) e insere as baterias direto no Firebase, com as MESMAS regras
do upload manual do site: dedup por SHA-256, resumo publico e uploadLog.

Uso:
  ctad_upload.exe                      monitor continuo (tempo real + varreduras)
  ctad_upload.exe --scan-once          uma varredura e sai
  ctad_upload.exe --scan-once --dry-run
  ctad_upload.exe --testar-conexao     valida login e nivel da conta
  ctad_upload.exe --configurar         assistente de configuracao
  ctad_upload.exe --pasta "X:\\..."    outra pasta so nesta execucao

Credenciais tambem via ambiente: CTAD_EMAIL, CTAD_PASS.
"""
import argparse
import base64
import fnmatch
import getpass
import hashlib
import json
import logging
import mimetypes
import os
import sys
import threading
import time
from html.parser import HTMLParser
from logging.handlers import RotatingFileHandler

if getattr(sys, "frozen", False):
    DIR = os.path.dirname(os.path.abspath(sys.executable))  # .exe: usa a pasta do executavel
elif "__file__" in globals():
    DIR = os.path.dirname(os.path.abspath(__file__))
else:
    DIR = os.getcwd()
CONFIG_PATH = os.path.join(DIR, "config.json")
ESTADO_PATH = os.path.join(DIR, ".estado.json")
LOG_PATH = os.path.join(DIR, "upload-auto.log")

IGNORAR = ("~$*", "*.tmp", "*.temp", "Thumbs.db", ".DS_Store", "*.lock", "*.part")

try:
    import requests  # noqa: F401
except ImportError:
    print("Falta 'requests'. Rode: pip install -r requirements.txt")
    sys.exit(1)

from ctad_client import CtadClient, ErroAuth, ErroBanco  # noqa: E402
from parsers import PARSER_VERSION, parsear_texto, gerar_resumo  # noqa: E402

MAX_ARQUIVO = 25 * 1024 * 1024

#: Versão única do app (GUI, --versao e autoupdate usam esta).
APP_VERSAO = "1.2.0"

#: Modelo gravado automaticamente no primeiro uso da interface gráfica.
CONFIG_MODELO = {
    "firebase": {
        "apiKey": "AIzaSyDCTkeIa6QsY2zYs8S__HlIwcY-zcuhZCA",
        "databaseURL": "https://krathus-telemetria-default-rtdb.firebaseio.com",
        "storageBucket": "krathus-telemetria.firebasestorage.app",
    },
    "email": "",
    "password": "",
    "pasta": "C:\\telemetria",
    "intervalo_segundos": 15,
    "tempo_real": True,
    "extensoes": [".pdf", ".html", ".htm"],
    "pistaId": "krathus",
    "mover_para_enviados": True,
    "apagar_remoto": False,
    "tentativas": 4,
    "timeout_segundos": 60,
    "log_nivel": "INFO",
    "update_url": "https://krathus-telemetria.web.app/downloads/versao.json",
    "auto_iniciar_monitor": False,
    "iniciar_com_windows": False,
}

#: Versão única do app (GUI, --versao e autoupdate usam esta).
APP_VERSAO = "1.2.0"

#: Modelo gravado automaticamente no primeiro uso da interface gráfica.
CONFIG_MODELO = {
    "firebase": {
        "apiKey": "AIzaSyDCTkeIa6QsY2zYs8S__HlIwcY-zcuhZCA",
        "databaseURL": "https://krathus-telemetria-default-rtdb.firebaseio.com",
        "storageBucket": "krathus-telemetria.firebasestorage.app",
    },
    "email": "",
    "password": "",
    "pasta": "C:\\telemetria",
    "intervalo_segundos": 15,
    "tempo_real": True,
    "extensoes": [".pdf", ".html", ".htm"],
    "pistaId": "krathus",
    "mover_para_enviados": True,
    "apagar_remoto": False,
    "tentativas": 4,
    "timeout_segundos": 60,
    "log_nivel": "INFO",
}

#: Marcado via --no-pause (agendador). Sem ele, erro fatal pausa antes de sair.
SEM_PAUSA = False


def pausar_antes_de_sair():
    """Evita que a janela feche sozinha antes de dar tempo de ler o erro."""
    if SEM_PAUSA:
        return
    try:
        if sys.stdin and sys.stdin.isatty():
            input("Pressione ENTER para fechar...")
    except (EOFError, KeyboardInterrupt, OSError):
        pass


def carregar_config():
    try:
        with open(CONFIG_PATH, encoding="utf-8-sig") as f:
            cfg = json.load(f)
    except FileNotFoundError:
        print(f"[app] Nao achei {CONFIG_PATH}. Rode com --configurar ou --gui.")
        pausar_antes_de_sair()
        sys.exit(1)
    cfg["email"] = os.environ.get("CTAD_EMAIL", cfg.get("email", ""))
    cfg["password"] = os.environ.get("CTAD_PASS", cfg.get("password", ""))
    cfg["intervalo_segundos"] = max(5, int(cfg.get("intervalo_segundos", 15)))
    cfg["tentativas"] = max(1, int(cfg.get("tentativas", 4)))
    cfg["extensoes"] = [str(e).lower() for e in cfg.get("extensoes", [".pdf", ".html", ".htm"])]
    cfg.setdefault("tempo_real", True)
    cfg.setdefault("pistaId", "krathus")
    cfg.setdefault("mover_para_enviados", True)
    cfg.setdefault("apagar_remoto", False)
    cfg.setdefault("atualizar_auto", True)
    cfg.setdefault("update_url", "https://krathus-telemetria.web.app/downloads/versao.json")
    cfg.setdefault("auto_iniciar_monitor", False)
    cfg.setdefault("iniciar_com_windows", False)
    return cfg


def montar_log(nivel="INFO"):
    log = logging.getLogger("ctad-upload")
    log.setLevel(getattr(logging, str(nivel).upper(), logging.INFO))
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%d/%m/%Y %H:%M:%S")
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(fmt)
    fh = RotatingFileHandler(LOG_PATH, maxBytes=2 * 1024 * 1024, backupCount=3, encoding="utf-8")
    fh.setFormatter(fmt)
    log.handlers = [ch, fh]
    return log


def carregar_estado():
    try:
        with open(ESTADO_PATH, encoding="utf-8-sig") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return {}


def salvar_estado(estado):
    tmp = ESTADO_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(estado, f, indent=2, ensure_ascii=False)
    os.replace(tmp, ESTADO_PATH)


def sha256_arquivo(caminho, bloco=1024 * 1024):
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for pedaco in iter(lambda: f.read(bloco), b""):
            h.update(pedaco)
    return h.hexdigest()


def ignorado(nome):
    base = os.path.basename(nome)
    return base.startswith(".") or any(fnmatch.fnmatch(base, p) for p in IGNORAR)


def arquivo_estavel(caminho):
    try:
        if time.time() - os.path.getmtime(caminho) > 10:
            return True
        a = os.path.getsize(caminho)
        time.sleep(2)
        return a == os.path.getsize(caminho)
    except OSError:
        return False


class _Stripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        txt = data.strip()
        if txt:
            self.parts.append(txt)


def html_para_texto(conteudo):
    try:
        texto = conteudo.decode("utf-8")
    except UnicodeDecodeError:
        texto = conteudo.decode("latin-1")
    for tag in ("script", "style"):
        while True:
            ini = texto.lower().find(f"<{tag}")
            fim = texto.lower().find(f"</{tag}>", ini)
            if ini == -1 or fim == -1:
                break
            texto = texto[:ini] + " " + texto[fim + len(tag) + 3:]
    texto = texto.replace("<br", "\n<br").replace("</p>", "</p>\n").replace("</tr>", "</tr>\n")
    texto = texto.replace("</td>", " | </td>").replace("</th>", " | </th>")
    s = _Stripper()
    s.feed(texto)
    ent = {"&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"'}
    linhas = []
    for p in s.parts:
        for k, v in ent.items():
            p = p.replace(k, v)
        p = " ".join(p.split())
        if p:
            linhas.append(p)
    return "\n".join(linhas)


def pdf_para_texto(conteudo):
    from pypdf import PdfReader
    import io
    leitor = PdfReader(io.BytesIO(conteudo))
    paginas = []
    for pag in leitor.pages:
        try:
            paginas.append(pag.extract_text() or "")
        except Exception:
            pass
    return "\n".join(paginas)


def extrair_texto(caminho, extensao):
    with open(caminho, "rb") as f:
        conteudo = f.read()
    if len(conteudo) > MAX_ARQUIVO:
        raise ValueError("Arquivo maior que 25MB (limite do site).")
    if extensao in (".html", ".htm"):
        return conteudo, html_para_texto(conteudo)
    if extensao == ".pdf":
        return conteudo, pdf_para_texto(conteudo)
    raise ValueError("Formato nao suportado. Use PDF, HTML ou HTM.")


class Uploader:
    def __init__(self, cfg, log, dry_run=False):
        self.cfg = cfg
        self.log = log
        self.dry_run = dry_run
        self.estado = carregar_estado()
        self.lock = threading.Lock()
        self.cli = None if dry_run else CtadClient(cfg)

    # ----- varredura recursiva -----
    def varrer(self):
        pasta = self.cfg["pasta"]
        if not os.path.isdir(pasta):
            self.log.error(f"Pasta nao existe: {pasta}")
            return [], []
        novos, total = [], 0
        vistos = set()
        for raiz, _subs, arquivos in os.walk(pasta):
            if os.path.basename(raiz) == "enviados" and self.cfg.get("mover_para_enviados"):
                continue
            for nome in arquivos:
                if ignorado(nome) or not nome.lower().endswith(tuple(self.cfg["extensoes"])):
                    continue
                total += 1
                abs_path = os.path.join(raiz, nome)
                try:
                    st = os.stat(abs_path)
                except OSError:
                    continue
                rel = os.path.relpath(abs_path, pasta)
                vistos.add(rel)
                reg = self.estado.get(rel)
                if reg and reg.get("status") == "removido_local":
                    reg = None
                if (reg and reg.get("size") == st.st_size and reg.get("mtime") == st.st_mtime
                        and reg.get("status") != "falha"):
                    continue
                if reg and reg.get("status") == "falha":
                    self.log.info(f"Tentando de novo (falhou antes): {rel}")
                if not arquivo_estavel(abs_path):
                    self.log.info(f"Ainda mudando, fica p/ o proximo ciclo: {rel}")
                    continue
                try:
                    digest = sha256_arquivo(abs_path)
                except OSError as e:
                    self.log.warning(f"Nao consegui ler {rel}: {e}")
                    continue
                if reg and reg.get("sha256") == digest and reg.get("status") != "falha":
                    with self.lock:
                        self.estado[rel] = {**reg, "size": st.st_size, "mtime": st.st_mtime}
                    continue  # so metadados mudaram (falha sempre reprocessa)
                kind = "nova-tentativa" if (reg and reg.get("status") == "falha") else ("modificado" if reg else "novo")
                novos.append((abs_path, rel, st, digest, kind))
        removidos = [rel for rel, reg in self.estado.items()
                     if rel not in vistos and reg.get("status") not in ("removido_local", "falha")]
        if total:
            self.log.info(f"Varredura: {total} arquivo(s), {len(novos)} pendente(s), {len(removidos)} removido(s).")
        return novos, removidos

    # ----- conversao + insercao (regras do site) -----
    def _converter_e_enviar(self, abs_path, rel):
        nome = os.path.basename(abs_path)
        extensao = os.path.splitext(nome)[1].lower()
        sessao = nome.rsplit(".", 1)[0].strip()
        conteudo, texto = extrair_texto(abs_path, extensao)
        file_hash = hashlib.sha256(conteudo).hexdigest()

        if not self.dry_run:
            dup, de_quem = self.cli.existe_hash(file_hash)
            if dup:
                return {"status": "duplicado", "detalhe": f'duplicado de "{de_quem}"',
                        "fileHash": file_hash, "batKey": None}

        bat_key = ("bat_" + "".join(c.lower() if c.isalnum() else "_" for c in sessao)
                   + f"_{int(time.time() * 1000)}")
        formato, dados = parsear_texto(texto, sessao, bat_key)
        historico = {d["piloto"]: d["piloto"] for d in dados if d.get("piloto")}
        upload_data = {
            "bateriaKey": bat_key, "sessao": sessao, "id": int(time.time() * 1000),
            "dados": dados,
            "pdfBase64": ("data:application/octet-stream;base64,"
                          + base64.b64encode(conteudo).decode()),
            "nomeArquivoOriginal": nome, "historicoNomesOriginais": historico,
            "textoExtraido": texto,
            "statusProcessamento": ("processado" if dados else "arquivo_salvo_sem_dados"),
            "fileHash": file_hash, "parserVersion": PARSER_VERSION,
            "fileSize": len(conteudo),
            "uploadedBy": (self.cli.uid if self.cli else "dry-run"),
            "uploadedAt": int(time.time() * 1000),
            "pistaId": self.cfg.get("pistaId", "krathus"),
        }
        resumo = gerar_resumo({"firebaseKey": bat_key, **upload_data})
        if self.dry_run:
            return {"status": "simulado", "detalhe": f"formato={formato}",
                    "formato": formato, "pilotos": len(dados),
                    "fileHash": file_hash, "batKey": bat_key}

        mime = mimetypes.guess_type(nome)[0] or "application/octet-stream"
        try:
            ok_storage = self.cli.storage_upload(f"uploads/{bat_key}/{nome}", conteudo, mime)
        except ErroBanco as e:
            self.log.warning(f"Storage falhou ({e}); seguindo so com o banco.")
            ok_storage = False
        if not ok_storage:
            self.log.warning("Arquivo NAO foi p/ o Storage (regras). "
                             "Conteudo preservado em pdfBase64 no banco.")
        self.cli.salvar_bateria(bat_key, upload_data, resumo)
        return {"status": "enviado", "detalhe": f"{formato} com {len(dados)} piloto(s)",
                "formato": formato, "pilotos": len(dados),
                "fileHash": file_hash, "batKey": bat_key}

    def processar(self, novos, removidos):
        for abs_path, rel, st, digest, kind in novos:
            if self.dry_run:
                self.log.info(f"[dry-run] {kind}: {rel}")
                continue
            ok, r = False, {}
            for tentativa in range(1, self.cfg["tentativas"] + 1):
                try:
                    r = self._converter_e_enviar(abs_path, rel)
                    ok = True
                    break
                except (ErroAuth, ErroBanco, ValueError, OSError) as e:
                    espera = min(2 ** tentativa, 30)
                    self.log.warning(f"Tentativa {tentativa}/{self.cfg['tentativas']} {rel}: {e} (retry em {espera}s)")
                    time.sleep(espera)
            with self.lock:
                self.estado[rel] = {"size": st.st_size, "mtime": st.st_mtime,
                                    "sha256": r.get("fileHash") or digest,
                                    "batKey": r.get("batKey"),
                                    "status": "ok" if ok else "falha",
                                    "em": time.time(), "detalhe": str(r.get("detalhe", ""))[:200]}
                salvar_estado(self.estado)
            if not ok:
                self.log.error(f"FALHA definitiva: {rel}")
                continue
            self.log.info(f"[{r['status']}] {rel} ({r.get('detalhe', '')})")
            if r["status"] in ("enviado",) and self.cfg.get("mover_para_enviados"):
                try:
                    dest_dir = os.path.join(self.cfg["pasta"], "enviados")
                    os.makedirs(dest_dir, exist_ok=True)
                    destino = os.path.join(dest_dir, os.path.basename(abs_path))
                    if os.path.exists(destino):
                        destino = os.path.join(dest_dir, f"{int(time.time())}_{os.path.basename(abs_path)}")
                    os.replace(abs_path, destino)
                    with self.lock:
                        del self.estado[rel]
                        salvar_estado(self.estado)
                    self.log.info(f"Movido para enviados/{os.path.basename(destino)}")
                except OSError as e:
                    self.log.warning(f"Nao consegui mover {rel}: {e}")

        for rel in removidos:
            self.log.warning(f"Excluido na origem: {rel}")
            reg = self.estado.get(rel, {})
            if (not self.dry_run and self.cfg.get("apagar_remoto") and reg.get("batKey")):
                try:
                    self.cli.rtdb_delete(f"baterias/{reg['batKey']}")
                    self.cli.rtdb_delete(f"publicResumo/baterias/{reg['batKey']}")
                    self.cli.rtdb_delete(f"uploadLog/{reg['batKey']}")
                    self.log.warning(f"Removido do banco: {rel}")
                except ErroBanco as e:
                    self.log.error(f"Nao consegui apagar {rel} do banco: {e}")
                    continue
            with self.lock:
                self.estado[rel] = {**reg, "status": "removido_local", "em": time.time()}
                salvar_estado(self.estado)

    def ciclo(self):
        self.processar(*self.varrer())
        with self.lock:
            salvar_estado(self.estado)


def iniciar_temporeal(up, pasta, log):
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler
    except ImportError:
        log.warning("watchdog ausente: so varreduras (pip install -r requirements.txt).")
        return None

    class H(FileSystemEventHandler):
        def __init__(self):
            self.deb = {}

        def _tocou(self, caminho):
            if os.path.isdir(caminho) or ignorado(caminho):
                return
            # Ignorar pasta 'enviados' para não processar arquivos já movidos
            rel_path = os.path.relpath(caminho, pasta)
            if rel_path.startswith("enviados") or rel_path.startswith("enviados" + os.sep):
                return
            agora = time.time()
            if agora - self.deb.get(caminho, 0) < 5:
                return
            self.deb[caminho] = agora
            time.sleep(3)
            try:
                rel = os.path.relpath(caminho, pasta)
                st = os.stat(caminho)
                reg = up.estado.get(rel)
                if (reg and reg.get("size") == st.st_size and reg.get("mtime") == st.st_mtime
                        and reg.get("status") != "falha"):
                    return
                digest = sha256_arquivo(caminho)
                if reg and reg.get("sha256") == digest and reg.get("status") != "falha":
                    return
                log.info(f"Tempo real detectou: {rel}")
                kind = "nova-tentativa" if (reg and reg.get("status") == "falha") else ("modificado" if reg else "novo")
                up.processar([(caminho, rel, st, digest, kind)], [])
            except OSError:
                pass

        def on_created(self, event):
            self._tocou(event.src_path)

        def on_modified(self, event):
            self._tocou(event.src_path)

        def on_moved(self, event):
            self._tocou(getattr(event, "dest_path", event.src_path))

    try:
        obs = Observer()
        obs.schedule(H(), pasta, recursive=True)
        obs.start()
        log.info("Monitor em tempo real ativo (recursivo).")
        return obs
    except Exception as e:
        log.warning(f"Sem tempo real ({e}); so varreduras. Em rede (UNC) isso e esperado.")
        return None


def perguntar(texto, padrao="", secreto=False):
    if secreto:
        r = getpass.getpass(f"{texto}: ").strip()
        return r or padrao
    r = input(f"{texto}" + (f" [{padrao}]" if padrao else "") + ": ").strip().strip("\"'")
    return r or padrao


def configurar():
    try:
        with open(CONFIG_PATH, encoding="utf-8-sig") as f:
            atual = json.load(f)
    except (FileNotFoundError, ValueError):
        atual = {}
    print("--- CTAD Upload Auto: configuracao (Enter mantem o atual) ---")
    cfg = dict(atual)
    fb = dict(atual.get("firebase", {}))
    fb["apiKey"] = perguntar("Firebase apiKey (publica, vide site)", fb.get("apiKey", ""))
    fb["databaseURL"] = perguntar("Realtime Database URL", fb.get("databaseURL", "")).rstrip("/")
    fb["storageBucket"] = perguntar("Storage bucket", fb.get("storageBucket", ""))
    cfg["firebase"] = fb
    cfg["email"] = perguntar("E-mail da conta (admin/gestor)", atual.get("email", ""))
    cfg["password"] = perguntar("Senha (oculta)", "", secreto=True) or atual.get("password", "")
    cfg["pasta"] = os.path.abspath(perguntar("Pasta vigiada (local ou UNC)", atual.get("pasta", "C:\\telemetria")))
    if not os.path.isdir(cfg["pasta"]):
        if perguntar("Pasta nao existe. Criar agora? (s/n)", "s").lower().startswith("s"):
            os.makedirs(cfg["pasta"], exist_ok=True)
        else:
            print("Cancelado.")
            return
    cfg["intervalo_segundos"] = max(5, int(perguntar("Intervalo das varreduras (s, min 5)",
                                                     str(atual.get("intervalo_segundos", 15))) or 15))
    cfg["pistaId"] = perguntar("ID da pista", atual.get("pistaId", "krathus")).lower() or "krathus"
    cfg["mover_para_enviados"] = perguntar('Mover enviados p/ "enviados"? (s/n)',
                                           "s" if atual.get("mover_para_enviados", True) else "n").lower().startswith("s")
    cfg["apagar_remoto"] = perguntar("Apagar do banco ao excluir local? (s/n) [padrao n]",
                                     "s" if atual.get("apagar_remoto") else "n").lower().startswith("s")
    for chave, padrao in (("tempo_real", True), ("tentativas", 4), ("timeout_segundos", 60),
                          ("log_nivel", "INFO"),
                          ("extensoes", [".pdf", ".html", ".htm"])):
        cfg.setdefault(chave, atual.get(chave, padrao))
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    print(f"Salvo em {CONFIG_PATH}. Testando login...")
    try:
        print(f"Conexao OK: {CtadClient(cfg).testar_conexao()}")
    except Exception as e:
        print(f"Aviso: nao conectou agora ({e}).")


def _aplicar_update_cli(cfg, info):
    """Baixa, valida e entrega ao atualizador.bat; depois encerra este processo."""
    import autoupdate
    import tempfile
    log = montar_log(cfg.get("log_nivel", "INFO"))
    try:
        tmp = tempfile.mkdtemp(prefix="ctad-upd-")
        zip_path = os.path.join(tmp, "update.zip")
        autoupdate.baixar_e_verificar(info, cfg, zip_path, log)
        bat = autoupdate.extrair_atualizador(zip_path, tmp)
        outras = autoupdate.outras_copias()
        matar = False
        if outras:
            r = input(f"Há {len(outras)} outra(s) cópia(s) rodando. Fechar e continuar? (s/n): ").strip().lower()
            matar = r in ("s", "sim")
        log.info("Aplicando atualização e encerrando…")
        autoupdate.aplicar_atualizacao(bat, DIR, zip_path, info.get("sha256", ""), matar)
    except Exception as e:
        log.error(f"Atualização falhou (nada foi alterado): {e}")
        pausar_antes_de_sair()
        sys.exit(1)
    sys.exit(0)


def main():
    ap = argparse.ArgumentParser(description="CTAD Upload Auto")
    ap.add_argument("--scan-once", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--testar-conexao", action="store_true")
    ap.add_argument("--configurar", action="store_true")
    ap.add_argument("--versao", action="store_true")
    ap.add_argument("--verificar-update", action="store_true")
    ap.add_argument("--atualizar", action="store_true")
    ap.add_argument("--gui", action="store_true",
                    help="abre a interface gráfica (não fecha sozinha em erro)")
    ap.add_argument("--monitor", action="store_true",
                    help="monitor contínuo em console (padrão em tarefa agendada)")
    ap.add_argument("--auto-iniciar", action="store_true",
                    help="inicia o monitor automaticamente ao abrir (GUI)")
    ap.add_argument("--instalar-startup", action="store_true",
                    help="adiciona o app à inicialização do Windows")
    ap.add_argument("--remover-startup", action="store_true",
                    help="remove o app da inicialização do Windows")
    ap.add_argument("--no-pause", action="store_true",
                    help="não pausa antes de sair em erro (uso em agendador)")
    ap.add_argument("--pasta", default=None)
    args = ap.parse_args()

    global SEM_PAUSA
    SEM_PAUSA = args.no_pause

    # --instalar-startup / --remover-startup: gerencia atalho na inicializacao do Windows
    if args.instalar_startup or args.remover_startup:
        gerenciar_startup(args.instalar_startup)
        return

    # Modo GUI: duplo clique ou --gui (interface gráfica, nunca fecha sozinha em erro)
    if args.gui and not (args.scan_once or args.dry_run or args.testar_conexao
                          or args.configurar or args.monitor):
        import gui
        if not os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(CONFIG_MODELO, f, indent=2, ensure_ascii=False)
            print(f"[app] config.json criado em {CONFIG_PATH}. Complete na interface.")
        cfg = carregar_config()
        if args.pasta:
            cfg["pasta"] = os.path.abspath(args.pasta)
        # Auto-iniciar monitor se configurado
        if cfg.get("auto_iniciar_monitor"):
            cfg["_auto_start_monitor"] = True
        gui.executar_gui(cfg, CONFIG_PATH)
        return

    # --auto-iniciar: inicia monitor automaticamente (sem GUI)
    if args.auto_iniciar:
        cfg = carregar_config()
        if args.pasta:
            cfg["pasta"] = os.path.abspath(args.pasta)
        if cfg.get("auto_iniciar_monitor"):
            cfg["_auto_start_monitor"] = True
        log = montar_log(cfg.get("log_nivel", "INFO"))
        up = Uploader(cfg, log, dry_run=args.dry_run)
        if not args.dry_run:
            try:
                info = up.cli.testar_conexao()
                log.info(f"Autenticado como {cfg['email']} (nivel {info['nivel']}).")
            except Exception as e:
                log.error(f"Falha de autenticacao: {e}")
                pausar_antes_de_sair()
                sys.exit(1)
        log.info(f"Pasta: {cfg['pasta']} | pista: {cfg.get('pistaId')}" + (" | DRY-RUN" if args.dry_run else ""))
        up.ciclo()
        obs = iniciar_temporeal(up, cfg["pasta"], log) if cfg.get("tempo_real") else None
        try:
            while True:
                time.sleep(cfg["intervalo_segundos"])
                up.ciclo()
        except KeyboardInterrupt:
            log.info("Encerrado pelo usuario.")
        finally:
            if obs:
                obs.stop()
                obs.join()
        return

    # --configurar: assistente de configuracao no console
    if args.configurar:
        configurar()
        return

    # --versao: mostra versão e sai
    if args.versao:
        print(f"CTAD Upload Auto v{APP_VERSAO}")
        return

    # Demais comandos CLI (scan-once, dry-run, testar-conexao, update, etc.)
    cfg = carregar_config()
    if args.pasta:
        cfg["pasta"] = os.path.abspath(args.pasta)

    if args.verificar_update or args.atualizar:
        import autoupdate
        info = autoupdate.checar(cfg, APP_VERSAO)
        if not info:
            print(f"Já está na mais nova (v{APP_VERSAO}).")
            return
        print(f"Nova versão disponível: v{info['versao']} (atual v{APP_VERSAO}).")
        if info.get("notas"):
            print(f"Novidades: {info['notas']}")
        if not args.atualizar:
            return
        if input("Baixar e atualizar agora? (s/n): ").strip().lower() not in ("s", "sim"):
            print("Cancelado.")
            return
        _aplicar_update_cli(cfg, info)
        return

    log = montar_log(cfg.get("log_nivel", "INFO"))
    up = Uploader(cfg, log, dry_run=args.dry_run)

    if args.testar_conexao:
        try:
            print(f"Conexao OK: {up.cli.testar_conexao()}")
        except Exception as e:
            print(f"FALHA: {e}")
            pausar_antes_de_sair()
            sys.exit(1)
        return

    if args.scan_once:
        up.ciclo()
        return

    # Monitor contínuo (padrão para tarefa agendada / console)
    log.info(f"Pasta: {cfg['pasta']} | pista: {cfg.get('pistaId')}" + (" | DRY-RUN" if args.dry_run else ""))
    if not args.dry_run:
        try:
            info = up.cli.testar_conexao()
            log.info(f"Autenticado como {cfg['email']} (nivel {info['nivel']}).")
        except Exception as e:
            log.error(f"Falha de autenticacao: {e}")
            pausar_antes_de_sair()
            sys.exit(1)

    if args.scan_once:
        up.ciclo()
        return

    up.ciclo()
    obs = iniciar_temporeal(up, cfg["pasta"], log) if cfg.get("tempo_real") else None
    try:
        while True:
            time.sleep(cfg["intervalo_segundos"])
            up.ciclo()
    except KeyboardInterrupt:
        log.info("Encerrado pelo usuario.")
    finally:
        if obs:
            obs.stop()
            obs.join()


# ----- Gerenciamento de inicialização do Windows -----
def gerenciar_startup(instalar: bool):
    """Adiciona ou remove o app da inicialização do Windows."""
    import winreg
    exe_path = os.path.abspath(sys.executable)
    if congelado():
        # No modo congelado, o executável já é o .exe final
        pass
    else:
        # No modo script, usamos python.exe com o script
        exe_path = f'"{sys.executable}" "{os.path.abspath(__file__)}" --monitor --no-pause'

    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    app_name = "CTAD-Upload-Auto"

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_ALL_ACCESS) as key:
            if instalar:
                winreg.SetValueEx(key, app_name, 0, winreg.REG_SZ, exe_path)
                print(f"[OK] Adicionado à inicialização do Windows: {exe_path}")
            else:
                try:
                    winreg.DeleteValue(key, app_name)
                    print(f"[OK] Removido da inicialização do Windows.")
                except FileNotFoundError:
                    print(f"[INFO] Não estava na inicialização.")
    except Exception as e:
        print(f"[ERRO] Falha ao gerenciar inicialização: {e}")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Encerrado pelo usuario.")
    except SystemExit:
        raise
    except Exception as e:
        # Rede de segurança: erro inesperado também pausa para leitura.
        try:
            print(f"ERRO inesperado: {e}")
        except OSError:
            pass
        pausar_antes_de_sair()
        sys.exit(1)