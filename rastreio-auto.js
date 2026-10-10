/* CTAD — rastreio-auto.js
   Rastreio AUTOMÁTICO de compras coletivas (multi-provider + cache + modo sem chave).
   - Provedores gratuitos de longo prazo: PacoteVício via RapidAPI (1000/mês grátis p/ sempre)
     e Site Rastreio (1000/mês grátis p/ sempre com backlink). SeuRastreio mantido como legado (trial 7 dias).
   - Chave fica SÓ no navegador do admin (localStorage), nunca no Firebase público.
   - Público lê apenas o cache em comprasColetivas/{key}/rastreioAuto (sem chave).
   - Sem chave: modo link (17track/Correios em 1 clique, ilimitado, sem auto-sync).
*/
(function () {
    'use strict';

    const LS_KEY = 'ctad_rastreio_key';
    const LS_PROVIDER = 'ctad_rastreio_provider';
    const INTERVALO_PADRAO_MIN = 60;

    const PROVIDERS = {
        pacotevicio: {
            rotulo: 'PacoteVício (1000/mês grátis p/ sempre via RapidAPI)',
            ajuda: 'Cadastre-se em rapidapi.com → assine o plano BASIC gratuito de "Correios - Rastreamento de Encomendas" → cole o X-RapidAPI-Key aqui.',
            headerKey: 'X-RapidAPI-Key'
        },
        siterastreio: {
            rotulo: 'Site Rastreio (1000/mês grátis p/ sempre com backlink)',
            ajuda: 'Cadastre-se em siterastreio.com.br → inclua o link de volta → pegue a chave da API e cole aqui. Veja o formato na doc deles.',
            headerKey: 'Authorization'
        },
        seurastreio: {
            rotulo: 'SeuRastreio (LEGADO — trial ~7 dias)',
            ajuda: 'Mantido por compatibilidade. Para uso contínuo prefira PacoteVício ou Site Rastreio.',
            headerKey: 'Authorization Bearer'
        }
    };

    function getProvider() {
        try { return localStorage.getItem(LS_PROVIDER) || 'pacotevicio'; } catch (e) { return 'pacotevicio'; }
    }
    function setProvider(v) {
        try { localStorage.setItem(LS_PROVIDER, String(v || 'pacotevicio')); } catch (e) {}
    }
    function getKey() {
        try { return (localStorage.getItem(LS_KEY) || '').trim(); } catch (e) { return ''; }
    }
    function setKey(v) {
        try { localStorage.setItem(LS_KEY, String(v || '').trim()); } catch (e) {}
    }

    // "2026-10-08 16:01:51.000000" (+ objeto {date, timezone}) -> "2026-10-08T16:01:51"
    // (Date.parse falha com microssegundos e espaço; ISO sem fração funciona em todos os browsers)
    function normalizarDataCorreios(dtHrCriado) {
        try {
            let s = (dtHrCriado && typeof dtHrCriado === 'object' ? dtHrCriado.date : dtHrCriado) || '';
            s = String(s).trim();
            if (!s) return new Date().toISOString();
            s = s.split('.')[0].replace(' ', 'T');
            const ms = Date.parse(s);
            return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();
        } catch (e) { return new Date().toISOString(); }
    }

    // unidade { nome: "CHINA" } ou { nome: "", endereco: { cidade: "Valinhos", uf: "SP" } } -> "Valinhos/SP"
    function localUnidadeCorreios(unidade) {
        try {
            if (!unidade) return '';
            const end = unidade.endereco || {};
            const cidadeUf = [end.cidade, end.uf].filter(Boolean).join('/');
            const nome = (unidade.nome || '').trim();
            if (nome && cidadeUf) return nome + ' — ' + cidadeUf;
            return cidadeUf || nome || '';
        } catch (e) { return ''; }
    }

    // Normaliza respostas dos providers para { status, eventoMaisRecente, historico, previsaoEntrega, link }
    // Formatos aceitos: PacoteVício (events/tracking.events), Correios oficial / APIBrasil (eventos[] com
    // dtHrCriado.date + unidade.nome/cidade/uf), seurastreio/siterastreio (eventoMaisRecente + historico).
    function normalizarResposta(provider, raw, codigo) {
        // Desembrulha envelopes tipo { data: { objetos: [...] } } ou { objetos: [...] } (APIBrasil e similares)
        if (raw && !raw.eventos && !raw.events && !raw.eventoMaisRecente) {
            if (raw.data && Array.isArray(raw.data.objetos) && raw.data.objetos.length) raw = raw.data.objetos[0];
            else if (Array.isArray(raw.objetos) && raw.objetos.length) raw = raw.objetos[0];
        }
        // Ramo Correios oficial: eventos[] com dtHrCriado {date} + unidade {nome, endereco{cidade, uf}}
        const evsCorreios = raw && raw.eventos;
        if (Array.isArray(evsCorreios)) {
            const hist = evsCorreios.map(ev => ({
                descricao: ev.descricao || ev.descricaoFrontEnd || '',
                detalhe: ev.detalhe || '',
                data: normalizarDataCorreios(ev.dtHrCriado),
                local: localUnidadeCorreios(ev.unidade)
            })).filter(ev => ev.descricao);
            const primeiro = hist[0] || null;
            return {
                status: raw.situacao ? 'found' : (primeiro ? 'found' : 'no_events'),
                eventoMaisRecente: primeiro,
                historico: hist,
                previsaoEntrega: raw.dtPrevista || null,
                linkDetalhesCompletos: 'https://t.17track.net#nums=' + encodeURIComponent(raw.codObjeto || codigo)
            };
        }
        if (provider === 'pacotevicio') {
            // PacoteVício: { success, tracking: { events: [{status, description, date, location}] } } (formato varia; tenta extrair)
            const evs = (raw && (raw.events || raw.historico || (raw.tracking && raw.tracking.events))) || [];
            const hist = evs.map(ev => ({
                descricao: ev.description || ev.descricao || ev.status || '',
                detalhe: ev.detail || ev.detalhe || '',
                data: ev.date || ev.data || ev.dtHrCriado || new Date().toISOString(),
                local: ev.location || ev.local || ''
            }));
            const primeiro = hist[0] || null;
            return {
                status: raw.status || (primeiro ? 'found' : 'no_events'),
                eventoMaisRecente: primeiro ? { descricao: primeiro.descricao, detalhe: primeiro.detalhe, data: primeiro.data, local: primeiro.local } : null,
                historico: hist,
                previsaoEntrega: raw.previsaoEntrega || null,
                linkDetalhesCompletos: 'https://t.17track.net#nums=' + encodeURIComponent(codigo)
            };
        }
        // seurastreio e siterastreio já devolvem { eventoMaisRecente, historico, ... }
        return raw;
    }

    window.RastreioAuto = {
        getKey,
        setKey,
        getProvider,
        setProvider,
        PROVIDERS,
        intervaloMin: INTERVALO_PADRAO_MIN,

        temChave() { return !!getKey(); },

        // Consulta UM código no provider configurado (retorna JSON normalizado ou lança erro legível)
        async consultarCodigo(codigo) {
            const key = getKey();
            const provider = getProvider();
            if (!key) throw new Error('Sem chave API. Clique em "⚙️ Chave API" e escolha PacoteVício ou Site Rastreio (grátis p/ sempre). Sem chave, use os links 17track/Correios.');
            codigo = String(codigo || '').trim();
            if (!codigo) throw new Error('Código vazio');
            let tentativas = [];
            if (provider === 'pacotevicio') {
                // RapidAPI gateway (padrão oficial: host + 2 headers) + fallback direto do GitHub do provider.
                // Gateway: https://correios-rastreamento-de-encomendas.p.rapidapi.com/correios?tracking_code=XXX
                const gwHost = 'correios-rastreamento-de-encomendas.p.rapidapi.com';
                tentativas.push({
                    url: 'https://' + gwHost + '/correios?tracking_code=' + encodeURIComponent(codigo),
                    headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': gwHost }
                });
                tentativas.push({
                    url: 'https://api.pacotevicio.dev/correios?tracking_code=' + encodeURIComponent(codigo),
                    headers: { 'X-RapidAPI-Key': key }
                });
            } else if (provider === 'siterastreio') {
                // Endpoint exato varia pela doc deles após cadastro; tenta padrão REST. Se 404, ajuste a base aqui.
                tentativas.push({
                    url: 'https://api.siterastreio.com.br/v1/rastreio/' + encodeURIComponent(codigo),
                    headers: { Authorization: 'Bearer ' + key }
                });
            } else {
                tentativas.push({
                    url: 'https://seurastreio.com.br/api/public/rastreio/' + encodeURIComponent(codigo),
                    headers: { Authorization: 'Bearer ' + key }
                });
            }
            let data = null, ultimoErro = null;
            for (const t of tentativas) {
                try {
                    const res = await fetch(t.url, { headers: t.headers });
                    try { data = await res.json(); } catch (e) { ultimoErro = new Error('Resposta inválida do provedor (' + res.status + '). Verifique o provider na config.'); continue; }
                    if (res.status === 401 || res.status === 403) { ultimoErro = new Error('Chave inválida (' + res.status + '). Confira a chave do provider ' + provider + ' na RapidAPI.'); continue; }
                    if (res.status === 402) throw new Error('Plano/cota do provider (' + provider + '). Veja a ajuda do provider.');
                    if (res.status === 429) throw new Error('Cota mensal atingida (429) no ' + provider + '. Aguarde o próximo ciclo.');
                    if (res.status === 404 && tentativas.length > 1) { ultimoErro = new Error('Endpoint 404 — tentando alternativa…'); continue; }
                    if (!res.ok) { ultimoErro = new Error((data && (data.message || data.msg || data.error)) || ('Erro ' + res.status + ' no ' + provider)); continue; }
                    return normalizarResposta(provider, data, codigo);
                } catch (e) {
                    if (/Plano\/cota|Cota mensal/.test(e.message)) throw e;
                    ultimoErro = e;
                }
            }
            throw ultimoErro || new Error('Falha ao consultar ' + provider);
        },

        // Sincroniza UMA compra: consulta códigos, grava rastreioAuto + anexa eventos novos ao histórico
        async sincronizarCompra(compraKey, opts) {
            opts = opts || {};
            const db = getDbSafe();
            if (!db) throw new Error('Banco não conectado');
            const comp = getCompra(compraKey);
            if (!comp) throw new Error('Compra não encontrada');
            const codigos = listaCodigos(comp);
            if (!codigos.length) throw new Error('Sem código de rastreio');
            if (!getKey()) throw new Error('Configure a chave API primeiro');

            // Respeita intervalo (evita gastar cota): padrão 60min, mínimo 11min (cache provider 10min)
            const agora = Date.now();
            const ultimoSync = Number((comp.rastreioAuto && comp.rastreioAuto.atualizadoEm) || 0);
            const intervaloMs = Math.max(11, Number(opts.intervaloMin || INTERVALO_PADRAO_MIN)) * 60 * 1000;
            if (!opts.forcar && (agora - ultimoSync) < intervaloMs) {
                return { pulado: true, motivo: 'cache', proximaEm: new Date(ultimoSync + intervaloMs).toLocaleString('pt-BR') };
            }

            const resultados = [];
            for (const cod of codigos.slice(0, 3)) { // máx 3 códigos por sync (economiza cota)
                try {
                    const data = await this.consultarCodigo(cod);
                    resultados.push({ codigo: cod, ok: true, data });
                    anexarEventosNovos(comp, data, cod);
                } catch (e) {
                    resultados.push({ codigo: cod, ok: false, erro: e.message });
                }
                await esperar(1100); // 10/min por IP no endpoint -> 1 req a cada ~6s seria ideal; 1.1s + intervalo 60min é o equilíbrio
            }

            const auto = {
                atualizadoEm: agora,
                atualizadoPor: ((typeof usuarioAtual !== 'undefined' && usuarioAtual && usuarioAtual.uid) || 'admin'),
                resultados: resultados.map(r => ({
                    codigo: r.codigo,
                    ok: r.ok,
                    erro: r.erro || null,
                    status: r.ok ? (r.data.status || null) : null,
                    evento: r.ok ? (r.data.eventoMaisRecente || null) : null,
                    previsaoEntrega: r.ok ? (r.data.previsaoEntrega || null) : null,
                    link: r.ok ? (r.data.linkDetalhesCompletos || null) : null
                }))
            };
            comp.rastreioAuto = auto;

            // Persiste os códigos usados (cobre o caso de virem do campo ainda não salvo)
            comp.rastreio = codigos[0] || comp.rastreio || '';
            comp.rastreios = codigos.length ? codigos : (comp.rastreios || []);

            // Auto-marca entregue se provider disser
            const algumEntregue = resultados.some(r => r.ok && /entregue/i.test(String((r.data.eventoMaisRecente && (r.data.eventoMaisRecente.descricao || '')) || '')));
            if (algumEntregue) comp.entregue = true;
            comp.ultimaAtualizacao = agora;

            await db.ref(`comprasColetivas/${compraKey}`).update({
                rastreioAuto: auto,
                rastreio: comp.rastreio,
                rastreios: comp.rastreios,
                historico: comp.historico || [],
                entregue: !!comp.entregue,
                ultimaAtualizacao: comp.ultimaAtualizacao
            });
            try { if (typeof renderizarModalComprasColetivas === 'function') renderizarModalComprasColetivas(); } catch (e) {}
            return { pulado: false, resultados };
        },

        // Sincroniza todas as compras pendentes (não entregues, com código), sequencial com pausa
        async sincronizarTodas(opts) {
            opts = opts || {};
            const cache = getComprasCache();
            const keys = Object.keys(cache || {}).filter(k => {
                const c = cache[k];
                if (!c || c.entregue) return false;
                return listaCodigos(c).length > 0;
            });
            const out = [];
            for (const k of keys.slice(0, 20)) {
                try {
                    const r = await this.sincronizarCompra(k, opts);
                    out.push({ compraKey: k, ...r });
                } catch (e) {
                    out.push({ compraKey: k, erro: e.message });
                    if (/401|402|429|chave/i.test(e.message)) break; // para tudo se cota/chave falhou
                }
            }
            return out;
        }
    };

    // ---- internos ----
    function getDbSafe() {
        try { if (typeof db !== 'undefined' && db) return db; } catch (e) {}
        try { if (window.firebase) return window.firebase.database(); } catch (e) {}
        return null;
    }
    function getComprasCache() {
        try { if (typeof comprasColetivasCache !== 'undefined' && comprasColetivasCache) return comprasColetivasCache; } catch (e) {}
        return {};
    }
    function getCompra(k) { return getComprasCache()[k] || null; }
    function listaCodigos(comp) {
        try {
            if (typeof normalizarRastreios === 'function') {
                const doCache = normalizarRastreios(comp);
                if (doCache && doCache.length) return doCache;
            }
        } catch (e) {}
        // Fallback sem normalizarRastreios: aplica a mesma regra (código real nunca tem espaço)
        let base = [];
        if (Array.isArray(comp.rastreios)) base = comp.rastreios;
        else if (comp.rastreio) base = String(comp.rastreio).split(/[,;\n]+/);
        base = base.map(s => String(s || '').trim()).filter(s => s && !/\s/.test(s) && s.length <= 50);
        if (base.length) return base;
        if (base.length) return base;
        // Fallback: código digitado no painel de gestão aberto mas ainda não salvo (evita "Sem código de rastreio")
        try {
            if (typeof document !== 'undefined' && document.getElementById) {
                const principal = document.getElementById('det-rastreio');
                const extras = Array.from(document.querySelectorAll ? document.querySelectorAll('.det-rastreio-extra') : []).map(el => el.value);
                return [principal ? principal.value : ''].concat(extras).map(s => String(s || '').trim()).filter(Boolean);
            }
        } catch (e) {}
        return [];
    }
    function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }

    function anexarEventosNovos(comp, data, codigo) {
        // Provider gratuito retorna só eventoMaisRecente; plano pago retorna historico[] completo.
        const eventos = [];
        if (Array.isArray(data.historico) && data.historico.length) {
            data.historico.forEach(ev => eventos.push(normalizarEvento(ev, codigo)));
        } else if (data.eventoMaisRecente) {
            eventos.push(normalizarEvento(data.eventoMaisRecente, codigo));
        }
        if (!Array.isArray(comp.historico)) comp.historico = [];
        eventos.forEach(ev => {
            const chave = ev.descricao + '|' + ev.data;
            const existe = comp.historico.some(h => (h.descricao + '|' + h.data) === chave);
            if (!existe) {
                comp.historico.push(ev);
                try {
                    if (typeof registrarHistoricoCompra === 'function') {
                        // já fizemos push manual; só garante ordenação/limite via helper
                    }
                } catch (e) {}
            }
        });
        comp.historico.sort((a, b) => (b.data || 0) - (a.data || 0));
        if (comp.historico.length > 50) comp.historico = comp.historico.slice(0, 50);
    }

    function normalizarEvento(ev, codigo) {
        const icone = iconeParaStatus(String(ev.descricao || ''));
        let ts = Date.parse(ev.data) || Date.now();
        return {
            data: ts,
            tipo: 'rastreio',
            descricao: `${icone} [auto ${codigo}] ${ev.descricao || ''}${ev.local ? ' — ' + ev.local : ''}${ev.detalhe ? ' (' + ev.detalhe + ')' : ''}`.trim()
        };
    }

    function iconeParaStatus(desc) {
        const d = desc.toLowerCase();
        if (d.includes('entregue')) return '✅';
        if (d.includes('saiu')) return '📦';
        if (d.includes('trânsito') || d.includes('transito') || d.includes('trito')) return '🚚';
        if (d.includes('postado')) return '📮';
        return '🤖';
    }

    // ---- UI: painel de configuração (chamado pelo compras.js) ----
    window.abrirConfigRastreioAuto = function () {
        const provAtual = (window.RastreioAuto && window.RastreioAuto.getProvider && window.RastreioAuto.getProvider()) || 'pacotevicio';
        const prov = prompt('Provider (digite exatamente):\n- pacotevicio (=1000/mês grátis p/ sempre via RapidAPI) [RECOMENDADO]\n- siterastreio (=1000/mês grátis p/ sempre com backlink)\n- seurastreio (=LEGADO trial ~7 dias)\n\nAtual: ' + provAtual, provAtual);
        if (prov === null) return;
        const provFinal = (prov || 'pacotevicio').trim().toLowerCase();
        if (window.RastreioAuto && window.RastreioAuto.setProvider) window.RastreioAuto.setProvider(provFinal);
        const ajuda = (window.RastreioAuto && window.RastreioAuto.PROVIDERS && window.RastreioAuto.PROVIDERS[provFinal])
            ? window.RastreioAuto.PROVIDERS[provFinal].ajuda : '';
        const atual = (window.RastreioAuto && window.RastreioAuto.getKey) ? window.RastreioAuto.getKey() : '';
        const nova = prompt((ajuda ? ajuda + '\n\n' : '') + 'Cole a chave do provider "' + provFinal + '":', atual || '');
        if (nova === null) return;
        if (window.RastreioAuto && window.RastreioAuto.setKey) window.RastreioAuto.setKey(nova);
        alert(nova.trim() ? 'Salvo neste navegador (' + provFinal + '). Use "🔄 Atualizar agora".' : 'Chave removida.');
        try { if (typeof renderizarModalComprasColetivas === 'function') renderizarModalComprasColetivas(); } catch (e) {}
    };

    window.atualizarRastreioAgora = async function (compraKey) {
        try {
            if (!window.RastreioAuto.temChave()) {
                if (confirm('Rastreio automático precisa de chave gratuita (PacoteVício ou Site Rastreio, grátis p/ sempre). Configurar agora?')) window.abrirConfigRastreioAuto();
                return;
            }
            const btn = document.activeElement;
            if (btn) { btn.disabled = true; btn.textContent = '⏳ Consultando…'; }
            const r = await window.RastreioAuto.sincronizarCompra(compraKey, { forcar: true });
            alert(r.pulado ? 'Ainda em cache. Próxima consulta: ' + r.proximaEm : 'Rastreio atualizado!');
        } catch (e) {
            alert('Falha no rastreio automático: ' + e.message);
        } finally {
            try { if (typeof renderizarModalComprasColetivas === 'function') renderizarModalComprasColetivas(); } catch (e) {}
        }
    };
})();
