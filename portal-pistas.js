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
                if (typeof window.renderizarSecaoPistas === 'function') window.renderizarSecaoPistas();
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

    // ---- Gestão de pistas (superuser + admin da pista) ----
    // Modelo: pistas/{id}/info {nome, ativa}; pistas/{id}/membros/{uid} {nivel: admin|piloto, piloto, desde}.
    // Um admin pode cuidar de várias pistas; um piloto pode pertencer a várias pistas.
    // Cadastro é por e-mail: o admin digita o e-mail e o sistema resolve o uid (precisa ter conta).

    function getUsuariosCache() {
        try { if (typeof usuariosCache !== 'undefined' && usuariosCache) return usuariosCache; } catch (e) {}
        return {};
    }

    window.buscarUidPorEmail = function (email) {
        email = String(email || '').trim().toLowerCase();
        if (!email) return null;
        var us = getUsuariosCache();
        var keys = Object.keys(us || {});
        for (var i = 0; i < keys.length; i++) {
            var u = us[keys[i]];
            if (u && String(u.email || '').trim().toLowerCase() === email) return keys[i];
        }
        return null;
    };

    window.podeGerenciarPista = function (pistaId) {
        if (window.isSuperuser()) return true;
        try {
            var uid = (typeof usuarioAtual !== 'undefined' && usuarioAtual && usuarioAtual.uid) || null;
            if (!uid || !pistaId) return false;
            var m = ((window.pistasCache || {})[pistaId] || {}).membros || {};
            return !!(m[uid] && m[uid].nivel === 'admin');
        } catch (e) { return false; }
    };

    // true se o usuário logado administra ao menos 1 pista (vale para abrir o painel).
    window.ehGestorDeAlgumaPista = function () {
        if (window.isSuperuser()) return true;
        try {
            var ids = Object.keys(window.pistasCache || {});
            for (var i = 0; i < ids.length; i++) {
                if (window.podeGerenciarPista(ids[i])) return true;
            }
        } catch (e) {}
        return false;
    };

    window.adminsDaPista = function (pistaId) {
        var m = (((window.pistasCache || {})[pistaId] || {}).membros) || {};
        return Object.keys(m).filter(uid => m[uid] && m[uid].nivel === 'admin');
    };

    // Cria pista exigindo um administrador (por e-mail, que precisa já ter conta).
    window.criarPistaCompleta = async function (pistaId, nome, adminEmail) {
        var database = getDb();
        if (!database) throw new Error('Banco não conectado');
        if (!window.isSuperuser()) throw new Error('Só o superuser cria pistas');
        pistaId = String(pistaId || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
        if (!pistaId) throw new Error('ID da pista inválido (letras, números e -)');
        var snap = await database.ref('pistas/' + pistaId + '/info').once('value');
        if (snap.exists()) throw new Error('Pista já existe');
        var adminUid = window.buscarUidPorEmail(adminEmail);
        if (!adminUid) throw new Error('Administrador não encontrado: precisa ter conta no site (' + adminEmail + ')');
        await database.ref('pistas/' + pistaId + '/info').set({ nome: nome || pistaId, ativa: true, criadoEm: Date.now() });
        await database.ref('pistas/' + pistaId + '/membros/' + adminUid).set({ nivel: 'admin', desde: Date.now() });
        try { await database.ref('usuariosPilotos/' + adminUid).update({ pistaId: pistaId }); } catch (e) {}
        return pistaId;
    };

    // Adiciona membro por e-mail (admin da pista adiciona pilotos; superuser adiciona admin ou piloto).
    window.adicionarMembroPistaPorEmail = async function (pistaId, email, nivel, pilotoNome) {
        var database = getDb();
        if (!database) throw new Error('Banco não conectado');
        if (!window.podeGerenciarPista(pistaId)) throw new Error('Sem permissão nesta pista');
        nivel = (nivel === 'admin') ? 'admin' : 'piloto';
        if (nivel === 'admin' && !window.isSuperuser()) throw new Error('Só o superuser nomeia administradores');
        var uid = window.buscarUidPorEmail(email);
        if (!uid) throw new Error('Conta não encontrada para este e-mail — a pessoa precisa se cadastrar primeiro');
        var atual = (((window.pistasCache || {})[pistaId] || {}).membros || {})[uid];
        await database.ref('pistas/' + pistaId + '/membros/' + uid).set({
            nivel: nivel,
            piloto: pilotoNome || (atual && atual.piloto) || null,
            desde: (atual && atual.desde) || Date.now()
        });
        // Espelho best-effort (pode falhar para admin de pista sem poder global — o vínculo principal é pistas/membros)
        try {
            var vinc = { pistaId: pistaId };
            var s = await database.ref('usuariosPilotos/' + uid).once('value');
            var cur = s.val() || {};
            var arr = Array.isArray(cur.pistas) ? cur.pistas.slice() : (Array.isArray(cur.pistaIds) ? cur.pistaIds.slice() : []);
            if (cur.pistaId && arr.indexOf(cur.pistaId) === -1) arr.push(cur.pistaId);
            if (arr.indexOf(pistaId) === -1) arr.push(pistaId);
            vinc.pistas = arr;
            await database.ref('usuariosPilotos/' + uid).update(vinc);
        } catch (e) {}
        return uid;
    };

    window.removerMembroPista = async function (pistaId, uid) {
        var database = getDb();
        if (!database) throw new Error('Banco não conectado');
        if (!window.podeGerenciarPista(pistaId)) throw new Error('Sem permissão nesta pista');
        var m = (((window.pistasCache || {})[pistaId] || {}).membros || {})[uid];
        if (m && m.nivel === 'admin') {
            if (!window.isSuperuser()) throw new Error('Só o superuser remove administradores');
            var admins = window.adminsDaPista(pistaId).filter(a => a !== uid);
            if (admins.length === 0) throw new Error('Toda pista precisa de ao menos 1 administrador');
        }
        await database.ref('pistas/' + pistaId + '/membros/' + uid).remove();
    };

    // Migração um-clique (superuser): todos os pilotos/contas atuais vão para Krathus.
    window.migrarTudoParaKrathus = async function () {
        var database = getDb();
        if (!database) throw new Error('Banco não conectado');
        if (!window.isSuperuser()) throw new Error('Só o superuser executa a migração');
        var P = window.PISTA_PADRAO || 'krathus';
        var relatorio = { pista: P, membros: 0, baterias: 0, campeonatos: 0 };
        await database.ref('pistas/' + P + '/info').update({ nome: window.nomePista(P) || 'Krathus', ativa: true, migradoEm: Date.now() });
        // 1) Contas -> membros (admin/gestor/superuser viram admin da pista; piloto vira piloto)
        var us = getUsuariosCache();
        var multi = {};
        Object.keys(us || {}).forEach(uid => {
            var u = us[uid] || {};
            var nv = String(u.nivel || 'piloto');
            var membroNv = (nv === 'admin' || nv === 'gestor' || nv === 'superuser') ? 'admin' : 'piloto';
            multi['pistas/' + P + '/membros/' + uid + '/nivel'] = membroNv;
            relatorio.membros++;
        });
        // 2) Vínculos piloto -> garante Krathus na lista
        var vincSnap = await database.ref('usuariosPilotos').once('value');
        var vinc = vincSnap.val() || {};
        Object.keys(vinc).forEach(uid => {
            var cur = vinc[uid] || {};
            var arr = Array.isArray(cur.pistas) ? cur.pistas.slice() : [];
            if (cur.pistaId && arr.indexOf(cur.pistaId) === -1) arr.push(cur.pistaId);
            if (arr.indexOf(P) === -1) arr.push(P);
            multi['usuariosPilotos/' + uid + '/pistas'] = arr;
            if (!cur.pistaId) multi['usuariosPilotos/' + uid + '/pistaId'] = P;
        });
        // 3) Baterias e campeonatos sem pistaId -> Krathus (só o campo, sem reescrever o resto)
        var batSnap = await database.ref('baterias').once('value');
        batSnap.forEach(ch => {
            var v = ch.val() || {};
            if (!v.pistaId) { multi['baterias/' + ch.key + '/pistaId'] = P; relatorio.baterias++; }
        });
        var campSnap = await database.ref('campeonatos').once('value');
        campSnap.forEach(ch => {
            var v = ch.val() || {};
            if (!v.pistaId) { multi['campeonatos/' + ch.key + '/pistaId'] = P; relatorio.campeonatos++; }
        });
        await database.ref().update(multi);
        return relatorio;
    };

    // ---- Render da seção Gestão de Pistas (admin) ----
    window.renderizarSecaoPistas = function () {
        var host = document.getElementById('pistas-gerais-corpo');
        if (!host) return;
        var podeTudo = window.isSuperuser();
        var pistas = window.pistasCache || {};
        var ids = Object.keys(pistas).sort();
        // Pista padrão sempre listada mesmo antes da migração
        var P = window.PISTA_PADRAO || 'krathus';
        if (ids.indexOf(P) === -1) ids.unshift(P);
        var us = getUsuariosCache();
        function nomeConta(uid) {
            var u = us[uid] || {};
            return (u.email || uid) + '';
        }
        var html = '';
        if (podeTudo) {
            html += `<div class="config-panel" style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:8px;padding:12px;">
                <div class="config-panel-title" style="color:var(--accent-gold);border-bottom:none;padding-bottom:0;">🚀 Migração inicial</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin:4px 0;">Direciona todos os pilotos e contas atuais para a pista <strong>Krathus</strong> (membros, vínculos e carimbo de baterias/campeonatos). Rode uma vez.</div>
                <button class="btn-action-primary" style="background:#2ec4b6;color:#000;font-weight:700;" onclick="executarMigracaoKrathus()">Migrar tudo para Krathus</button>
            </div>
            <div class="config-panel" style="background:var(--bg-card);border:1px solid var(--border-card);border-radius:8px;padding:12px;">
                <div class="config-panel-title" style="color:var(--accent-gold);border-bottom:none;padding-bottom:0;">➕ Criar nova pista (exige administrador)</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
                    <input type="text" id="input-nova-pista-id" class="config-input" placeholder="ID (ex: interlagos)" style="flex:1;min-width:120px;">
                    <input type="text" id="input-nova-pista-nome" class="config-input" placeholder="Nome (ex: Interlagos Kart)" style="flex:2;min-width:160px;">
                    <input type="email" id="input-nova-pista-admin" class="config-input" placeholder="E-mail do administrador" style="flex:2;min-width:180px;">
                    <button class="btn-action-primary" style="background:#2ec4b6;color:#000;font-weight:700;" onclick="executarCriarPista()">Criar</button>
                </div>
            </div>`;
        }
        if (!ids.length) {
            html += `<div style="color:var(--text-muted);">Nenhuma pista ainda.</div>`;
        }
        html += ids.map(pid => {
            var info = (pistas[pid] || {}).info || {};
            var membros = ((pistas[pid] || {}).membros) || {};
            var uids = Object.keys(membros);
            var admins = uids.filter(u => membros[u] && membros[u].nivel === 'admin');
            var gerencia = window.podeGerenciarPista(pid);
            var linhas = uids.length ? uids.map(uid => {
                var m = membros[uid] || {};
                return `<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:4px 0;border-bottom:1px dashed var(--border-card);">
                    <span style="font-size:0.78rem;">${m.nivel === 'admin' ? '🛡️' : '🏎️'} <strong>${escapeHtmlPortal(nomeConta(uid))}</strong>${m.piloto ? ` <span style="color:var(--text-muted);">(${escapeHtmlPortal(m.piloto)})</span>` : ''} <span style="font-size:0.65rem;color:var(--text-muted);">${m.nivel}</span></span>
                    ${gerencia ? `<button class="btn-text-action" style="color:var(--accent-red);font-size:0.7rem;" onclick="executarRemoverMembro('${pid}','${uid}')">Remover</button>` : ''}
                </div>`;
            }).join('') : `<div style="font-size:0.75rem;color:var(--text-muted);">Sem membros.</div>`;
            var semAdmin = admins.length === 0
                ? `<div style="font-size:0.72rem;color:var(--accent-red);font-weight:700;">⚠️ Sem administrador — nomeie um abaixo.</div>` : '';
            var formAdd = gerencia ? `
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
                    <input type="email" id="add-membro-email-${pid}" class="config-input" placeholder="E-mail do piloto" style="flex:2;min-width:160px;font-size:0.75rem;">
                    <input type="text" id="add-membro-piloto-${pid}" class="config-input" placeholder="Nome do piloto (opcional)" style="flex:1;min-width:140px;font-size:0.75rem;">
                    ${podeTudo ? `<select id="add-membro-nivel-${pid}" class="config-input" style="font-size:0.75rem;"><option value="piloto">piloto</option><option value="admin">admin</option></select>` : ''}
                    <button class="btn-action-primary" style="padding:5px 12px;font-size:0.75rem;" onclick="executarAdicionarMembro('${pid}')">Adicionar</button>
                </div>
                <div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">A pessoa precisa já ter conta (e-mail cadastrado). Um piloto pode estar em várias pistas; um admin também.</div>` : '';
            return `<div class="config-panel" style="background:var(--bg-input);border:1px solid var(--border-card);border-radius:8px;padding:10px 12px;margin-top:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
                    <strong style="color:var(--text-title);">🏁 ${escapeHtmlPortal(info.nome || pid)}</strong>
                    <span style="font-size:0.68rem;color:var(--text-muted);">${pid} • ${uids.length} membro(s) • ${admins.length} admin(s)</span>
                </div>
                ${semAdmin}
                <div style="margin-top:6px;">${linhas}</div>
                ${formAdd}
            </div>`;
        }).join('');
        host.innerHTML = html || `<div style="color:var(--text-muted);">Nenhuma pista.</div>`;
    };

    window.executarMigracaoKrathus = async function () {
        if (!confirm('Migrar TODOS os pilotos e contas atuais para a pista Krathus?')) return;
        try {
            var r = await window.migrarTudoParaKrathus();
            alert(`Migração concluída!\n• ${r.membros} membro(s)\n• ${r.baterias} bateria(s) carimbada(s)\n• ${r.campeonatos} campeonato(s) carimbado(s)`);
            window.renderizarSecaoPistas();
        } catch (e) { alert('Falha na migração: ' + e.message); }
    };

    window.executarCriarPista = async function () {
        var pid = document.getElementById('input-nova-pista-id')?.value || '';
        var nome = document.getElementById('input-nova-pista-nome')?.value || '';
        var admin = document.getElementById('input-nova-pista-admin')?.value || '';
        try {
            await window.criarPistaCompleta(pid, nome, admin);
            alert('Pista criada com administrador!');
            window.renderizarSecaoPistas();
        } catch (e) { alert('Falha: ' + e.message); }
    };

    window.executarAdicionarMembro = async function (pistaId) {
        var email = document.getElementById('add-membro-email-' + pistaId)?.value || '';
        var piloto = document.getElementById('add-membro-piloto-' + pistaId)?.value || '';
        var nivelEl = document.getElementById('add-membro-nivel-' + pistaId);
        var nivel = nivelEl ? nivelEl.value : 'piloto';
        try {
            await window.adicionarMembroPistaPorEmail(pistaId, email, nivel, piloto.trim() || null);
            alert('Membro adicionado à pista!');
            window.renderizarSecaoPistas();
        } catch (e) { alert('Falha: ' + e.message); }
    };

    window.executarRemoverMembro = async function (pistaId, uid) {
        if (!confirm('Remover este membro da pista?')) return;
        try {
            await window.removerMembroPista(pistaId, uid);
            window.renderizarSecaoPistas();
        } catch (e) { alert('Falha: ' + e.message); }
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
