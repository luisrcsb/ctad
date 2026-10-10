"""Sandbox do atualizador.bat real: pasta fake com 'app' falso (cópia do
cmd.exe renomeada — janela interativa observável e inofensiva), zip novo,
PID falso para espera, kill de outra cópia, backup, extração, restart e
auto-apagamento do .bat. Nada fora do temp é tocado."""
import hashlib
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import zipfile

BAT_REAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "atualizador.bat")
SYSTEM32 = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32")


def exe_novo_conteudo():
    with open(os.path.join(SYSTEM32, "chcp.com"), "rb") as f:
        return f.read()


def pid_espera(segundos=4):
    p = subprocess.Popen(["timeout", "/t", str(segundos)],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return p.pid


def processos_do(nome_exe, pasta):
    import ctypes
    # via tasklist CSV: conta PIDs com IMAGENAME == nome (qualquer pasta)
    out = subprocess.check_output(["tasklist", "/FI", f"IMAGENAME eq {nome_exe}",
                                   "/FO", "CSV", "/NH"], text=True)
    n = 0
    for linha in out.splitlines():
        partes = [p.strip().strip('"') for p in linha.split(",")]
        if len(partes) >= 2 and partes[0].lower() == nome_exe.lower() and partes[1].isdigit():
            n += 1
    return n


def main():
    tmp = tempfile.mkdtemp(prefix="ctad-bat-")
    inst = os.path.join(tmp, "inst")
    os.makedirs(inst)
    exe_nome = "app-fake-teste.exe"

    # app velho = cmd.exe renomeado (abre e fica vivo); zip novo = chcp + marcador
    shutil.copy(os.path.join(SYSTEM32, "cmd.exe"), os.path.join(inst, exe_nome))
    novo = exe_novo_conteudo()
    zipp = os.path.join(tmp, "novo.zip")
    with zipfile.ZipFile(zipp, "w") as z:
        z.writestr(exe_nome, novo)
        z.writestr("marcador.txt", "nova-versao")
    sha = hashlib.sha256(open(zipp, "rb").read()).hexdigest().upper()

    # outra cópia rodando (interativa, fica viva até o bat matar)
    outra = subprocess.Popen([os.path.join(inst, exe_nome)],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(20):
        if processos_do(exe_nome, inst) >= 1:
            break
        time.sleep(0.5)
    assert processos_do(exe_nome, inst) >= 1, "cópia de teste não subiu"

    # .bat a partir de cópia (ele se apaga) + PID que morre em ~4s
    bat = os.path.join(tmp, "atualizador.bat")
    shutil.copy(BAT_REAL, bat)
    waiter = pid_espera(4)
    rc = subprocess.call([bat, inst, zipp, exe_nome, str(waiter), "1", sha])
    assert rc == 0, f"bat saiu com {rc}"

    assert not os.path.exists(bat), "bat não se apagou"
    bak = os.path.join(inst, exe_nome + ".bak")
    assert os.path.exists(bak), "sem backup .bak"
    with open(os.path.join(inst, exe_nome), "rb") as f:
        assert f.read() == novo, "exe não foi substituído"
    assert open(os.path.join(inst, "marcador.txt")).read() == "nova-versao"
    time.sleep(2)
    assert processos_do(exe_nome, inst) >= 1, "app novo não reabriu"
    assert outra.poll() is not None, "cópia antiga não foi fechada"
    print("BAT-SANDBOX-OK: espera+kill+backup+extração+restart+autolimpeza")

    # caminho de falha: zip corrompido restaura o .bak
    with open(zipp, "wb") as f:
        f.write(b"lixo")
    bat2 = os.path.join(tmp, "atualizador2.bat")
    shutil.copy(BAT_REAL, bat2)
    waiter2 = pid_espera(2)
    rc2 = subprocess.call([bat2, inst, zipp, exe_nome, str(waiter2), "0", "0" * 64])
    assert rc2 != 0, "zip ruim devia falhar"
    print("BAT-ROLLBACK-OK")

    # limpeza das janelas de teste
    os.system(f'taskkill /F /IM {exe_nome} >nul 2>&1')
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
