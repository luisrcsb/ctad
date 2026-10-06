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
                    criadoEm: Date.now()
                });
                alert(`Desafio enviado pra ${nomeDesafiado}!`);
            } catch (err) { alert("Erro: " + err.message); }
        };

        // O piloto desafiado responde: 'aceito', 'recusado' ou 'talvez'.
        window.responderDesafio = async function(desafioId, novoStatus) {
            if (!db) return;
            try {
                await db.ref(`desafios/${desafioId}`).update({ status: novoStatus, respondidoEm: Date.now() });
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.excluirDesafio = async function(desafioId) {
            if (!db) return;
            if (!confirm("Remover este desafio?")) return;
            try { await db.ref(`desafios/${desafioId}`).remove(); } catch (err) { alert("Erro: " + err.message); }
        };

        // Monta o HTML da seção de desafios (recebidos + enviados) pra inserir
        // dentro do modal "Minha Conta". Retorna '' se não houver piloto vinculado.
        function renderizarSecaoDesafiosMinhaConta() {
            if (!pilotoVinculadoAoUsuario) return '';

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
                            <button class="btn-action-primary" style="padding:4px 10px; font-size:0.72rem; background:var(--accent-green);" onclick="responderDesafio('${id}','aceito')">✅ Aceitar</button>
                            <button class="btn" style="background:var(--bg-body); border:1px solid var(--border-card); color:#fff; padding:4px 10px; font-size:0.72rem;" onclick="responderDesafio('${id}','talvez')">🤔 Talvez</button>
                            <button class="btn-action-danger" style="padding:4px 10px; font-size:0.72rem;" onclick="responderDesafio('${id}','recusado')">❌ Recusar</button>
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
        function renderizarWidgetDesafiosPublicos() {
            let container = document.getElementById('kpi-desafios-conteudo');
            if (!container) return;

            let ids = Object.keys(desafiosCache || {}).filter(id => desafiosCache[id].status === 'aceito')
                .sort((a, b) => (desafiosCache[b].respondidoEm || 0) - (desafiosCache[a].respondidoEm || 0));

            if (ids.length === 0) {
                container.innerHTML = `<div style="color:var(--text-muted); font-size:0.8rem;">Nenhum desafio ativo no momento.</div>`;
                return;
            }

            container.innerHTML = ids.slice(0, 6).map(id => {
                let d = desafiosCache[id];
                return `
                    <div style="background:var(--bg-input); padding:8px 12px; border-radius:6px; border:1px solid var(--border-card); display:flex; justify-content:space-between; align-items:center; gap:8px;">
                        <div>
                            <strong style="color:var(--text-title); font-size:0.82rem;">⚔️ ${escapeHtml(d.desafiante)} vs ${escapeHtml(d.desafiado)}</strong>
                            ${d.mensagem ? `<div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">"${escapeHtml(d.mensagem)}"</div>` : ''}
                        </div>
                        <span style="font-size:0.68rem; color:var(--text-muted); white-space:nowrap;">${formatarDataDesafio(d.respondidoEm || d.criadoEm)}</span>
                    </div>`;
            }).join('');
        }
