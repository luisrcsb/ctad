/* CTAD - Central de Telemetria — Acessibilidade (alto contraste, filtros de daltonismo)
   Depende de: 'db' (Firebase, do script principal). */

        window.abrirModalAcessibilidade = function() {
            document.getElementById('accessibility-modal').style.display = 'flex';
        };

        window.fecharModalAcessibilidade = function() {
            document.getElementById('accessibility-modal').style.display = 'none';
        };

        window.aplicarModoAcessibilidade = function(modo) {
            document.body.classList.remove('modo-alto-contraste', 'modo-protanopia', 'modo-deuteranopia', 'modo-tritanopia', 'modo-acromatopsia');
            if (modo !== 'normal') {
                document.body.classList.add(`modo-${modo}`);
            }
            fecharModalAcessibilidade();
        };

        window.alternarAcessibilidadeGlobal = async function(checkbox) {
            if (!db) return;
            let ativo = checkbox.checked;
            try {
                await db.ref('configuracoesGlobais/acessibilidadeHabilitada').set(ativo);
            } catch (err) {
                alert("Erro ao salvar configuração: " + err.message);
            }
        };
