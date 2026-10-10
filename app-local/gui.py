"""Interface gráfica do CTAD Upload Auto (tkinter — sem dependências extras).

Abre com: CTAD-Upload-Auto.exe --gui   (ou interface.bat)
Mostra configurações, botões de ação e o log ao vivo. A janela NUNCA fecha
sozinha em caso de erro: a mensagem fica visível no painel de log.
"""
import json
import logging
import os
import queue
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk

try:
    from ctad_upload import APP_VERSAO
except Exception:
    APP_VERSAO = "?"


class FilaHandler(logging.Handler):
    """Leva os registros de log para a fila consumida pela interface."""

    def __init__(self, fila):
        super().__init__()
        self.fila = fila

    def emit(self, registro):
        try:
            self.fila.put(self.format(registro))
        except Exception:
            pass


class AppGUI:
    def __init__(self, raiz, cfg, caminho_config):
        self.raiz = raiz
        self.cfg = cfg
        self.caminho_config = caminho_config
        self.fila_log = queue.Queue()
        self.monitorando = False
        self.parar = threading.Event()
        self.thread_monitor = None
        self.uploader = None

        raiz.title(f"CTAD Upload Auto v{APP_VERSAO} — Painel local")
        raiz.geometry("720x560")
        raiz.minsize(620, 480)

        self._montar_form()
        self._montar_botoes()
        self._montar_log()
        self._montar_status()

        # log da interface: mesma formatação do modo console
        self.handler = FilaHandler(self.fila_log)
        self.handler.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)s] %(message)s", "%d/%m/%Y %H:%M:%S"))
        logging.getLogger("ctad-upload").addHandler(self.handler)
        logging.getLogger("ctad-upload").setLevel(logging.INFO)
        self.log = logging.getLogger("ctad-upload")

        self.raiz.after(200, self._drenar_log)
        self.raiz.protocol("WM_DELETE_WINDOW", self._fechar)
        self._status("Pronto. Confira a pasta e clique em Iniciar.")
        self.log.info(f"Painel aberto (v{APP_VERSAO}). Nenhum envio feito ainda.")
        if self.cfg.get("atualizar_auto", True):
            threading.Thread(target=self._auto_check_inicial, daemon=True).start()
        
        # Auto-iniciar monitor se configurado
        if self.cfg.get("auto_iniciar_monitor") and not self.monitorando:
            self.raiz.after(1000, self._alternar_monitor)

    # ----- construção -----
    def _montar_form(self):
        frm = ttk.LabelFrame(self.raiz, text="Configuração", padding=8)
        frm.pack(fill="x", padx=8, pady=(8, 4))

        ttk.Label(frm, text="E-mail:").grid(row=0, column=0, sticky="w")
        self.var_email = tk.StringVar(value=self.cfg.get("email", ""))
        ttk.Entry(frm, textvariable=self.var_email, width=34).grid(row=0, column=1, sticky="ew", padx=4)

        ttk.Label(frm, text="Senha:").grid(row=0, column=2, sticky="w")
        self.var_senha = tk.StringVar(value=self.cfg.get("password", ""))
        ttk.Entry(frm, textvariable=self.var_senha, show="*", width=20).grid(row=0, column=3, sticky="ew", padx=4)

        ttk.Label(frm, text="Pasta vigiada:").grid(row=1, column=0, sticky="w", pady=4)
        self.var_pasta = tk.StringVar(value=self.cfg.get("pasta", ""))
        ttk.Entry(frm, textvariable=self.var_pasta).grid(row=1, column=1, columnspan=2, sticky="ew", padx=4, pady=4)
        ttk.Button(frm, text="Procurar…", command=self._procurar_pasta).grid(row=1, column=3, pady=4)

        ttk.Label(frm, text="Intervalo (s):").grid(row=2, column=0, sticky="w")
        self.var_intervalo = tk.StringVar(value=str(self.cfg.get("intervalo_segundos", 15)))
        ttk.Entry(frm, textvariable=self.var_intervalo, width=10).grid(row=2, column=1, sticky="w", padx=4)

        ttk.Label(frm, text="Pista:").grid(row=2, column=2, sticky="w")
        self.var_pista = tk.StringVar(value=self.cfg.get("pistaId", "krathus"))
        ttk.Entry(frm, textvariable=self.var_pista, width=20).grid(row=2, column=3, sticky="w", padx=4)

        ttk.Label(frm, text="Iniciar monitor ao abrir:").grid(row=3, column=0, sticky="w", pady=4)
        self.var_auto_iniciar = tk.BooleanVar(value=self.cfg.get("auto_iniciar_monitor", False))
        ttk.Checkbutton(frm, variable=self.var_auto_iniciar, style="config-input").grid(row=3, column=1, sticky="w", padx=4)

        ttk.Label(frm, text="Iniciar com Windows:").grid(row=4, column=0, sticky="w", pady=4)
        self.var_iniciar_windows = tk.BooleanVar(value=self.cfg.get("iniciar_com_windows", False))
        ttk.Checkbutton(frm, variable=self.var_iniciar_windows, style="config-input").grid(row=4, column=1, sticky="w", padx=4)
        ttk.Button(frm, text="🔧 Configurar Inicialização", command=self._configurar_inicializacao, style="config-input").grid(row=4, column=2, padx=4)

        frm.columnconfigure(1, weight=1)

    def _montar_botoes(self):
        frm = ttk.Frame(self.raiz)
        frm.pack(fill="x", padx=8, pady=4)
        self.btn_salvar = ttk.Button(frm, text="💾 Salvar", command=self._salvar)
        self.btn_salvar.pack(side="left", padx=2)
        self.btn_teste = ttk.Button(frm, text="🔌 Testar conexão", command=self._testar)
        self.btn_teste.pack(side="left", padx=2)
        self.btn_scan = ttk.Button(frm, text="🔍 Varredura única", command=self._scan)
        self.btn_scan.pack(side="left", padx=2)
        self.btn_monitor = ttk.Button(frm, text="▶ Iniciar monitor", command=self._alternar_monitor)
        self.btn_monitor.pack(side="left", padx=2)
        self.btn_update = ttk.Button(frm, text="🔄 Atualização", command=lambda: self._checar_update(True))
        self.btn_update.pack(side="left", padx=2)

    def _montar_log(self):
        frm = ttk.LabelFrame(self.raiz, text="Atividade (tudo fica registrado aqui — a janela não fecha sozinha)", padding=8)
        frm.pack(fill="both", expand=True, padx=8, pady=4)
        self.txt = scrolledtext.ScrolledText(frm, height=14, state="disabled", font=("Consolas", 9))
        self.txt.pack(fill="both", expand=True)
        self.txt.tag_config("ERROR", foreground="#ff6b6b")
        self.txt.tag_config("WARNING", foreground="#ffb703")
        self.txt.tag_config("INFO", foreground="#e8e8e8")
        self.txt.configure(background="#1a1a1a")

    def _montar_status(self):
        self.var_status = tk.StringVar(value="Pronto.")
        ttk.Label(self.raiz, textvariable=self.var_status, relief="sunken",
                  anchor="w", padding=4).pack(fill="x", padx=8, pady=(0, 8))

    # ----- log -----
    def _drenar_log(self):
        try:
            while True:
                linha = self.fila_log.get_nowait()
                self.txt.configure(state="normal")
                tag = "ERROR" if "[ERROR]" in linha else ("WARNING" if "[WARNING]" in linha else "INFO")
                self.txt.insert("end", linha + "\n", tag)
                self.txt.see("end")
                self.txt.configure(state="disabled")
        except queue.Empty:
            pass
        self.raiz.after(200, self._drenar_log)

    def _status(self, texto):
        self.var_status.set(texto)

    # ----- ações -----
    def _ler_form(self):
        try:
            intervalo = max(5, int(self.var_intervalo.get() or 15))
        except ValueError:
            intervalo = 15
        self.cfg.update({
            "email": self.var_email.get().strip(),
            "password": self.var_senha.get(),
            "pasta": os.path.abspath(self.var_pasta.get().strip() or self.cfg.get("pasta", "")),
            "intervalo_segundos": intervalo,
            "pistaId": (self.var_pista.get().strip() or "krathus").lower(),
            "auto_iniciar_monitor": self.var_auto_iniciar.get(),
            "iniciar_com_windows": self.var_iniciar_windows.get(),
        })
        return self.cfg

    def _salvar(self):
        cfg = self._ler_form()
        try:
            with open(self.caminho_config, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2, ensure_ascii=False)
            self._status(f"Configuração salva em {self.caminho_config}")
            self.log.info("Configuração salva.")
        except OSError as e:
            messagebox.showerror("Erro ao salvar", str(e))
            self.log.error("Falha ao salvar config: %s", e)

    def _configurar_inicializacao(self):
        """Adiciona ou remove o app da inicialização do Windows."""
        import subprocess
        import sys
        import os
        
        exe_path = os.path.abspath(sys.executable)
        if getattr(sys, "frozen", False):
            # No modo congelado (exe), usa o próprio executável
            pass
        else:
            # No modo script, usa python.exe com o script
            exe_path = f'"{sys.executable}" "{os.path.abspath(__file__)}" --monitor --no-pause'
        
        app_name = "CTAD-Upload-Auto"
        
        if self.var_iniciar_windows.get():
            # Adicionar à inicialização
            try:
                import winreg
                key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_ALL_ACCESS) as key:
                    winreg.SetValueEx(key, "CTAD-Upload-Auto", 0, winreg.REG_SZ, exe_path)
                self.var_iniciar_windows.set(True)
                self._status("Adicionado à inicialização do Windows.")
                self.log.info("Adicionado à inicialização do Windows.")
                messagebox.showinfo("Sucesso", "O CTAD será iniciado automaticamente com o Windows.")
            except Exception as e:
                messagebox.showerror("Erro", f"Falha ao adicionar à inicialização:\n{e}")
                self.var_iniciar_windows.set(False)
                self.log.error("Falha ao adicionar à inicialização: %s", e)
        else:
            # Remover da inicialização
            try:
                import winreg
                key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_ALL_ACCESS) as key:
                    winreg.DeleteValue(key, "CTAD-Upload-Auto")
                self.var_iniciar_windows.set(False)
                self._status("Removido da inicialização do Windows.")
                self.log.info("Removido da inicialização do Windows.")
                messagebox.showinfo("Sucesso", "O CTAD não será mais iniciado com o Windows.")
            except FileNotFoundError:
                self.var_iniciar_windows.set(False)
                self._status("Não estava na inicialização.")
            except Exception as e:
                messagebox.showerror("Erro", f"Falha ao remover da inicialização:\n{e}")
                self.var_iniciar_windows.set(True)
                self.log.error("Falha ao remover da inicialização: %s", e)

    def _salvar(self):
        cfg = self._ler_form()
        try:
            with open(self.caminho_config, "w", encoding="utf-8") as f:
                json.dump(cfg, f, indent=2, ensure_ascii=False)
            self._status(f"Configuração salva em {self.caminho_config}")
            self.log.info("Configuração salva.")
        except OSError as e:
            messagebox.showerror("Erro ao salvar", str(e))
            self.log.error("Falha ao salvar config: %s", e)

    def _testar(self):
        import ctad_upload
        cfg = self._ler_form()
        self._status("Testando conexão…")
        threading.Thread(target=self._trab_testar, args=(ctad_upload, dict(cfg)), daemon=True).start()

    def _trab_testar(self, ctad_upload, cfg):
        try:
            from ctad_client import CtadClient
            info = CtadClient(cfg).testar_conexao()
            self.log.info("Conexão OK: %s", info)
            self._status(f"Conectado! Nível: {info.get('nivel')}")
        except Exception as e:  # fica visível no log; a janela continua aberta
            self.log.error("FALHA na conexão: %s", e)
            self._status("Falha na conexão — veja o log acima.")

    def _scan(self):
        import ctad_upload
        cfg = self._ler_form()
        if not os.path.isdir(cfg["pasta"]):
            messagebox.showwarning("Pasta inválida", "A pasta vigiada não existe:\n" + cfg["pasta"])
            return
        threading.Thread(target=self._trab_scan, args=(ctad_upload, dict(cfg)), daemon=True).start()

    def _trab_scan(self, ctad_upload, cfg):
        try:
            log = logging.getLogger("ctad-upload")
            up = ctad_upload.Uploader(cfg, log, dry_run=False)
            info = up.cli.testar_conexao()
            log.info("Autenticado como %s (nível %s).", cfg.get("email"), info.get("nivel"))
            up.ciclo()
            self._status("Varredura concluída — veja o resultado no log.")
        except Exception as e:
            self.log.error("FALHA na varredura: %s", e)
            self._status("Varredura falhou — veja o erro no log acima.")

    def _alternar_monitor(self):
        if self.monitorando:
            self.parar.set()
            self._status("Parando monitor…")
            return
        import ctad_upload
        cfg = self._ler_form()
        if not os.path.isdir(cfg["pasta"]):
            messagebox.showwarning("Pasta inválida", "A pasta vigiada não existe:\n" + cfg["pasta"])
            return
        self.parar.clear()
        self.thread_monitor = threading.Thread(
            target=self._trab_monitor, args=(ctad_upload, dict(cfg)), daemon=True)
        self.thread_monitor.start()

    def _trab_monitor(self, ctad_upload, cfg):
        import time
        try:
            log = logging.getLogger("ctad-upload")
            up = ctad_upload.Uploader(cfg, log, dry_run=False)
            info = up.cli.testar_conexao()
            log.info("Autenticado como %s (nível %s).", cfg.get("email"), info.get("nivel"))
            self.uploader = up
            obs = ctad_upload.iniciar_temporeal(up, cfg["pasta"], log) if cfg.get("tempo_real") else None
            self.monitorando = True
            self.btn_monitor.configure(text="⏸ Parar monitor")
            self._status(f"Monitorando {cfg['pasta']} a cada {cfg['intervalo_segundos']}s…")
            up.ciclo()
            while not self.parar.wait(cfg["intervalo_segundos"]):
                up.ciclo()
            if obs:
                obs.stop()
                obs.join()
        except Exception as e:
            self.log.error("FALHA no monitor: %s", e)
            self._status("Monitor falhou — veja o erro no log acima.")
        finally:
            self.monitorando = False
            try:
                self.btn_monitor.configure(text="▶ Iniciar monitor")
            except Exception:
                pass
            if not self.parar.is_set():
                pass
            else:
                self._status("Monitor parado.")
                self.log.info("Monitor parado pelo usuário.")

    def _fechar(self):
        self.parar.set()
        logging.getLogger("ctad-upload").removeHandler(self.handler)
        self.raiz.destroy()

    # ----- autoatualização -----
    def _auto_check_inicial(self):
        import time
        time.sleep(4)  # deixa a interface assentar
        if self.monitorando:
            return
        self._checar_update(False)

    def _checar_update(self, manual):
        threading.Thread(target=self._trab_checar, args=(manual,), daemon=True).start()

    def _trab_checar(self, manual):
        try:
            import autoupdate
            info = autoupdate.checar(dict(self.cfg), APP_VERSAO)
        except Exception as e:
            self.log.error("Falha ao verificar atualização: %s", e)
            return
        if not info:
            if manual:
                self.log.info("Já está na mais nova (v%s).", APP_VERSAO)
                self._status(f"Na mais nova (v{APP_VERSAO}).")
            return
        self.update_info = info
        self.raiz.after(0, self._perguntar_update)

    def _perguntar_update(self):
        import autoupdate
        info = getattr(self, "update_info", None)
        if not info:
            return
        outras = autoupdate.outras_copias()
        texto = (f"Nova versão disponível: v{info.get('versao')} (atual v{APP_VERSAO}).\n")
        if info.get("notas"):
            texto += f"Novidades: {info['notas']}\n"
        if outras:
            texto += (f"\nHá {len(outras)} outra(s) cópia(s) rodando — "
                      "serão fechadas se você confirmar.")
        texto += "\nBaixar e atualizar agora?"
        if not messagebox.askyesno("Atualização disponível", texto):
            self.log.info("Atualização adiada pelo usuário.")
            return
        threading.Thread(target=self._trab_atualizar,
                         args=(info, bool(outras)), daemon=True).start()

    def _trab_atualizar(self, info, matar_outras):
        import tempfile
        import autoupdate
        try:
            tmp = tempfile.mkdtemp(prefix="ctad-upd-")
            zip_path = os.path.join(tmp, "update.zip")
            autoupdate.baixar_e_verificar(info, dict(self.cfg), zip_path, self.log)
            bat = autoupdate.extrair_atualizador(zip_path, tmp)
            self.log.info("Aplicando atualização e encerrando…")
            self._status("Atualizando — o app vai fechar e reabrir sozinho.")
            # Pasta da instalação = onde está o config em uso
            install_dir = os.path.dirname(os.path.abspath(self.caminho_config))
            autoupdate.aplicar_atualizacao(bat, install_dir, zip_path,
                                           info.get("sha256", ""), matar_outras)
            self.parar.set()
            self.raiz.after(500, self._sair_para_update)
        except Exception as e:  # nada foi alterado; janela continua aberta
            self.log.error("Atualização falhou (nada foi alterado): %s", e)
            self._status("Atualização falhou — veja o erro no log acima.")

    def _sair_para_update(self):
        try:
            self.raiz.destroy()
        finally:
            os._exit(0)  # garante o fim do PID para o atualizador prosseguir


def executar_gui(cfg, caminho_config):
    raiz = tk.Tk()
    try:
        raiz.tk.call("tk", "scaling", 1.25)
    except Exception:
        pass
    AppGUI(raiz, cfg, caminho_config)
    raiz.mainloop()
