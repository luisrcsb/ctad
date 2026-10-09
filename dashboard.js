/* CTAD — dashboard.js (Fase 2)
   Modularização do painel principal. Carregado DEPOIS do script inline do
   index.html (ao lado de campeonatos.js), então os overrides abaixo vencem
   as definições legadas mantendo a mesma assinatura e o mesmo HTML/IDs —
   listeners de curtidas/comentários e CSS continuam funcionando.
   - window.DashModules: registry de módulos visuais (adicionar um módulo
     novo = 1 entrada aqui + 1 checkbox .filter-modulo no HTML)
   - window.renderSessionCard: componente isolado por sessão (header pódio
     + cards dos módulos ativos). Retorna { section, deferredCharts }
   - Lazy charts: Chart.js só inicializa quando o canvas entra na viewport
     (IntersectionObserver; fallback imediato sem IO). Shell HTML de todas
     as sessões continua renderizado de uma vez (virtualização total de
     linhas fica para o futuro: alturas variáveis tornam-na arriscada).
   - KPIs memoizados: embrulha atualizarKPIsCompactos e pula o recálculo
     quando seleções + base não mudaram.
   ATENÇÃO: usa Utils.escJsAttr (variante do dashboard), NUNCA o escJs
   global — o global foi redefinido por pilotos.js com outra semântica. */

(function () {
    'use strict';

    function escAttr(v) {
        if (window.Utils && window.Utils.escJsAttr) return window.Utils.escJsAttr(v);
        return String(v === null || v === undefined ? '' : v)
            .replace(/\\/g, '\\\\').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n');
    }

    function safeKey(batKey) {
        return String(batKey).replace(/[.#$\/\[\]]/g, '_');
    }

    function el(html, cls) {
        var d = document.createElement('div');
        if (cls) d.className = cls;
        d.innerHTML = html;
        return d;
    }

    // ---------------------------------------------------------------
    // Registry de módulos visuais (ordem = ordem de exibição no card)
    // ---------------------------------------------------------------
    window.DashModules = {
        'mod-grafico': {
            title: '📈 Evolução de Ritmo',
            build: function (ctx) {
                return el('<div class="card-header">📈 Evolução de Ritmo</div>' +
                    '<div class="chart-container"><canvas id="chart-ritmo-' + ctx.safe + '"></canvas></div>', 'card');
            },
            defer: function (ctx) {
                return { canvasId: 'chart-ritmo-' + ctx.safe, ordenados: ctx.ordenados, type: 'ritmo' };
            }
        },
        'mod-grafico-posicao': {
            title: '📊 Posição Volta a Volta',
            build: function (ctx) {
                return el('<div class="card-header">📊 Posição Volta a Volta</div>' +
                    '<div class="chart-container"><canvas id="chart-posicao-' + ctx.safe + '"></canvas></div>', 'card');
            },
            defer: function (ctx) {
                return { canvasId: 'chart-posicao-' + ctx.safe, ordenados: ctx.ordenados, type: 'posicao' };
            }
        },
        'mod-log-posicao': {
            title: '📝 Ultrapassagens',
            build: function (ctx) {
                var lapLogs = window.calcularRelatorioUltrapassagens(ctx.ordenados, ctx.dadosSessao);
                var keys = Object.keys(lapLogs || {});
                var logHtml = keys.length === 0
                    ? '<div style="color:var(--text-muted); font-size:0.78rem;">Sem alterações.</div>'
                    : keys.map(function (voltaNum) {
                        var desc = lapLogs[voltaNum].map(function (m) {
                            var cls = m.tipo === 'ganho' ? 'tag-gain' : 'tag-loss';
                            var acao = m.tipo === 'ganho' ? 'ganhou' : 'perdeu';
                            return '<strong>' + escapeHtml(m.piloto) + '</strong> ' + acao +
                                ' <span class="' + cls + '">(' + m.posAnterior + 'º ➔ ' + m.posAtual + 'º)</span>';
                        }).join(' • ');
                        return '<div class="position-log-item">Volta ' + voltaNum + ': ' + desc + '</div>';
                    }).join('');
                return el('<div class="card-header">📝 Ultrapassagens</div>' +
                    '<div class="position-analysis-container"><div class="position-log-list">' + logHtml + '</div></div>', 'card');
            }
        },
        'mod-classificacao-analise': {
            title: '📋 Laudo Técnico',
            build: function (ctx) {
                return el('<div class="card-header">📋 Laudo Técnico</div>' +
                    '<div class="analysis-subrow-box">' + window.gerarLaudoTecnicoSessao(ctx.ordenados) + '</div>', 'card');
            }
        },
        'mod-tabela-geral': {
            title: '⏱️ Tabela Geral Volta a Volta (com Gaps e Líder)',
            build: function (ctx) {
                return el('<div class="card-header">⏱️ Tabela Geral Volta a Volta (com Gaps e Líder)</div>' +
                    '<div class="table-container">' + window.gerarTabelaGeralSessao(ctx.ordenados) + '</div>', 'card');
            }
        },
        'mod-comentarios': {
            title: '💬 Comentários',
            build: function (ctx) {
                // Strings idênticas às legadas (batKey cru, como no original).
                return el('<div class="card-header">💬 Comentários</div>' +
                    '<div class="comments-section">' +
                    '<div class="comments-list" id="comments-list-' + ctx.safe + '"></div>' +
                    '<div class="comment-form">' +
                    '<input type="text" id="comment-name-' + ctx.safe + '" class="comment-input-name" placeholder="Nome">' +
                    '<input type="text" id="comment-text-' + ctx.safe + '" class="comment-input-text" placeholder="Comentário..." onkeydown="if(event.key === \'Enter\') enviarComentario(\'' + ctx.batKey + '\')">' +
                    '<button class="btn-comment" onclick="enviarComentario(\'' + ctx.batKey + '\')">Enviar</button>' +
                    '</div></div>', 'card');
            }
        }
    };
    window.DASH_MODULE_ORDER = [
        'mod-grafico', 'mod-grafico-posicao', 'mod-log-posicao',
        'mod-classificacao-analise', 'mod-tabela-geral', 'mod-comentarios'
    ];

    // ---------------------------------------------------------------
    // SessionCard — componente isolado por sessão
    // ---------------------------------------------------------------
    window.renderSessionCard = function (batKey, nomeFormatado, dadosSessao, ordenados, modulosSel) {
        var sk = safeKey(batKey);
        var section = document.createElement('div');
        section.className = 'session-block';
        section.setAttribute('data-batkey', batKey);

        var tags = '';
        if (ordenados.length > 0) tags += '<span class="session-podium-tag podium-gold">🏆 1º <a class="piloto-link" data-piloto="' + escapeHtml(ordenados[0].piloto) + '" onclick="abrirDossiePiloto(this.dataset.piloto)">' + escapeHtml(ordenados[0].piloto) + '</a></span>';
        if (ordenados.length > 1) tags += '<span class="session-podium-tag podium-silver">🥈 2º <a class="piloto-link" data-piloto="' + escapeHtml(ordenados[1].piloto) + '" onclick="abrirDossiePiloto(this.dataset.piloto)">' + escapeHtml(ordenados[1].piloto) + '</a></span>';
        if (ordenados.length > 2) tags += '<span class="session-podium-tag podium-bronze">🥉 3º <a class="piloto-link" data-piloto="' + escapeHtml(ordenados[2].piloto) + '" onclick="abrirDossiePiloto(this.dataset.piloto)">' + escapeHtml(ordenados[2].piloto) + '</a></span>';

        section.innerHTML =
            '<div class="session-block-header">' +
            '<div class="session-block-title"><span>🏁 ' + escapeHtml(nomeFormatado) + '</span></div>' +
            '<div class="session-block-meta">' + tags +
            '<button class="btn" style="background: rgba(58, 134, 255, 0.15); color: var(--accent-blue); border: 1px solid var(--accent-blue); padding: 4px 8px; font-size: 0.75rem;" onclick="compartilharCorrida(\'' + escAttr(batKey) + '\', \'' + escAttr(nomeFormatado) + '\')">📤</button>' +
            '<button class="btn" style="background: rgba(230, 57, 70, 0.15); color: var(--accent-red); border: 1px solid var(--accent-red); padding: 4px 8px; font-size: 0.75rem;" onclick="curtirSessao(\'' + escAttr(batKey) + '\')">❤️ <span id="like-count-' + sk + '">0</span></button>' +
            '</div></div>';

        var grid = document.createElement('div');
        grid.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
        var ctx = { batKey: batKey, safe: sk, dadosSessao: dadosSessao, ordenados: ordenados };
        var deferredCharts = [];

        window.DASH_MODULE_ORDER.forEach(function (key) {
            if (modulosSel.indexOf(key) === -1) return;
            var mod = window.DashModules[key];
            if (!mod) return;
            grid.appendChild(mod.build(ctx));
            if (typeof mod.defer === 'function') deferredCharts.push(mod.defer(ctx));
        });

        section.appendChild(grid);
        return { section: section, deferredCharts: deferredCharts };
    };

    // ---------------------------------------------------------------
    // Lazy charts — Chart.js só para canvas visível
    // ---------------------------------------------------------------
    var dashChartObserver = null;
    function dashGetObserver() {
        if (dashChartObserver) return dashChartObserver;
        if (typeof IntersectionObserver === 'undefined') return null;
        dashChartObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (!en.isIntersecting) return;
                var job = en.target.__dashChartJob;
                if (job) {
                    dashRenderChart(job);
                    en.target.__dashChartJob = null;
                }
                dashChartObserver.unobserve(en.target);
            });
        }, { rootMargin: '200px 0px' });
        return dashChartObserver;
    }

    function dashRenderChart(job) {
        try {
            if (job.type === 'ritmo') window.renderizarGraficoRitmoPersonalizado(job.canvasId, job.ordenados);
            else window.renderizarGraficoPosicaoPersonalizado(job.canvasId, job.ordenados);
        } catch (e) { console.warn('[dash] chart falhou:', job.canvasId, e); }
    }

    function dashScheduleCharts(deferredCharts) {
        var obs = dashGetObserver();
        if (!obs) {
            deferredCharts.forEach(dashRenderChart);
            return;
        }
        deferredCharts.forEach(function (job) {
            var cv = document.getElementById(job.canvasId);
            if (!cv) return;
            cv.__dashChartJob = job;
            obs.observe(cv);
        });
    }

    // ---------------------------------------------------------------
    // renderizarSessõesCompletas V2 (mesma assinatura do legado)
    // ---------------------------------------------------------------
    function renderizarSessõesCompletasV2(dadosBase, bateriasSel, pilotosSel, modulosSel) {
        // NOTA: chartInstances e listaJsonsCache são `let` no inline — não
        // estão em window; usa referência lexical direta (scripts classic
        // compartilham o mesmo ambiente global).
        try {
            if (typeof chartInstances !== 'undefined' && chartInstances && chartInstances.length) {
                chartInstances.forEach(function (c) { try { c.destroy(); } catch (e) {} });
            }
            chartInstances = [];
        } catch (e) { try { chartInstances = []; } catch (e2) {} }
        if (dashChartObserver) { try { dashChartObserver.disconnect(); } catch (e) {} }

        var main = document.getElementById('sessions-container');
        if (!main) return;
        main.innerHTML = '';
        if (!dadosBase || dadosBase.length === 0 || !bateriasSel || bateriasSel.length === 0) return;

        var allDeferred = [];
        bateriasSel.forEach(function (batKey) {
            var cache = (typeof listaJsonsCache !== 'undefined' && listaJsonsCache) || [];
            var sessaoObj = cache.find(function (i) { return i.firebaseKey === batKey; });
            var nomeSessao = sessaoObj ? (sessaoObj.sessao || sessaoObj.nomeArquivoOriginal || batKey) : batKey;
            var nomeFormatado = window.formatarNomeSessao(nomeSessao);
            var dadosSessao = dadosBase.filter(function (d) {
                return d.bateriaKey === batKey && (pilotosSel.length === 0 || pilotosSel.indexOf(d.piloto) !== -1);
            });
            if (dadosSessao.length === 0) return;
            var validos = dadosSessao.filter(function (d) { return d.laps && d.laps.length > 0; });
            var ordenados = window.ordenarParticipantesBateria(validos);

            setTimeout(function () {
                try { if (typeof window.escutarCurtidas === 'function') window.escutarCurtidas(batKey); } catch (e) {}
                try { if (typeof window.escutarComentarios === 'function') window.escutarComentarios(batKey); } catch (e) {}
            }, 100);

            var card = window.renderSessionCard(batKey, nomeFormatado, dadosSessao, ordenados, modulosSel);
            main.appendChild(card.section);
            allDeferred = allDeferred.concat(card.deferredCharts);
        });
        dashScheduleCharts(allDeferred);
    }

    // ---------------------------------------------------------------
    // KPIs memoizados
    // ---------------------------------------------------------------
    function dashKpiSignature() {
        try {
            var bat = Array.prototype.map.call(document.querySelectorAll('.filter-bateria:checked'), function (cb) { return cb.value; });
            var pil = Array.prototype.map.call(document.querySelectorAll('.filter-piloto:checked'), function (cb) { return cb.value; });
            var cache = (typeof listaJsonsCache !== 'undefined' && listaJsonsCache) || [];
            var n = cache.length;
            var top = n > 0 ? cache[0].firebaseKey : '';
            return bat.join(',') + '|' + pil.join(',') + '|' + n + '|' + top;
        } catch (e) { return String(Math.random()); }
    }

    function wrapKpis() {
        if (window.__dashKpiWrapped || typeof window.atualizarKPIsCompactos !== 'function') return;
        window.__dashKpiWrapped = true;
        var orig = window.atualizarKPIsCompactos;
        window.atualizarKPIsCompactos = function () {
            var sig = dashKpiSignature();
            if (sig === window.__dashKpiSig) return;
            window.__dashKpiSig = sig;
            return orig.apply(this, arguments);
        };
    }

    function wrapSessions() {
        if (window.__dashSessionsWrapped || typeof window.renderizarSessõesCompletas !== 'function') return;
        window.__dashSessionsWrapped = true;
        window.renderizarSessõesCompletas = renderizarSessõesCompletasV2;
    }

    function boot() {
        wrapKpis();
        wrapSessions();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
    } else {
        setTimeout(boot, 0);
    }
    setTimeout(function () { try { boot(); } catch (e) {} }, 500);
})();
