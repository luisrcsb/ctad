/* CTAD - Central de Telemetria — Acessibilidade (alto contraste, filtros de daltonismo)
   Depende de: 'db' (Firebase, do script principal). */

        window.abrirModalAcessibilidade = function() {
            document.getElementById('accessibility-modal').style.display = 'flex';
        };

        window.fecharModalAcessibilidade = function() {
            document.getElementById('accessibility-modal').style.display = 'none';
        };

        const CHAVE_ACESSIBILIDADE = 'ctad_acessibilidade_modo';

        function salvarModoAcessibilidade(modo) {
            try {
                if (modo === 'normal') {
                    localStorage.removeItem(CHAVE_ACESSIBILIDADE);
                } else {
                    localStorage.setItem(CHAVE_ACESSIBILIDADE, modo);
                }
            } catch (e) { /* ambiente sem localStorage */ }
        }

        function lerModoAcessibilidade() {
            try {
                return localStorage.getItem(CHAVE_ACESSIBILIDADE);
            } catch (e) {
                return null;
            }
        }

        window.aplicarModoAcessibilidade = function(modo) {
            document.body.classList.remove('modo-alto-contraste', 'modo-protanopia', 'modo-deuteranopia', 'modo-tritanopia', 'modo-acromatopsia');
            if (modo !== 'normal') {
                document.body.classList.add(`modo-${modo}`);
            }
            salvarModoAcessibilidade(modo);
            fecharModalAcessibilidade();
        };

        (function restaurarModoAcessibilidade() {
            const modo = lerModoAcessibilidade();
            if (modo && modo !== 'normal') {
                const aplicar = () => window.aplicarModoAcessibilidade(modo);
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', aplicar);
                } else {
                    aplicar();
                }
            }
        })();

        window.alternarAcessibilidadeGlobal = async function(checkbox) {
            if (!exigirAcessoAdmin()) { checkbox.checked = !checkbox.checked; return; }
            if (!db) return;
            let ativo = checkbox.checked;
            try {
                await db.ref('configuracoesGlobais/acessibilidadeHabilitada').set(ativo);
            } catch (err) {
                alert("Erro ao salvar configuração: " + err.message);
            }
        };
