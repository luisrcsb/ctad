"""Regressão do tempo real: cobre o caminho que quebrou na v1.1.0.

Sobe iniciar_temporeal() de verdade sobre pasta temporária, cria um arquivo
e asserts que Uploader.processar foi chamado com (novo). Falha se o handler
estiver mal definido (NameError na definição da classe) ou se nada detectar.
"""
import os
import sys
import tempfile
import time

DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIR)

import ctad_upload as app


class FakeLog:
    def info(self, *a):
        pass

    def warning(self, *a):
        pass

    def error(self, *a):
        print("LOG-ERROR:", *a)


class FakeUp:
    def __init__(self):
        self.chamadas = []
        self.estado = {}

    def processar(self, novos, removidos):
        self.chamadas.extend(novos)


def main():
    pasta = tempfile.mkdtemp(prefix="ctad-rt-")
    sub = os.path.join(pasta, "treino")
    os.makedirs(sub)
    up = FakeUp()
    obs = app.iniciar_temporeal(up, pasta, FakeLog())
    assert obs is not None, "iniciar_temporeal retornou None (watchdog ausente?)"
    try:
        alvo = os.path.join(sub, "novo.html")
        with open(alvo, "w", encoding="utf-8") as f:
            f.write("<html><body>ZRound</body></html>")
        prazo = time.time() + 20
        while time.time() < prazo and not up.chamadas:
            time.sleep(0.5)
        assert up.chamadas, "NADA detectado em 20s — tempo real quebrou de novo"
        abs_path, rel, st, digest, kind = up.chamadas[0]
        assert kind == "novo", kind
        assert rel == os.path.join("treino", "novo.html"), rel
        print(f"TEMPO-REAL-OK: detectou {rel} como {kind}")
    finally:
        obs.stop()
        obs.join()


if __name__ == "__main__":
    main()
