/* CTAD - Championship Manager single-page (Fase 1)
   Carregado DEPOIS do script inline do index.html para que os overrides
   abaixo vençam as definições legadas. Mantém compatibilidade total:
   - window.mudarAbaZRound continua existindo (alias de showCampTab)
   - window.selecionarCampeonatoZRound / fecharPainelZRoundCamp originais
     são embrulhadas, não removidas
   - IDs de DOM (zround-aba-*, zround-*, container-zround-campeonato)
     permanecem os mesmos
   Depende de globais do index.html: db, campeonatosCache,
   listaJsonsCache, pilotosMetadadosCache, mesclagensCache,
   PILOTOS_CORE_PADRAO, campeonatoAtivoKey (let), escapeHtml(),
   ordenarParticipantesBateria(), exigirAcessoAdmin(), hasPerm(),
   atualizarInterfacePainelZRound(), renderizarListaCampeonatosModal(). */

(function () {
    'use strict';

    // ---------------------------------------------------------------
    // Estado compartilhado single-page
    // ---------------------------------------------------------------
    window.campState = window.campState || { key: null, tab: 1, dirty: false, saving: false };
    window.CAMP_TABS = [
        { id: 1, label: '📂 1. Geral & Configs' },
        { id: 2, label: '🏎️ 2. Pilotos' },
        { id: 3, label: '📤 3. Provas' },
        { id: 4, label: '🔄 4. Grids' },
        { id: 5, label: '📊 5. Classificação' }
    ];

    function campGet() {
        try {
            var k = (window.campState && window.campState.key) || null;
            if (!k && typeof campeonatoAtivoKey !== 'undefined') k = campeonatoAtivoKey;
            // NOTA: campeonatosCache é `let` no inline — não está em window,
            // usa referência lexical direta (mesmo env global de scripts classic).
            if (!k || typeof campeonatosCache === 'undefined') return null;
            return campeonatosCache[k] || null;
        } catch (e) { return null; }
    }

    function campSetSaveIndicator(txt, ok) {
        var el = document.getElementById('camp-save-indicator');
        if (!el) return;
        el.textContent = txt || '';
        el.style.color = ok === false ? 'var(--accent-red)' : 'var(--text-muted)';
    }

    // ---------------------------------------------------------------
    // Router interno single-page
    // ---------------------------------------------------------------
    window.showCampTab = function (numAba) {
        numAba = parseInt(numAba, 10) || 1;
        if (numAba < 1 || numAba > 5) numAba = 1;
        window.campState.tab = numAba;

        for (var i = 1; i <= 5; i++) {
            var aba = document.getElementById('zround-aba-' + i);
            if (!aba) continue;
            if (i === numAba) {
                aba.classList.add('active');
                aba.style.display = 'flex';
            } else {
                aba.classList.remove('active');
                aba.style.display = 'none';
            }
        }
        document.querySelectorAll('#campeonato-fullscreen .zround-tab-btn').forEach(function (b, idx) {
            if (idx === numAba - 1) b.classList.add('active');
            else b.classList.remove('active');
        });

        // Rola só o painel principal, não a página inteira.
        var principal = document.querySelector('#campeonato-fullscreen .camp-principal');
        if (principal) principal.scrollTo({ top: 0, behavior: 'smooth' });

        // Render sob demanda da aba ativa (barato: reutiliza refresh geral).
        try {
            if (window.campState.key && typeof window.atualizarInterfacePainelZRound === 'function') {
                if (numAba === 2 && typeof renderCampTabPilotos === 'function') renderCampTabPilotos(campGet());
                else if (numAba === 3 && typeof renderCampTabProvas === 'function') renderCampTabProvas(campGet());
                else if (numAba === 4 && typeof renderCampTabGrids === 'function') renderCampTabGrids(campGet());
                else if (numAba === 5 && typeof renderCampTabClassificacao === 'function') renderCampTabClassificacao(campGet());
            }
        } catch (e) { console.warn('[camp] render sob demanda falhou:', e); }
    };

    // Compat: código antigo chama mudarAbaZRound(n).
    window.mudarAbaZRound = window.showCampTab;

    // ---------------------------------------------------------------
    // Render por aba (split do antigo atualizarInterfacePainelZRound).
    // Cada função é idempotente e tolera camp nulo.
    // ---------------------------------------------------------------
    window.renderCampTabGeral = function (camp) {
        if (!camp) return;
        var conf = camp.configuracoes || {};
        var set = function (id, v) { var el = document.getElementById(id); if (el && document.activeElement !== el) el.value = v; };
        set('zround-edit-nome-camp', camp.nome || '');
        set('zround-num-provas', conf.numeroProvas ?? 4);
        set('zround-pilotos-chave', conf.pilotosPorChave ?? conf.pilotosPorProva ?? 10);
        var inv = document.getElementById('zround-inverter-segunda');
        if (inv) inv.checked = conf.inverterSegundaBateria ?? true;
        var ugt = document.getElementById('zround-usa-grid-treino');
        if (ugt) ugt.checked = conf.usaGridTreino || false;
        if (conf.pontuacaoTabela) set('zround-tabela-pontos-input', conf.pontuacaoTabela.join(', '));
        try { var selCat = document.getElementById('zround-categoria'); if (selCat) { if (typeof window.opcoesCategoriaHtml === 'function') selCat.innerHTML = window.opcoesCategoriaHtml(conf.categoria || ''); else selCat.value = conf.categoria || ''; } } catch (e) {}
        var tit = document.getElementById('zround-camp-titulo-ativo');
        if (tit) tit.innerText = 'Configurando: ' + (camp.nome || '--');
    };

    window.renderCampTabPilotos = function (camp) {
        var tbody = document.getElementById('zround-tabela-pilotos-inscritos');
        if (!tbody) return;
        var inscritos = (camp && camp.pilotosInscritos) || {};
        var keys = Object.keys(inscritos);
        if (keys.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: var(--text-muted);">Nenhum piloto inscrito.</td></tr>';
            return;
        }
        tbody.innerHTML = keys.map(function (pk) {
            var nome = (inscritos[pk] && inscritos[pk].nome) || pk;
            return '<tr><td><strong>' + escapeHtml(nome) + '</strong></td>' +
                '<td style="text-align: right;"><button class="btn-text-action" style="color: var(--accent-red);" onclick="removerPilotoCampeonatoZRound(\'' + pk + '\')">Remover</button></td></tr>';
        }).join('');
    };

    window.renderCampTabProvas = function (camp) {
        var ul = document.getElementById('zround-lista-provas-banco-separado');
        if (ul) {
            var provas = (camp && camp.bateriasBancoSeparado) || {};
            var keys = Object.keys(provas);
            ul.innerHTML = keys.length === 0
                ? '<li>Nenhuma prova registrada.</li>'
                : keys.map(function (pk) {
                    var p = provas[pk] || {};
                    return '<li style="background: var(--bg-card); padding: 5px 8px; border-radius: 6px; border: 1px solid var(--border-card); display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">' +
                        '<span>📄 <strong>' + escapeHtml(p.sessao || pk) + '</strong></span>' +
                        '<button class="btn-text-action" style="color: var(--accent-red);" onclick="excluirProvaBancoSeparado(\'' + pk + '\')">Excluir</button></li>';
                }).join('');
        }
        var st = document.getElementById('status-treino-grid-info');
        if (st) {
            if (camp && camp.gridTreinoDados && camp.gridTreinoDados.length > 0) {
                var fn = (typeof renderizarTabelaGridTreino === 'function') ? renderizarTabelaGridTreino(camp.gridTreinoDados) : '';
                st.innerHTML = '<div style="color: var(--accent-green); margin-bottom: 4px;">✅ Treino processado! (' + camp.gridTreinoDados.length + ' pilotos).</div>' + fn;
            } else {
                st.innerHTML = 'Nenhum treino processado.';
            }
        }
    };

    // Grids e Classificação reutilizam o cálculo central existente para
    // não duplicar regra de negócio; aqui só garantimos o outlet correto.
    window.renderCampTabGrids = function () {
        // O HTML dos grids é gerado pelo atualizarInterfacePainelZRound
        // legado (regra de chaves + inversão). Nada a fazer isolado.
    };

    window.renderCampTabClassificacao = function () {
        // Idem grids: tabela gerada pelo refresh legado.
    };

    // Refresh single-page: atualiza estado + todas as abas baratas,
    // mantendo a aba ativa visível.
    window.refreshCampSinglePage = function () {
        var camp = campGet();
        try { renderCampTabGeral(camp); } catch (e) {}
        try { renderCampTabPilotos(camp); } catch (e) {}
        try { renderCampTabProvas(camp); } catch (e) {}
        window.showCampTab((window.campState && window.campState.tab) || 1);
    };

    // ---------------------------------------------------------------
    // Wraps de navegação (preservam comportamento legado)
    // ---------------------------------------------------------------
    function wrapNavigation() {
        if (window.__campNavWrapped) return;
        window.__campNavWrapped = true;

        if (typeof window.selecionarCampeonatoZRound === 'function') {
            var origSel = window.selecionarCampeonatoZRound;
            window.selecionarCampeonatoZRound = function (key) {
                window.campState.key = key;
                window.campState.dirty = false;
                var r = origSel.apply(this, arguments);
                window.showCampTab(1);
                campSetSaveIndicator('');
                return r;
            };
        }
        if (typeof window.fecharPainelZRoundCamp === 'function') {
            var origFechar = window.fecharPainelZRoundCamp;
            window.fecharPainelZRoundCamp = function () {
                window.campState.key = null;
                window.campState.dirty = false;
                campSetSaveIndicator('');
                return origFechar.apply(this, arguments);
            };
        }
        // Firebase atualiza campeonatosCache em tempo real; se o camp ativo
        // mudou, reflete nas abas sem trocar a aba atual.
        if (typeof db !== 'undefined' && db && !window.__campCacheHook) {
            window.__campCacheHook = true;
            var prev = window.atualizarInterfacePainelZRound;
            if (typeof prev === 'function') {
                window.atualizarInterfacePainelZRound = function () {
                    var r = prev.apply(this, arguments);
                    try {
                        var camp = campGet();
                        renderCampTabGeral(camp);
                        renderCampTabPilotos(camp);
                        renderCampTabProvas(camp);
                        // Reaplica visibilidade single-page sem pular de aba.
                        var t = (window.campState && window.campState.tab) || 1;
                        for (var i = 1; i <= 5; i++) {
                            var aba = document.getElementById('zround-aba-' + i);
                            if (aba) aba.style.display = (i === t) ? 'flex' : 'none';
                        }
                    } catch (e) {}
                    return r;
                };
            }
        }
    }

    // ---------------------------------------------------------------
    // Auto-save Tab 1 (debounced, silencioso, sem alert)
    // ---------------------------------------------------------------
    var campSaveTimer = null;
    function campCollectConfig() {
        return {
            numeroProvas: parseInt((document.getElementById('zround-num-provas') || {}).value, 10) || 4,
            pilotosPorChave: parseInt((document.getElementById('zround-pilotos-chave') || {}).value, 10) || 10,
            inverterSegundaBateria: !!(document.getElementById('zround-inverter-segunda') || {}).checked,
            usaGridTreino: !!(document.getElementById('zround-usa-grid-treino') || {}).checked,
            pontuacaoTabela: String((document.getElementById('zround-tabela-pontos-input') || {}).value || '')
                .split(',').map(function (s) { return parseInt(s.trim(), 10); }).filter(function (n) { return !isNaN(n); }),
            categoria: String((document.getElementById('zround-categoria') || {}).value || '').trim()
        };
    }

    window.campSaveConfigSilent = async function () {
        var key = (window.campState && window.campState.key) || null;
        // `db` é `let` no inline: referência lexical, não window.db.
        if (!key || typeof db === 'undefined' || !db) return;
        var cfg = campCollectConfig();
        if (!cfg.pontuacaoTabela.length) cfg.pontuacaoTabela = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
        window.campState.saving = true;
        campSetSaveIndicator('● salvando…');
        try {
            await db.ref('campeonatos/' + key + '/configuracoes').update(cfg);
            window.campState.dirty = false;
            campSetSaveIndicator('✓ salvo');
        } catch (e) {
            campSetSaveIndicator('✕ erro ao salvar', false);
        } finally {
            window.campState.saving = false;
        }
    };

    function campQueueAutosave() {
        window.campState.dirty = true;
        campSetSaveIndicator('● alterações…');
        if (campSaveTimer) clearTimeout(campSaveTimer);
        campSaveTimer = setTimeout(function () { window.campSaveConfigSilent(); }, 900);
    }

    function bindAutosave() {
        if (window.__campAutosaveBound) return;
        window.__campAutosaveBound = true;
        ['zround-num-provas', 'zround-pilotos-chave', 'zround-tabela-pontos-input'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('input', campQueueAutosave);
        });
        ['zround-inverter-segunda', 'zround-usa-grid-treino', 'zround-categoria'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('change', campQueueAutosave);
        });
    }

    // ---------------------------------------------------------------
    // Boot (idempotente)
    // ---------------------------------------------------------------
    function boot() {
        wrapNavigation();
        bindAutosave();
        // Garante estado single-page mesmo se o painel já estava aberto.
        var container = document.getElementById('container-zround-campeonato');
        if (container && container.style.display === 'flex') {
            window.showCampTab((window.campState && window.campState.tab) || 1);
        } else {
            // Pré-aplica visibilidade correta para quando abrir.
            window.showCampTab((window.campState && window.campState.tab) || 1);
            if (container) container.style.display = 'none';
            var vazio = document.getElementById('camp-vazio');
            if (vazio && !window.campState.key) vazio.style.display = '';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
    } else {
        setTimeout(boot, 0);
    }
    // Re-tenta o wrap após o inline registrar as funções (ordem de carga).
    setTimeout(function () { try { wrapNavigation(); bindAutosave(); } catch (e) {} }, 500);
})();
