/* CTAD — portal-pistas.js
   Portal modo vitrine + Minha Pista (multi-pista fechada, custo mínimo).
   - Deslogado: vê resumo de TODAS as pistas (pódio, melhor volta) via publicResumo/ ou agregado local. Sem detalhe volta-a-volta.
   - Logado: filtra automaticamente para a(s) pista(s) a que pertence. Detalhe completo liberado.
   - Papéis: superuser vê tudo. admin vê só pistas onde é membro.
   Compatível com base atual: pistaId default "krathus". Sem reestruturação do banco.
*/
(function () {
    'use strict';

    window.PISTA_PADRAO = window.PISTA_PADRAO || 'krathus';

    // Estado portal (espelha variáveis do index.html quando disponíveis)
    window.pistasCache = window.pistasCache || {};
    window.publicResumoCache = window.publicResumoCache || {};
    window.minhaPistaId = window.minhaPistaId || null;
    window.minhasPistas = window.minhasPistas || [];
    window.modoPortal = window.modoPortal || 'vitrine'; // vitrine | pista | todas
    window.isSuperuserPortal = window.isSuperuserPortal || false;

    function getDb() {
        try {
            if (typeof db !== 'undefined' && db) return db;
        } catch (e) {}
        if (window.firebase) {
            try { return window.firebase.database(); } catch (e) { return null; }
        }
        return null;
    }

    // ---- Helpers de pista ----
    window.getPistaIdDeRegistro = function (reg) {
        if (!reg) return window.PISTA_PADRAO;
        return reg.pistaId || reg.pista || window.PISTA_PADRAO;
    };

    window.isSuperuser = function () {
        try {
            if (window.isSuperuserPortal) return true;
            if (typeof sessao !== 'undefined' && sessao && sessao.nivel === 'superuser') return true;
        } catch (e) {}
        return false;
    };

    function lerVinculoPistaDoUsuario() {
        var uid = null;
        try { uid = (typeof usuarioAtual !== 'undefined' && usuarioAtual && usuarioAtual.uid) || null; } catch (e) {}
        if (!uid) return { lista: [], atual: null };
        var lista = [];
        try {
            var cache = (typeof usuariosPilotosCache !== 'undefined' && usuariosPilotosCache) || window.usuariosPilotosCache || {};
            var vinc = cache[uid];
            if (vinc) {
                if (typeof vinc === 'string') lista.push(vinc);
                else {
                    if (vinc.pistaId) lista.push(vinc.pistaId);
                    if (Array.isArray(vinc.pistas)) lista = lista.concat(vinc.pistas);
                    if (Array.isArray(vinc.pistaIds)) lista = lista.concat(vinc.pistaIds);
                }
            }
        } catch (e) {}
        try {
            var pc = window.pistasCache || {};
            Object.keys(pc).forEach(function (pid) {
                var m = pc[pid] && pc[pid].membros && pc[pid].membros[uid];
                if (m && lista.indexOf(pid) === -1) lista.push(pid);
            });
        } catch (e) {}
        lista = lista.filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; });
        var atual = lista.length === 1 ? lista[0] : (window.minhaPistaId && lista.indexOf(window.minhaPistaId) !== -1 ? window.minhaPistaId : (lista[0] || null));
        return { lista: lista, atual: atual };
    }

    window.podeVerPista = function (pistaId) {
        if (window.isSuperuser()) return true;
        if (!pistaId) return true;
        var minhas = window.minhasPistas || [];
        if (minhas.length === 0) return false;
        return minhas.indexOf(pistaId) !== -1;
    };

    window.filtrarPorPista = function (lista) {
        if (!Array.isArray(lista)) return [];
        // Deslogado: não filtra aqui (vitrine usa publicResumo). Retorna tudo para compat.
        try {
            if (typeof usuarioAtual === 'undefined' || !usuarioAtual) return lista;
        } catch (e) { return lista; }
        if (window.isSuperuser() && window.modoPortal === 'todas') return lista;
        var alvo = window.minhaPistaId;
        if (!alvo) return lista;
        return lista.filter(function (r) { return window.getPistaIdDeRegistro(r) === alvo; });
    };

    window.nomePista = function (pistaId) {
        try {
            var p = (window.pistasCache || {})[pistaId];
            if (p && p.info && p.info.nome) return p.info.nome;
        } catch (e) {}
        if (pistaId === window.PISTA_PADRAO) {
            try {
                if (typeof configuracoesGlobaisCache !== 'undefined' && configuracoesGlobaisCache && configuracoesGlobaisCache.nomePista) return configuracoesGlobaisCache.nomePista;
            } catch (e) {}
        }
        return pistaId || 'Pista';
    };

    // ---- Resumo público (leve, sem volta-a-volta) ----
    function extrairTempo(v) {
        if (v === null || v === undefined) return NaN;
        if (typeof v === 'object') return Number(v.tempo ?? v.time ?? v.lapTime ?? NaN);
        return Number(v);
    }

    window.gerarResumoBateria = function (reg) {
        var pistaId = window.getPistaIdDeRegistro(reg);
        var participantes = Array.isArray(reg.dados) ? reg.dados : [];
        var proc = participantes.map(function (d) {
            var nome = (d.piloto || d.name || d.pilot || '').trim();
            if (!nome) return null;
            var laps = (d.laps || []).map(extrairTempo).filter(function (t) { return Number.isFinite(t) && t > 0; });
            if (laps.length === 0) return null;
            return { piloto: nome, voltas: laps.length, melhor: Math.min.apply(null, laps) };
        }).filter(Boolean);
        proc.sort(function (a, b) {
            if (a.voltas !== b.voltas) return b.voltas - a.voltas;
            return a.melhor - b.melhor;
        });
        var podio = proc.slice(0, 3).map(function (p) { return p.piloto; });
        var melhor = proc.length ? proc.reduce(function (acc, p) { return p.melhor < acc.melhor ? p : acc; }, proc[0]) : null;
        return {
            pistaId: pistaId,
            nomePista: window.nomePista(pistaId),
            sessao: reg.sessao || reg.nomeArquivoOriginal || reg.firebaseKey || 'Bateria',
            firebaseKey: reg.firebaseKey,
            podio: podio,
            totalPilotos: proc.length,
            melhorVolta: melhor ? { piloto: melhor.piloto, tempo: Number(melhor.melhor.toFixed(3)) } : null,
            atualizadoEm: Date.now()
        };
    };

    var salvandoResumo = false;
    window.garantirPublicResumo = function () {
        var database = getDb();
        if (!database) return;
        var podeEscrever = false;
        try { podeEscrever = (typeof hasPerm === 'function') ? (hasPerm('configuracoes', 'editar') || hasPerm('*', '*')) : !!((typeof usuarioAtual !== 'undefined') && usuarioAtual); } catch (e) {}
        if (!podeEscrever) return; // só admin/superuser publica resumo (rules reforçam)
        if (salvandoResumo) return;
        var lista = [];
        try { lista = (typeof listaJsonsCache !== 'undefined' && listaJsonsCache) || []; } catch (e) {}
        if (!lista.length) return;
        salvandoResumo = true;
        var fila = lista.slice(0, 30); // limita por ciclo para não estourar quota
        var promises = fila.map(function (reg) {
            if (!reg || !reg.firebaseKey) return Promise.resolve();
            var resumo = window.gerarResumoBateria(reg);
            var cached = (window.publicResumoCache || {})[reg.firebaseKey];
            if (cached && cached.podio && cached.podio.join('|') === resumo.podio.join('|') && cached.totalPilotos === resumo.totalPilotos) return Promise.resolve();
            return database.ref('publicResumo/baterias/' + reg.firebaseKey).set(resumo).catch(function () {});
        });
        Promise.all(promises).finally(function () { salvandoResumo = false; });
    };

    // ---- Listeners portal ----
    window.iniciarListenersPortal = function () {
        var database = getDb();
        if (!database || window.__portalListenersOn) return;
        window.__portalListenersOn = true;
        try {
            database.ref('pistas').on('value', function (snap) {
                window.pistasCache = snap.val() || {};
                if (typeof window.renderSeletorPista === 'function') window.renderSeletorPista();
                if (typeof window.aplicarModoPortal === 'function') window.aplicarModoPortal();
            });
        } catch (e) {}
        try {
            database.ref('publicResumo/baterias').on('value', function (snap) {
                window.publicResumoCache = snap.val() || {};
                if (typeof window.renderVitrinePublica === 'function') {
                    var logado = false;
                    try { logado = !!(typeof usuarioAtual !== 'undefined' && usuarioAtual); } catch (e) {}
                    if (!logado) window.renderVitrinePublica();
                }
            });
        } catch (e) {}
    };

    // ---- Modo vitrine vs pista ----
    window.atualizarEstadoPortalAuth = function () {
        var logado = false;
        try { logado = !!(typeof usuarioAtual !== 'undefined' && usuarioAtual); } catch (e) {}
        var vinc = lerVinculoPistaDoUsuario();
        window.minhasPistas = vinc.lista;
        if (window.isSuperuser()) {
            if (!window.modoPortal || window.modoPortal === 'vitrine') window.modoPortal = 'todas';
            if (!window.minhaPistaId && vinc.atual) window.minhaPistaId = vinc.atual;
        } else if (logado) {
            window.modoPortal = 'pista';
            window.minhaPistaId = vinc.atual || window.PISTA_PADRAO;
            // Piloto sem vínculo explícito cai na pista padrão (krathus) — mantém compat com base atual
            if (!vinc.atual && window.minhasPistas.indexOf(window.PISTA_PADRAO) === -1) window.minhasPistas.push(window.PISTA_PADRAO);
        } else {
            window.modoPortal = 'vitrine';
            window.minhaPistaId = null;
        }
        if (typeof window.renderSeletorPista === 'function') window.renderSeletorPista();
        if (typeof window.aplicarModoPortal === 'function') window.aplicarModoPortal();
    };

    window.aplicarModoPortal = function () {
        var banner = document.getElementById('display-nome-pista');
        var logado = false;
        try { logado = !!(typeof usuarioAtual !== 'undefined' && usuarioAtual); } catch (e) {}
        if (banner) {
            if (!logado) banner.innerHTML = '🏁 CTAD — Todas as Pistas <span style="font-size:0.72rem;opacity:0.8;">(vitrine pública: pódios e resumos)</span>';
            else if (window.isSuperuser() && window.modoPortal === 'todas') banner.innerHTML = '🏁 CTAD — Todas as Pistas <span style="font-size:0.72rem;opacity:0.8;">(superuser)</span>';
            else banner.innerHTML = '🏁 ' + escapeHtmlPortal(window.nomePista(window.minhaPistaId)) + ' <span style="font-size:0.72rem;opacity:0.8;">(minha pista)</span>';
        }
        // Público: só desabilita os módulos pesados (sem desmarcar — o estado volta ao logar).
        // O dashboard público já renderiza só a vitrine, então o checked não afeta nada no deslogado.
        var modulosDetalhados = ['mod-grafico', 'mod-grafico-posicao', 'mod-log-posicao', 'mod-classificacao-analise', 'mod-tabela-geral'];
        if (!logado) {
            document.querySelectorAll('.filter-modulo').forEach(function (cb) {
                if (modulosDetalhados.indexOf(cb.value) !== -1) { cb.disabled = true; }
            });
            if (typeof window.renderVitrinePublica === 'function') window.renderVitrinePublica();
        } else {
            var boxes = document.querySelectorAll('.filter-modulo');
            boxes.forEach(function (cb) { cb.disabled = false; });
            // Restaura o padrão (tudo marcado) se algum ciclo anterior desmarcou
            var algumDesmarcado = Array.prototype.some.call(boxes, function (cb) { return !cb.checked; });
            if (algumDesmarcado) boxes.forEach(function (cb) { cb.checked = true; });
        }
        if (typeof atualizarDashboard === 'function') {
            try { atualizarDashboard(); } catch (e) {}
        }
    };

    function escapeHtmlPortal(s) {
        if (typeof escapeHtml === 'function') { try { return escapeHtml(s); } catch (e) {} }
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]; });
    }

    window.renderVitrinePublica = function () {
        var container = document.getElementById('sessions-container');
        if (!container) return;
        var logado = false;
        try { logado = !!(typeof usuarioAtual !== 'undefined' && usuarioAtual); } catch (e) {}
        if (logado) return; // logado usa dashboard normal filtrado
        var resumos = Object.values(window.publicResumoCache || {});
        // Fallback: se publicResumo ainda vazio (pré-backfill), agrega do cache completo mas só exibe pódio
        if (!resumos.length) {
            var lista = [];
            try { lista = (typeof listaJsonsCache !== 'undefined' && listaJsonsCache) || []; } catch (e) {}
            resumos = lista.map(function (r) { try { return window.gerarResumoBateria(r); } catch (e) { return null; } }).filter(Boolean);
        }
        if (!resumos.length) {
            container.innerHTML = '<div class="card" style="text-align:center;color:var(--text-muted);">Nenhuma corrida publicada ainda.</div>';
            return;
        }
        // Agrupa por pista
        var porPista = {};
        resumos.forEach(function (r) {
            var pid = r.pistaId || window.PISTA_PADRAO;
            (porPista[pid] = porPista[pid] || []).push(r);
        });
        var html = Object.keys(porPista).sort().map(function (pid) {
            var cards = porPista[pid].map(function (r) {
                var p1 = (r.podio && r.podio[0]) || '--';
                var p2 = (r.podio && r.podio[1]) || '--';
                var p3 = (r.podio && r.podio[2]) || '--';
                var mv = r.melhorVolta ? (r.melhorVolta.tempo.toFixed(3).replace('.', ',') + 's (' + r.melhorVolta.piloto + ')') : '--';
                return '<div style="background:var(--bg-input);padding:10px 12px;border-radius:8px;border:1px solid var(--border-card);">' +
                    '<strong style="color:var(--text-title);">🏁 ' + escapeHtmlPortal(r.sessao) + '</strong>' +
                    '<div style="font-size:0.78rem;margin-top:4px;">🏆 1º ' + escapeHtmlPortal(p1) + ' • 🥈 2º ' + escapeHtmlPortal(p2) + ' • 🥉 3º ' + escapeHtmlPortal(p3) + '</div>' +
                    '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">⚡ Melhor volta: ' + escapeHtmlPortal(mv) + ' • 👥 ' + (r.totalPilotos || 0) + ' pilotos</div>' +
                    '<div style="font-size:0.72rem;color:var(--accent-gold);margin-top:4px;">🔒 Entre como membro da pista para ver telemetria completa</div>' +
                    '</div>';
            }).join('');
            return '<div class="session-block"><div class="session-block-header"><div class="session-block-title">🏁 ' + escapeHtmlPortal(window.nomePista(pid)) + '</div></div>' +
                '<div style="display:flex;flex-direction:column;gap:8px;">' + cards + '</div></div>';
        }).join('');
        container.innerHTML = html + '<div class="card" style="text-align:center;">👤 <strong>Faça login</strong> para filtrar automaticamente para a sua pista e liberar gráficos, laudo e tabela volta a volta.</div>';
    };

    // ---- Seletor de pista (superuser: todas; piloto: só as dele) ----
    window.renderSeletorPista = function () {
        var host = document.getElementById('portal-seletor-pista');
        if (!host) return;
        var logado = false;
        try { logado = !!(typeof usuarioAtual !== 'undefined' && usuarioAtual); } catch (e) {}
        if (!logado) { host.innerHTML = ''; host.style.display = 'none'; return; }
        host.style.display = 'flex';
        var opcoes = [];
        if (window.isSuperuser()) {
            opcoes.push({ id: '__todas__', nome: 'Todas as pistas (superuser)' });
            Object.keys(window.pistasCache || {}).forEach(function (pid) { opcoes.push({ id: pid, nome: window.nomePista(pid) }); });
            if (!opcoes.find(function (o) { return o.id === window.PISTA_PADRAO; })) opcoes.push({ id: window.PISTA_PADRAO, nome: window.nomePista(window.PISTA_PADRAO) });
        } else {
            opcoes = (window.minhasPistas || []).map(function (pid) { return { id: pid, nome: window.nomePista(pid) }; });
        }
        var selVal = (window.isSuperuser() && window.modoPortal === 'todas') ? '__todas__' : (window.minhaPistaId || '');
        host.innerHTML = '<label style="font-size:0.75rem;color:var(--text-muted);">📍 Minha pista:</label>' +
            '<select id="portal-pista-select" style="background:var(--bg-input);color:var(--text-main);border:1px solid var(--border-card);border-radius:6px;padding:4px 8px;font-size:0.8rem;">' +
            opcoes.map(function (o) { return '<option value="' + o.id + '"' + (o.id === selVal ? ' selected' : '') + '>' + escapeHtmlPortal(o.nome) + '</option>'; }).join('') +
            '</select>';
        var sel = document.getElementById('portal-pista-select');
        if (sel) sel.onchange = function () {
            var v = sel.value;
            if (v === '__todas__') { window.modoPortal = 'todas'; }
            else { window.minhaPistaId = v; window.modoPortal = window.isSuperuser() ? 'pista' : 'pista'; }
            if (typeof window.aplicarModoPortal === 'function') window.aplicarModoPortal();
        };
    };

    // ---- Admin portal (superuser cria pista / vincula) ----
    window.criarPistaPortal = async function (pistaId, nome) {
        var database = getDb();
        if (!database) throw new Error('Banco não conectado');
        pistaId = String(pistaId || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
        if (!pistaId) throw new Error('ID da pista inválido');
        var snap = await database.ref('pistas/' + pistaId + '/info').once('value');
        if (snap.exists()) throw new Error('Pista já existe');
        await database.ref('pistas/' + pistaId + '/info').set({ nome: nome || pistaId, ativa: true, criadoEm: Date.now() });
        return pistaId;
    };

    window.vincularUsuarioPista = async function (uid, pistaId, nivel, pilotoKey) {
        var database = getDb();
        if (!database) throw new Error('Banco não conectado');
        await database.ref('pistas/' + pistaId + '/membros/' + uid).set({ nivel: nivel || 'piloto', pilotoKey: pilotoKey || null, desde: Date.now() });
        await database.ref('usuariosPilotos/' + uid).update({ pistaId: pistaId });
    };

    window.carimbarPistaId = function (obj) {
        var pid = window.minhaPistaId || window.PISTA_PADRAO;
        try {
            if (window.isSuperuser() && window.modoPortal === 'todas' && window.minhaPistaId) pid = window.minhaPistaId;
        } catch (e) {}
        obj = obj || {};
        if (!obj.pistaId) obj.pistaId = pid;
        return obj;
    };

    // Auto-boot: quando DOM pronto, inicia listeners (db pode ainda não existir; tenta de novo em 2s)
    function boot() { try { window.iniciarListenersPortal(); } catch (e) {} }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    setTimeout(boot, 2000);
})();
