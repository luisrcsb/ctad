/* CTAD — pilotos-v2.js (Fase 3)
   Melhorias de Pilotos/Metadados. Carregado DEPOIS do inline (ao lado de
   campeonatos.js/dashboard.js): os overrides abaixo vencem o legado com
   a mesma assinatura — nenhuma chamada antiga quebra.
   - Fotos de carro: Firebase Storage (carros/{metaKey}/{carKey}_arq) + URL
     no RTDB. Base64 legado continua exibindo (campo `imagem` aceita
     data-URL ou https). Exclusão remove o objeto do Storage (best-effort).
   - Alias: valida unicidade (não deixa dois pilotos donos do mesmo alias)
     e sugere fusão quando o alias é nome de piloto existente.
   - Exclusão de piloto: multi-path update atômico (metadados + aliases de
     uma vez) + limpeza das fotos no Storage.
   - Tags automáticas: memo por assinatura da base (invalidação automática
     quando chega upload novo).
   - Sugestão de merges: normalização + Levenshtein, painel no admin com
     botão "Fundir".
   - Pilotos padrão: seed em configuracoesGlobais/pilotosPadrao + getter
     com fallback para a constante legada.
   NOTA: `db`, `pilotosMetadadosCache`, `mesclagensCache`, `listaJsonsCache`
   são `let` no inline — referência lexical direta, nunca window.X. */

(function () {
    'use strict';

    function metaKeyOf(nome) {
        return String(nome).replace(/[.#$\/\[\]]/g, '_');
    }

    function storageDisponivel() {
        try {
            return typeof firebase !== 'undefined' && !!firebase.storage && !!firebase.storage();
        } catch (e) { return false; }
    }

    // ---------------------------------------------------------------
    // 3.1 Fotos de carro no Firebase Storage
    // ---------------------------------------------------------------
    window.adicionarCarroPiloto = async function (nomePiloto) {
        if (typeof exigirAcessoAdmin === 'function' && !exigirAcessoAdmin('pilotos', 'editar')) return;
        if (typeof db === 'undefined' || !db) return;
        var modeloEl = document.getElementById('input-carro-modelo');
        var catEl = document.getElementById('input-carro-categoria');
        var fileEl = document.getElementById('input-carro-foto');
        var modeloInput = modeloEl ? modeloEl.value.trim() : '';
        var categoriaInput = catEl ? catEl.value.trim() : '';
        if (!modeloInput) return;

        var metaKey = metaKeyOf(nomePiloto);
        var carKey = 'car_' + Date.now();
        var imagemUrl = '';
        var imagemPath = '';
        var file = fileEl && fileEl.files && fileEl.files[0] ? fileEl.files[0] : null;

        if (file) {
            if (!storageDisponivel()) {
                // Fallback legado com trava de tamanho (RTDB tem limite de 10MB por write).
                if (file.size > 1.5 * 1024 * 1024) {
                    alert('Foto muito grande para o modo sem Storage (máx 1,5MB). Comprima a imagem ou configure as regras do Firebase Storage.');
                    return;
                }
                imagemUrl = await arquivoParaBase64(file);
            } else {
                try {
                    var nomeSeguro = String(file.name || 'foto.jpg').replace(/[^\w.\-]+/g, '_').slice(-60);
                    imagemPath = 'carros/' + metaKey + '/' + carKey + '_' + nomeSeguro;
                    var snap = await firebase.storage().ref(imagemPath).put(file, { contentType: file.type });
                    imagemUrl = await snap.ref.getDownloadURL();
                } catch (err) {
                    alert('Falha no upload da foto (Storage): ' + (err && err.message ? err.message : err));
                    return;
                }
            }
        }

        try {
            var carro = { modelo: modeloInput, categoria: categoriaInput || '1/28 4x4', imagem: imagemUrl };
            if (imagemPath) carro.imagemPath = imagemPath;
            await db.ref('pilotosMetadados/' + metaKey + '/carros/' + carKey).set(carro);
            if (typeof renderizarCorpoConfigurarPiloto === 'function') renderizarCorpoConfigurarPiloto();
        } catch (err) { alert('Erro: ' + err.message); }
    };

    window.removerCarroPiloto = async function (nomePiloto, carKey) {
        if (typeof exigirAcessoAdmin === 'function' && !exigirAcessoAdmin('pilotos', 'editar')) return;
        if (typeof db === 'undefined' || !db) return;
        var metaKey = metaKeyOf(nomePiloto);
        try {
            var carro = ((typeof pilotosMetadadosCache !== 'undefined' && pilotosMetadadosCache[metaKey] || {}).carros || {})[carKey] || {};
            if (carro.imagemPath && storageDisponivel()) {
                try { await firebase.storage().ref(carro.imagemPath).delete(); } catch (e) { /* best-effort */ }
            }
            await db.ref('pilotosMetadados/' + metaKey + '/carros/' + carKey).remove();
            if (typeof renderizarCorpoConfigurarPiloto === 'function') renderizarCorpoConfigurarPiloto();
        } catch (err) { alert('Erro: ' + err.message); }
    };

    // Migração one-time (rodar no console): base64 legado -> Storage.
    window.migrarFotosCarrosParaStorage = async function () {
        if (typeof db === 'undefined' || !db || !storageDisponivel()) {
            console.warn('[pilotos-v2] db ou Storage indisponível.');
            return { migradas: 0, falhas: 0, puladas: 0 };
        }
        var rel = { migradas: 0, falhas: 0, puladas: 0 };
        var metas = (typeof pilotosMetadadosCache !== 'undefined' && pilotosMetadadosCache) || {};
        for (var metaKey of Object.keys(metas)) {
            var carros = (metas[metaKey] || {}).carros || {};
            for (var carKey of Object.keys(carros)) {
                var car = carros[carKey] || {};
                if (!car.imagem || car.imagem.indexOf('data:') !== 0 || car.imagemPath) { rel.puladas++; continue; }
                try {
                    var blob = await (await fetch(car.imagem)).blob();
                    var path = 'carros/' + metaKey + '/' + carKey + '_migrada.jpg';
                    var snap = await firebase.storage().ref(path).put(blob);
                    var url = await snap.ref.getDownloadURL();
                    await db.ref('pilotosMetadados/' + metaKey + '/carros/' + carKey).update({ imagem: url, imagemPath: path });
                    rel.migradas++;
                } catch (e) { console.warn('[pilotos-v2] falha ao migrar', metaKey, carKey, e); rel.falhas++; }
            }
        }
        console.log('[pilotos-v2] migração concluída:', rel);
        return rel;
    };

    // ---------------------------------------------------------------
    // 3.2 Alias com validação de unicidade + delete atômico
    // ---------------------------------------------------------------
    function nomesPilotosConhecidos() {
        var set = new Set();
        try {
            if (typeof obterTodosDadosConsolidados === 'function') {
                obterTodosDadosConsolidados().forEach(function (d) {
                    if (d.piloto && d.piloto.trim()) set.add(d.piloto.trim());
                });
            }
        } catch (e) {}
        try {
            Object.keys(pilotosMetadadosCache || {}).forEach(function (p) {
                if (p && p.trim()) set.add(p.trim());
            });
        } catch (e) {}
        return set;
    }

    window.adicionarAliasParaPiloto = async function (nomePiloto) {
        if (typeof exigirAcessoAdmin === 'function' && !exigirAcessoAdmin('pilotos', 'editar')) return;
        if (typeof db === 'undefined' || !db) return;
        var input = document.getElementById('input-config-alias');
        var aliasInput = input ? input.value.trim() : '';
        if (!aliasInput) return;
        var aliasKey = metaKeyOf(aliasInput);
        var cache = (typeof mesclagensCache !== 'undefined' && mesclagensCache) || {};

        var donoAtual = cache[aliasKey];
        if (donoAtual === nomePiloto) { alert('"' + aliasInput + '" já está mapeado para este piloto.'); return; }
        if (donoAtual && donoAtual !== nomePiloto) {
            alert('"' + aliasInput + '" já está mapeado para "' + donoAtual + '". Remova o mapeamento antigo antes de reatribuir.');
            return;
        }
        var nomes = nomesPilotosConhecidos();
        var lower = aliasInput.toLowerCase();
        var colide = Array.from(nomes).some(function (n) {
            return n.toLowerCase() === lower && n !== nomePiloto;
        });
        if (colide && !confirm('"' + aliasInput + '" é o nome de outro piloto cadastrado. Mapear como alias de "' + nomePiloto + '" (fundir os dois)?')) return;

        try {
            await db.ref('mesclagensPilotos/' + aliasKey).set(nomePiloto);
            if (input) input.value = '';
            if (typeof renderizarCorpoConfigurarPiloto === 'function') renderizarCorpoConfigurarPiloto();
            if (typeof atualizarDashboard === 'function') atualizarDashboard();
        } catch (err) { alert('Erro: ' + err.message); }
    };

    window.excluirPilotoDoGerenciador = async function (nomePiloto) {
        if (typeof exigirAcessoAdmin === 'function' && !exigirAcessoAdmin('pilotos', 'excluir')) return;
        if (typeof db === 'undefined' || !db) return;
        var confirmado = confirm(
            'Tem certeza ABSOLUTA que deseja excluir o cadastro de "' + nomePiloto + '"?\n\n' +
            'Isso remove apelido, aliases e carros cadastrados. Os resultados de corrida já registrados NÃO serão apagados.\n\n' +
            'Essa ação não pode ser desfeita.'
        );
        if (!confirmado) return;

        var metaKey = metaKeyOf(nomePiloto);
        try {
            var cache = (typeof mesclagensCache !== 'undefined' && mesclagensCache) || {};
            var aliasesDoPiloto = Object.keys(cache).filter(function (a) { return cache[a] === nomePiloto; });

            // Limpeza das fotos no Storage (best-effort, antes do delete).
            if (storageDisponivel()) {
                var carros = (((typeof pilotosMetadadosCache !== 'undefined' && pilotosMetadadosCache[metaKey]) || {}).carros) || {};
                for (var ck of Object.keys(carros)) {
                    if (carros[ck] && carros[ck].imagemPath) {
                        try { await firebase.storage().ref(carros[ck].imagemPath).delete(); } catch (e) {}
                    }
                }
            }

            // Multi-path update = atômico: ou tudo sai, ou nada sai.
            var paths = {};
            paths['pilotosMetadados/' + metaKey] = null;
            aliasesDoPiloto.forEach(function (a) { paths['mesclagensPilotos/' + a] = null; });
            await db.ref().update(paths);

            alert('Cadastro de "' + nomePiloto + '" excluído.');
            if (typeof fecharModalConfigurarPiloto === 'function') fecharModalConfigurarPiloto();
            if (typeof renderizarGerenciadorPilotos === 'function') renderizarGerenciadorPilotos();
            if (typeof atualizarDashboard === 'function') atualizarDashboard();
        } catch (err) { alert('Erro: ' + err.message); }
    };

    // ---------------------------------------------------------------
    // 3.3 Cache das tags automáticas (invalidação por assinatura)
    // ---------------------------------------------------------------
    function tagsSignature() {
        try {
            var cache = (typeof listaJsonsCache !== 'undefined' && listaJsonsCache) || [];
            var soma = 0;
            cache.forEach(function (arq) { soma += (arq.dados || []).length; });
            var top = cache.length > 0 ? cache[0].firebaseKey : '';
            var bottom = cache.length > 0 ? cache[cache.length - 1].firebaseKey : '';
            return cache.length + '|' + top + '|' + bottom + '|' + soma;
        } catch (e) { return null; }
    }

    function wrapTags() {
        if (window.__pilotosTagsWrapped || typeof calcularTagsAutomaticasPilotos !== 'function') return;
        window.__pilotosTagsWrapped = true;
        var orig = calcularTagsAutomaticasPilotos;
        calcularTagsAutomaticasPilotos = function () {
            var sig = tagsSignature();
            if (sig !== null && sig === window.__pilotosTagsSig) return window.__pilotosTagsVal;
            var val = orig.apply(this, arguments);
            if (sig !== null) { window.__pilotosTagsSig = sig; window.__pilotosTagsVal = val; }
            return val;
        };
    }

    // ---------------------------------------------------------------
    // 3.4 Sugestão de merges (normalização + Levenshtein)
    // ---------------------------------------------------------------
    function normalizarNomePiloto(s) {
        return String(s || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    }

    function levenshtein(a, b) {
        var m = a.length, n = b.length;
        if (m === 0) return n;
        if (n === 0) return m;
        var prev = new Array(n + 1), cur = new Array(n + 1);
        for (var j = 0; j <= n; j++) prev[j] = j;
        for (var i = 1; i <= m; i++) {
            cur[0] = i;
            for (var k = 1; k <= n; k++) {
                cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
            }
            var tmp = prev; prev = cur; cur = tmp;
        }
        return prev[n];
    }

    window.sugerirMergesPilotos = function () {
        var nomes = Array.from(nomesPilotosConhecidos());
        var cache = (typeof mesclagensCache !== 'undefined' && mesclagensCache) || {};
        var pares = [];
        for (var i = 0; i < nomes.length; i++) {
            for (var j = i + 1; j < nomes.length; j++) {
                var a = nomes[i], b = nomes[j];
                // Já fundidos (um é alias do outro)? Pula.
                if (cache[metaKeyOf(a)] === b || cache[metaKeyOf(b)] === a) continue;
                var na = normalizarNomePiloto(a), nb = normalizarNomePiloto(b);
                if (!na || !nb || na === nb) {
                    if (na && nb && na === nb && a !== b) pares.push({ a: a, b: b, motivo: 'nomes equivalentes' });
                    continue;
                }
                var dist = levenshtein(na, nb);
                var menor = Math.min(na.length, nb.length);
                if (menor >= 4 && dist <= 2) {
                    pares.push({ a: a, b: b, motivo: 'escrita parecida' });
                } else if ((na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1) && menor >= 3) {
                    pares.push({ a: a, b: b, motivo: 'um nome contém o outro' });
                }
            }
        }
        return pares.slice(0, 20);
    };

    window.fundirPilotos = async function (origem, destino) {
        if (typeof exigirAcessoAdmin === 'function' && !exigirAcessoAdmin('pilotos', 'editar')) return;
        if (typeof db === 'undefined' || !db) return;
        if (!confirm('Fundir "' + origem + '" como alias de "' + destino + '"? O histórico passa a contar para "' + destino + '".')) return;
        try {
            await db.ref('mesclagensPilotos/' + metaKeyOf(origem)).set(destino);
            if (typeof renderizarGerenciadorPilotos === 'function') renderizarGerenciadorPilotos();
            if (typeof atualizarDashboard === 'function') atualizarDashboard();
        } catch (err) { alert('Erro: ' + err.message); }
    };

    function renderizarSugestoesMerge() {
        var box = document.getElementById('sugestoes-merge-pilotos');
        if (!box) return;
        var pares;
        try { pares = window.sugerirMergesPilotos(); } catch (e) { pares = []; }
        if (!pares || pares.length === 0) { box.innerHTML = ''; box.style.display = 'none'; return; }
        box.style.display = '';
        box.innerHTML =
            '<div class="config-panel-title">🔀 Possíveis Duplicados</div>' +
            '<p style="font-size: 0.75rem; color: var(--text-muted);">Nomes parecidos que podem ser a mesma pessoa. Confira antes de fundir.</p>' +
            pares.map(function (p) {
                return '<div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; background: var(--bg-card); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-card); margin-top: 4px; flex-wrap: wrap;">' +
                    '<span style="font-size: 0.8rem;">' + escapeHtml(p.a) + ' ⇄ ' + escapeHtml(p.b) +
                    ' <span style="color: var(--text-muted); font-size: 0.7rem;">(' + escapeHtml(p.motivo) + ')</span></span>' +
                    '<button class="btn-action-primary" style="padding: 3px 10px; font-size: 0.72rem;" onclick="fundirPilotos(\'' + escJs(p.a) + '\', \'' + escJs(p.b) + '\')">Fundir A → B</button>' +
                    '</div>';
            }).join('');
    }

    function wrapGerenciador() {
        if (window.__pilotosGerenWrapped || typeof renderizarGerenciadorPilotos !== 'function') return;
        window.__pilotosGerenWrapped = true;
        var orig = renderizarGerenciadorPilotos;
        renderizarGerenciadorPilotos = function () {
            var r = orig.apply(this, arguments);
            try { renderizarSugestoesMerge(); } catch (e) {}
            return r;
        };
    }

    // ---------------------------------------------------------------
    // 3.5 Pilotos padrão no Firebase (seed + getter com fallback)
    // ---------------------------------------------------------------
    var PILOTOS_PADRAO_SEED = ['DJ Edgard', 'Gustavo', 'Henrique', 'Raphael', 'Ronaldo'];
    window.obterPilotosPadrao = function () {
        if (Array.isArray(window.pilotosPadraoCache) && window.pilotosPadraoCache.length > 0) return window.pilotosPadraoCache;
        if (typeof PILOTOS_CORE_PADRAO !== 'undefined' && Array.isArray(PILOTOS_CORE_PADRAO)) return PILOTOS_CORE_PADRAO;
        return PILOTOS_PADRAO_SEED;
    };

    async function semearPilotosPadrao() {
        if (typeof db === 'undefined' || !db) return;
        try {
            var ref = db.ref('configuracoesGlobais/pilotosPadrao');
            var snap = await ref.once('value');
            if (!snap.exists()) {
                var podeEscrever = true;
                try { podeEscrever = typeof hasPerm !== 'function' || hasPerm('config', 'editar') || hasPerm('pilotos', 'gerenciar'); } catch (e) {}
                if (podeEscrever) {
                    try { await ref.set(PILOTOS_PADRAO_SEED); } catch (e) { /* sem permissão: segue com fallback */ }
                }
                window.pilotosPadraoCache = PILOTOS_PADRAO_SEED.slice();
            } else {
                var val = snap.val();
                window.pilotosPadraoCache = Array.isArray(val) ? val : PILOTOS_PADRAO_SEED.slice();
            }
        } catch (e) { /* offline ou sem leitura: getter usa fallback */ }
    }

    // ---------------------------------------------------------------
    // Boot
    // ---------------------------------------------------------------
    function boot() {
        wrapTags();
        wrapGerenciador();
        try { renderizarSugestoesMerge(); } catch (e) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
    } else {
        setTimeout(boot, 0);
    }
    setTimeout(function () {
        try { boot(); } catch (e) {}
        try { semearPilotosPadrao(); } catch (e) {}
    }, 1500);
})();
