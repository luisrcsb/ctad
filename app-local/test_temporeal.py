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

        # Cenário do bug v1.1.3: falha anterior com digest IDÊNTICO tem que
        # voltar como nova-tentativa (antes era engolido pelo skip de hash).
        import hashlib
        with open(alvo, "rb") as f:
            digest2 = hashlib.sha256(f.read()).hexdigest()
        st2 = os.stat(alvo)
        up.estado[rel] = {"size": st2.st_size, "mtime": st2.st_mtime,
                          "sha256": digest2, "status": "falha"}
        up.chamadas.clear()

        class Ev:
            src_path = alvo

        # Recupera o handler registrado no observer e dispara on_modified
        handler = None
        try:
            for _emitter, handlers in obs._handlers.items():
                for hand in handlers:
                    handler = hand
                    break
        except Exception:
            handler = None
        assert handler is not None, "sem handler registrado"
        try:
            handler.deb.clear()  # ignora o debounce da detecção anterior
        except AttributeError:
            pass
        handler.on_modified(Ev())
        prazo = time.time() + 20
        while time.time() < prazo and not up.chamadas:
            time.sleep(0.5)
        assert up.chamadas, "falha com mesmo digest NÃO voltou (bug persiste)"
        assert up.chamadas[0][4] == "nova-tentativa", up.chamadas[0][4]
        print("RETRY-FALHA-OK: falha com mesmo digest volta como nova-tentativa")
    finally:
        obs.stop()
        obs.join()


if __name__ == "__main__":
    main()
