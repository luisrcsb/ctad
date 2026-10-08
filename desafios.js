/* CTAD - Central de Telemetria — Área de Desafios entre Pilotos
   Depende de variáveis/funções globais do script principal:
   'db', 'escapeHtml()', 'usuarioAtual', 'pilotoVinculadoAoUsuario',
   'desafiosCache', 'dossiePilotoAbertoNome'.

   Modelo de dados: desafios/{id} = {
     desafiante, desafiado, mensagem, status: 'pendente'|'aceito'|'recusado'|'talvez',
     criadoEm, respondidoEm?
   }
   Desafios com status "aceito" aparecem publicamente no card "⚔️ Desafios
   Ativos" do dashboard. Os demais só aparecem pra quem enviou/recebeu, dentro
   de "Minha Conta". */

        function formatarDataDesafio(ts) {
            if (!ts) return '';
            try {
                return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            } catch (e) { return ''; }
        }

        // Cria um desafio a partir do Dossiê de outro piloto. Só funciona
        // logado e vinculado a um piloto diferente do desafiado.
        window.criarDesafio = async function(nomeDesafiado) {
            if (!db || !usuarioAtual || !pilotoVinculadoAoUsuario) return;
            if (pilotoVinculadoAoUsuario === nomeDesafiado) { alert("Você não pode desafiar a si mesmo! 😄"); return; }

            let mensagem = prompt(`Desafiar ${nomeDesafiado}! Quer deixar uma mensagem? (opcional)`, "");
            if (mensagem === null) return;

            let id = 'desafio_' + Date.now();
            try {
                await db.ref(`desafios/${id}`).set({
                    desafiante: pilotoVinculadoAoUsuario,
                    desafiado: nomeDesafiado,
                    mensagem: mensagem.trim(),
                    status: 'pendente',
                    criadoEm: Date.now(),
                    vitoriasDesafiante: 0,
                    vitoriasDesafiado: 0
                });
                alert(`Desafio enviado pra ${nomeDesafiado}!`);
            } catch (err) { alert("Erro: " + err.message); }
        };

        // O piloto desafiado responde: 'aceito', 'recusado' ou 'talvez'.
        window.responderDesafio = async function(desafioId, novoStatus) {
            if (!db) return;
            let desafio = (desafiosCache || {})[desafioId];
            if (!desafio) { alert("Desafio não encontrado."); return; }
            let ehDesafiado = pilotoVinculadoAoUsuario && desafio.desafiado === pilotoVinculadoAoUsuario;
            if (!hasPerm('desafios', 'gerenciar') && !ehDesafiado) {
                alert("🔒 Apenas o piloto desafiado pode responder a este desafio.");
                return;
            }
            try {
                await db.ref(`desafios/${desafioId}`).update({ status: novoStatus, respondidoEm: Date.now() });
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.excluirDesafio = async function(desafioId) {
            if (!db) return;
            let desafio = (desafiosCache || {})[desafioId];
            if (!desafio) { alert("Desafio não encontrado."); return; }
            let ehParte = pilotoVinculadoAoUsuario &&
                (desafio.desafiante === pilotoVinculadoAoUsuario || desafio.desafiado === pilotoVinculadoAoUsuario);
            if (!hasPerm('desafios', 'gerenciar') && !ehParte) {
                alert("🔒 Apenas um dos pilotos envolvidos pode remover este desafio.");
                return;
            }
            if (!confirm("Remover este desafio?")) return;
            try { await db.ref(`desafios/${desafioId}`).remove(); } catch (err) { alert("Erro: " + err.message); }
        };

        // Monta o HTML da seção de desafios (recebidos + enviados) pra inserir
        // dentro do modal "Minha Conta". Retorna '' se não houver piloto vinculado.
        function renderizarSecaoDesafiosMinhaConta() {
            if (!pilotoVinculadoAoUsuario) return '';

            // Escapa valor para uso dentro de atributo HTML onclick="...('...')".
            // Contexto: string JS entre aspas simples, dentro de atributo entre aspas duplas.
            function escJs(v) {
                return String(v == null ? '' : v)
                    .replace(/\\/g, '\\\\')
                    .replace(/&/g, '&amp;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, "\\'")
                    .replace(/\r/g, '\\r')
                    .replace(/\n/g, '\\n');
            }

            let ids = Object.keys(desafiosCache || {});
            let recebidos = ids.filter(id => desafiosCache[id].desafiado === pilotoVinculadoAoUsuario && desafiosCache[id].status === 'pendente');
            let enviados = ids.filter(id => desafiosCache[id].desafiante === pilotoVinculadoAoUsuario)
                .sort((a, b) => (desafiosCache[b].criadoEm || 0) - (desafiosCache[a].criadoEm || 0));

            let recebidosHtml = recebidos.map(id => {
                let d = desafiosCache[id];
                return `
                    <div class="config-panel">
                        <div style="font-size:0.82rem; color:var(--text-title);"><strong>${escapeHtml(d.desafiante)}</strong> te desafiou!</div>
                        ${d.mensagem ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">"${escapeHtml(d.mensagem)}"</div>` : ''}
                        <div style="display:flex; gap:6px; margin-top:8px;">
                            <button class="btn-action-primary" style="padding:4px 10px; font-size:0.72rem; background:var(--accent-green);" onclick="responderDesafio('${escJs(id)}','aceito')">✅ Aceitar</button>
                            <button class="btn" style="background:var(--bg-body); border:1px solid var(--border-card); color:#fff; padding:4px 10px; font-size:0.72rem;" onclick="responderDesafio('${escJs(id)}','talvez')">🤔 Talvez</button>
                            <button class="btn-action-danger" style="padding:4px 10px; font-size:0.72rem;" onclick="responderDesafio('${escJs(id)}','recusado')">❌ Recusar</button>
                        </div>
                    </div>`;
            }).join('');

            let statusTexto = { pendente: '⏳ Aguardando resposta', aceito: '✅ Aceito', recusado: '❌ Recusado', talvez: '🤔 Talvez' };
            let enviadosHtml = enviados.map(id => {
                let d = desafiosCache[id];
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; padding:4px 0; border-bottom:1px dashed var(--border-card);">
                        <span>Desafiou <strong>${escapeHtml(d.desafiado)}</strong></span>
                        <span style="color:var(--text-muted);">${statusTexto[d.status] || d.status}</span>
                    </div>`;
            }).join('');

            return `
                <div class="config-panel">
                    <div class="config-panel-title">⚔️ Desafios Recebidos</div>
                    <div style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">
                        ${recebidosHtml || `<span style="font-size:0.75rem; color:var(--text-muted);">Nenhum desafio pendente.</span>`}
                    </div>
                </div>
                ${enviados.length > 0 ? `
                <div class="config-panel">
                    <div class="config-panel-title">📤 Desafios Enviados</div>
                    <div style="margin-top:4px;">${enviadosHtml}</div>
                </div>` : ''}
            `;
        }

        // Card público do dashboard: mostra os desafios ACEITOS (visíveis pra
        // todo mundo, sem precisar estar logado).

        // Busca a imagem do carro de um piloto (primeira foto encontrada)
        async function getCarroImagemPiloto(nomePiloto) {
            try {
                let metaKey = nomePiloto.replace(/[.#$\/\[\]]/g, '_');
                let snap = await db.ref('pilotosMetadados/' + metaKey + '/carros').once('value');
                let carros = snap.val() || {};
                let keys = Object.keys(carros);
                if (keys.length > 0 && carros[keys[0]] && carros[keys[0]].imagem) {
                    return carros[keys[0]].imagem;
                }
            } catch (e) {}
            return null;
        }

        // Compartilha um desafio
        function compartilharDesafio(id) {
            let d = desafiosCache[id];
            if (!d) return;
            let texto = '⚔️ Desafio CTAD: ' + d.desafiante + ' vs ' + d.desafiado + ' - Placar: ' + d.vitoriasDesafiante + ' x ' + d.vitoriasDesafiado;
            if (navigator.share) {
                navigator.share({ title: 'Desafio CTAD', text: texto, url: window.location.href });
            } else {
                navigator.clipboard.writeText(texto + ' ' + window.location.href).then(() => alert('Link copiado!'));
            }
        }

        function renderizarWidgetDesafiosPublicos() {
            let container = document.getElementById('kpi-desafios-conteudo');
            if (!container) return;

            let ids = Object.keys(desafiosCache || {}).filter(id => desafiosCache[id].status === 'aceito')
                .sort((a, b) => (desafiosCache[b].respondidoEm || 0) - (desafiosCache[a].respondidoEm || 0));

            if (ids.length === 0) {
                container.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem;">Nenhum desafio ativo no momento.</div>';
                return;
            }

            container.innerHTML = ids.slice(0, 6).map(id => {
                let d = desafiosCache[id];
                let vD = d.vitoriasDesafiante || 0;
                let vP = d.vitoriasDesafiado || 0;
                return '<div style="background:var(--bg-input); padding:10px 12px; border-radius:8px; border:1px solid var(--border-card); display:flex; align-items:center; gap:10px;">' +
                    '<div style="flex:1; min-width:0;">' +
                        '<div style="display:flex; align-items:center; gap:8px;">' +
                            '<div style="width:36px; height:36px; border-radius:6px; background:var(--bg-body); overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">🏎️</div>' +
                            '<div style="min-width:0;">' +
                                '<div style="font-size:0.78rem; color:var(--text-title); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(d.desafiante) + '</div>' +
                                '<div style="font-size:0.68rem; color:var(--text-muted);">Desafiante</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div style="text-align:center; flex-shrink:0;">' +
                        '<div style="font-size:1.1rem; font-weight:700; color:var(--accent-gold);">' + vD + ' x ' + vP + '</div>' +
                        '<div style="font-size:0.6rem; color:var(--text-muted);">Placar</div>' +
                    '</div>' +
                    '<div style="flex:1; min-width:0;">' +
                        '<div style="display:flex; align-items:center; gap:8px; justify-content:flex-end;">' +
                            '<div style="text-align:right; min-width:0;">' +
                                '<div style="font-size:0.78rem; color:var(--text-title); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(d.desafiado) + '</div>' +
                                '<div style="font-size:0.68rem; color:var(--text-muted);">Desafiado</div>' +
                            '</div>' +
                            '<div style="width:36px; height:36px; border-radius:6px; background:var(--bg-body); overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">🏎️</div>' +
                        '</div>' +
                    '</div>' +
                    '<button onclick="compartilharDesafio(\'' + escJs(id) + '\')" style="background:var(--bg-body); border:1px solid var(--border-card); color:var(--text-main); width:28px; height:28px; border-radius:6px; cursor:pointer; font-size:0.85rem; flex-shrink:0;" title="Compartilhar">📤</button>' +
                '</div>';
            }).join('');
        }
