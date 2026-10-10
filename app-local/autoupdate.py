"""Autoatualização do app local (stdlib apenas).

Fluxo: versao.json no site -> compara -> baixa zip -> confere sha256 ->
extrai atualizador.bat do PRÓPRIO zip baixado -> lança e encerra.
O .bat espera o processo sair (exe travado não se substitui), fecha outras
cópias (se autorizado), guarda .bak, extrai, valida, reabre e se apaga.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

URL_PADRAO_VERSAO = "https://krathus-telemetria.web.app/downloads/versao.json"


def congelado():
    return getattr(sys, "frozen", False)


def nome_exe():
    if congelado():
        return os.path.basename(sys.executable)
    return "CTAD-Upload-Auto.exe"


def parse_versao(s):
    nums = re.findall(r"\d+", str(s or ""))
    return tuple(int(x) for x in nums) or (0,)


def versao_maior(nova, atual):
    a, b = parse_versao(nova), parse_versao(atual)
    n = max(len(a), len(b))
    a += (0,) * (n - len(a))
    b += (0,) * (n - len(b))
    return a > b


def url_base_update(cfg):
    base = (cfg.get("update_url") or URL_PADRAO_VERSAO).strip()
    return base


def buscar_info(cfg, timeout=20):
    """Lê o versao.json publicado. Retorna dict ou None (sem rede = silencioso)."""
    url = url_base_update(cfg) + ("&" if "?" in url_base_update(cfg) else "?") + "t=n"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "CTAD-Upload-Auto"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            info = json.loads(r.read().decode("utf-8"))
        if not info.get("versao") or not info.get("zip"):
            return None
        return info
    except Exception:
        return None


def checar(cfg, versao_atual):
    """Retorna info do update se houver versão maior, senão None."""
    info = buscar_info(cfg, int(cfg.get("timeout_segundos", 20)))
    if info and versao_maior(info.get("versao"), versao_atual):
        return info
    return None


def url_zip(info, cfg):
    z = info.get("zip", "")
    if z.startswith("http"):
        return z
    base = url_base_update(cfg)
    raiz = base.split("/downloads/")[0] if "/downloads/" in base else base.rsplit("/", 1)[0]
    return raiz + "/" + z.lstrip("/")


def baixar_e_verificar(info, cfg, destino, log=None):
    """Baixa o zip e confere o sha256 do versao.json. Retorna caminho do zip."""
    url = url_zip(info, cfg)
    if log:
        log.info("Baixando atualização %s…", info.get("versao"))
    req = urllib.request.Request(url, headers={"User-Agent": "CTAD-Upload-Auto"})
    h = hashlib.sha256()
    with urllib.request.urlopen(req, timeout=60) as r, open(destino, "wb") as f:
        while True:
            pedaco = r.read(1024 * 256)
            if not pedaco:
                break
            h.update(pedaco)
            f.write(pedaco)
    obtido = h.hexdigest().upper()
    esperado = str(info.get("sha256", "")).upper()
    if esperado and obtido != esperado:
        raise ValueError(f"Hash do pacote não confere (esperado {esperado[:16]}…, veio {obtido[:16]}…).")
    if log:
        log.info("Pacote íntegro (%s).", info.get("versao"))
    return destino


def extrair_atualizador(zip_path, destino):
    """Tira o atualizador.bat do PRÓPRIO zip baixado (vale p/ qualquer versão)."""
    with zipfile.ZipFile(zip_path) as z:
        nomes = z.namelist()
        bat = next((n for n in nomes if os.path.basename(n).lower() == "atualizador.bat"), None)
        if not bat:
            raise ValueError("Pacote sem atualizador.bat.")
        z.extract(bat, destino)
        return os.path.join(destino, bat)


def outras_copias(exe_nome=None):
    """PIDs de outras cópias do app rodando. Fora do .exe, retorna [] (segurança)."""
    if not congelado():
        return []  # no fonte o processo é python.exe: jamais matar por nome
    exe_nome = exe_nome or nome_exe()
    try:
        out = subprocess.check_output(
            ["tasklist", "/FI", f"IMAGENAME eq {exe_nome}", "/FO", "CSV", "/NH"],
            text=True, stderr=subprocess.DEVNULL)
    except Exception:
        return []
    meus = os.getpid()
    pids = []
    for linha in out.splitlines():
        partes = [p.strip().strip('"') for p in linha.split(",")]
        if len(partes) >= 2 and partes[0].lower() == exe_nome.lower() and partes[1].isdigit():
            pid = int(partes[1])
            if pid != meus:
                pids.append(pid)
    return pids


def aplicar_atualizacao(bat_path, install_dir, zip_path, sha256, matar_outras):
    """Lança o atualizador destacado e retorna. O chamador deve encerrar."""
    exe_nome = nome_exe()
    args = [bat_path, install_dir, zip_path, exe_nome, str(os.getpid()),
            "1" if matar_outras else "0", sha256 or ""]
    subprocess.Popen(args, cwd=os.path.dirname(bat_path),
                     creationflags=subprocess.DETACHED_PROCESS if os.name == "nt" else 0,
                     close_fds=True)
    return args
