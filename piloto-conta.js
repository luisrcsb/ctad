/* CTAD - Central de Telemetria — Conta do Piloto (Fase 1: cadastro + aprovação; Fase 2: recuperação de senha + gestão de contas vinculadas)
   Depende de variáveis/funções globais do script principal:
   'db', 'auth' (Firebase), 'escapeHtml()', 'hasPerm', 'usuarioAtual',
   'pilotoVinculadoAoUsuario', 'solicitacoesCadastroCache', 'usuariosPilotosCache',
   'usuariosCache', 'pilotosMetadadosCache',
   'obterTodosDadosConsolidados()', 'abrirDossiePiloto()'.

   Modelo de dados:
   - solicitacoesCadastro/{uid} = { email, nomeSolicitado, status: 'pendente'|'aprovado'|'rejeitado', criadoEm }
   - usuariosPilotos/{uid} = { piloto: "Nome Exato do Piloto", vinculadoEm }
   - usuarios/{uid} = { uid, email, slug, nivel, criadoEm, atualizadoEm }
    - admins/{uid} = true (gerenciado só manualmente pelo console do Firebase) */

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

        // ===================== Modal "Minha Conta" (público) =====================

        window.abrirModalMinhaConta = function() {
            let modal = document.getElementById('minha-conta-modal');
            if (modal) modal.style.display = 'flex';
            atualizarUiContaPiloto();
        };

        window.fecharModalMinhaConta = function() {
            let modal = document.getElementById('minha-conta-modal');
            if (modal) modal.style.display = 'none';
        };

        // Redesenha o conteúdo do modal conforme o estado: deslogado, logado e
        // aprovado, logado e aguardando aprovação, ou logado como admin.
        function atualizarUiContaPiloto() {
            let corpo = document.getElementById('minha-conta-corpo');
            if (!corpo) return;

            if (!usuarioAtual) {
                corpo.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:14px;">
                        <div class="config-panel">
                            <div class="config-panel-title">Já tenho conta</div>
                            <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">
                                <input type="email" id="conta-login-email" class="config-input" placeholder="E-mail">
                                <input type="password" id="conta-login-senha" class="config-input" placeholder="Senha">
                                <button class="btn-action-primary" onclick="fazerLoginPiloto()">Entrar</button>
                                <div style="display:flex; justify-content:center;">
                                    <button class="btn-text-action" style="font-size:0.74rem;" onclick="alternarFormRecuperarSenha()">Esqueci minha senha</button>
                                </div>
                                <div id="conta-recuperar-box" style="display:none; flex-direction:column; gap:6px; border-top:1px dashed var(--border-card); padding-top:8px; margin-top:2px;">
                                    <div style="font-size:0.72rem; color:var(--text-muted);">Informe o e-mail da sua conta: enviamos um link pra você criar uma nova senha.</div>
                                    <input type="email" id="conta-recuperar-email" class="config-input" placeholder="E-mail cadastrado">
                                    <button class="btn-action-primary" style="background:#2ec4b6; color:#000;" onclick="recuperarSenhaPiloto()">📧 Enviar link de redefinição</button>
                                </div>
                            </div>
                        </div>
                        <div class="config-panel">
                            <div class="config-panel-title">Ainda não tenho conta</div>
                            <p style="font-size:0.72rem; color:var(--text-muted); margin:2px 0 6px;">Depois de se cadastrar, o administrador precisa vincular sua conta a um piloto já existente na base antes de você ver seu painel pessoal.</p>
                            <div style="display:flex; flex-direction:column; gap:6px;">
                                <input type="text" id="conta-cadastro-nome" class="config-input" placeholder="Seu nome (como é conhecido nas corridas)">
                                <input type="email" id="conta-cadastro-email" class="config-input" placeholder="E-mail">
                                <input type="password" id="conta-cadastro-senha" class="config-input" placeholder="Crie uma senha (mín. 6 caracteres)">
                                <button class="btn-action-primary" style="background:#2ec4b6; color:#000;" onclick="cadastrarPiloto()">Cadastrar</button>
                            </div>
                        </div>
                        ${renderizarSecaoAcessibilidadeMinhaConta()}
                    </div>`;
                return;
            }

            if (hasPerm('contas', 'aprovar')) {
                corpo.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; background:var(--bg-input); border:1px solid var(--border-card); border-radius:8px; padding:8px 12px;">
                        <span style="color:var(--text-muted); font-size:0.85rem;">Você está logado como administrador (<span style="color:var(--text-title);">${escapeHtml(usuarioAtual.email || '')}</span>)</span>
                        <button class="btn-action-danger" onclick="logoutContaPiloto()">Deslogar</button>
                    </div>
                    ${renderizarAcoesRapidasMinhaConta()}
                    ${renderizarSecoesMembroMinhaConta()}
                    ${renderizarSecaoAcessibilidadeMinhaConta()}`;
                return;
            }

            if (pilotoVinculadoAoUsuario) {
                corpo.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                        <div style="font-size:0.9rem; color:var(--text-title);">👋 Bem-vindo, <strong>${escapeHtml(pilotoVinculadoAoUsuario)}</strong>! <span style="font-size:0.75rem; color:var(--text-muted); word-break:break-all;">(${escapeHtml(usuarioAtual.email || '')})</span></div>
                        <button class="btn-action-danger" onclick="logoutContaPiloto()">Deslogar</button>
                    </div>
                    ${renderizarAcoesRapidasMinhaConta()}
                    ${renderizarSecoesMembroMinhaConta()}
                    ${renderizarSecaoAcessibilidadeMinhaConta()}`;
                return;
            }

            corpo.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                    <span style="color:var(--text-muted); font-size:0.85rem;">✅ Cadastro recebido (<span style="color:var(--text-title); word-break:break-all;">${escapeHtml(usuarioAtual.email || '')}</span>)</span>
                    <button class="btn-action-danger" onclick="logoutContaPiloto()">Deslogar</button>
                </div>
                ${renderizarAcoesRapidasMinhaConta()}
                <div style="color:var(--text-muted); font-size:0.8rem;">Assim que o administrador vincular sua conta a um piloto, seu painel pessoal aparece aqui.</div>
                ${renderizarSecaoAcessibilidadeMinhaConta()}`;
        }

        // ===================== Ações rápidas (conta logada) =====================
        // Concentra aqui o que antes ficava no cabeçalho do site: "📄 Gerar
        // Relatório" (toda conta logada) e "🔐 Administração" (só administrador).
        function renderizarAcoesRapidasMinhaConta() {
            let botoes = [];
            if (pilotoVinculadoAoUsuario) {
                botoes.push(`<button class="btn-action-primary" onclick="fecharModalMinhaConta(); abrirDossiePiloto('${escJs(pilotoVinculadoAoUsuario)}')">📊 Ver Meu Dossiê</button>`);
            }
            botoes.push(`<button class="btn-action-primary" style="background:var(--bg-input); border:1px solid var(--border-card); color:var(--text-main);" onclick="fecharModalMinhaConta(); gerarRelatórioPDF()">📄 Gerar Relatório</button>`);
            if (hasPerm('contas', 'aprovar')) {
                botoes.push(`<button class="btn-admin-trigger" onclick="fecharModalMinhaConta(); abrirModalAdmin()">🔐 Administração</button>`);
            }
            return `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; margin-bottom:14px;">${botoes.join('')}</div>`;
        }

        // Seções do piloto vinculado (compras coletivas, lista de desejos e
        // desafios). Retorna '' para contas sem vínculo com um piloto.
        function renderizarSecoesMembroMinhaConta() {
            if (!pilotoVinculadoAoUsuario) return '';
            let secaoCompras = renderizarSecaoComprasMinhaConta();
            let secaoDesejos = typeof renderizarListaDesejosMinhaConta === 'function' ? renderizarListaDesejosMinhaConta() : '';
            let secaoDesafios = typeof renderizarSecaoDesafiosMinhaConta === 'function' ? renderizarSecaoDesafiosMinhaConta() : '';
            return `${secaoCompras}${secaoDesejos}${secaoDesafios}`;
        }

        // ===================== Minhas Compras Coletivas =====================
        // Lista apenas as compras em que o piloto da conta logada está como
        // participante ativo, mostrando a situação do próprio bolso
        // (pago/pendente) e o valor da sua cota.
        function renderizarSecaoComprasMinhaConta() {
            if (!pilotoVinculadoAoUsuario || typeof comprasColetivasCache === 'undefined') return '';
            if (typeof ordenarChavesComprasPorAtualizacao !== 'function') return '';

            let meuNome = String(pilotoVinculadoAoUsuario).trim().toLowerCase();
            let minhas = [];

            ordenarChavesComprasPorAtualizacao(Object.keys(comprasColetivasCache)).forEach(k => {
                let comp = comprasColetivasCache[k];
                if (!comp) return;

                // Participação = registro salvo no banco pra este piloto.
                // A sincronização abaixo adiciona todo mundo localmente, então
                // checamos antes pra não listar compras em que ele não entrou.
                let participacaoSalva = Object.values(comp.participantes || {}).some(p =>
                    p && p.nome && String(p.nome).trim().toLowerCase() === meuNome);
                if (!participacaoSalva) return;

                if (typeof sincronizarParticipantesCompra === 'function') sincronizarParticipantesCompra(comp);
                if (typeof calcularValoresDevidosCompra === 'function') calcularValoresDevidosCompra(comp);

                let part = Object.values(comp.participantes || {}).find(p =>
                    p && p.nome && String(p.nome).trim().toLowerCase() === meuNome);
                if (!part || !part.ativo) return;
                minhas.push({ k: k, comp: comp, part: part });
            });

            if (minhas.length === 0) return '';

            let linhas = minhas.map(item => {
                let pago = !!item.part.pago;
                let valor = Number(item.part.valorDevido) || 0;
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:6px 0; border-bottom:1px dashed var(--border-card);">
                        <div style="min-width:0;">
                            <div style="font-size:0.8rem; color:var(--text-title); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🛒 ${escapeHtml(item.comp.nome || item.comp.chave)}</div>
                            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">Sua cota: <strong style="color:var(--accent-gold);">R$ ${valor.toFixed(2)}</strong></div>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                            <span style="font-size:0.72rem; font-weight:700; color:${pago ? 'var(--accent-green)' : 'var(--accent-red)'};">${pago ? 'Pago ✅' : 'Pendente ⏳'}</span>
                            <button class="btn" style="background:var(--bg-body); border:1px solid var(--border-card); color:#fff; padding:3px 8px; font-size:0.7rem;" onclick="fecharModalMinhaConta(); resumirCompraColetiva('${escJs(item.k)}')">Resumo</button>
                        </div>
                    </div>`;
            }).join('');

            return `
                <div class="config-panel">
                    <div class="config-panel-title">🛒 Minhas Compras Coletivas</div>
                    <div style="margin-top:4px;">${linhas}</div>
                </div>`;
        }

        // Seção de acessibilidade de "Minha Conta" — reduzida a um único
        // botão; a explicação (alto contraste e filtros de daltonismo) aparece
        // apenas no tooltip ao passar o mouse, pra não poluir a interface.
        // Disponível em qualquer estado de login, já que é uma preferência do
        // navegador/visitante, não do piloto.
        function renderizarSecaoAcessibilidadeMinhaConta() {
            return `
                <div class="config-panel" style="margin-top:14px;">
                    <button class="btn" style="width:100%; background:var(--bg-body); border:1px solid var(--border-card); color:#fff;" title="Alto contraste e filtros de daltonismo (protanopia, deuteranopia, tritanopia e acromatopsia). Passe o mouse aqui pra ver a explicação — as opções abrem em uma janela separada." onclick="abrirModalAcessibilidade()">♿ Acessibilidade</button>
                </div>`;
        }

        window.fazerLoginPiloto = async function() {
            if (!auth) { alert("❌ Autenticação indisponível no momento."); return; }
            let email = document.getElementById('conta-login-email')?.value.trim();
            let senha = document.getElementById('conta-login-senha')?.value;
            if (!email || !senha) { alert("Preencha e-mail e senha."); return; }
            try {
                await auth.signInWithEmailAndPassword(email, senha);
                atualizarUiContaPiloto();
            } catch (err) {
                alert("❌ E-mail ou senha incorretos.");
            }
        };

        // Abre/fecha o bloco de recuperação de senha. Ao abrir, reaproveita o
        // e-mail já digitado no campo de login, se houver.
        window.alternarFormRecuperarSenha = function() {
            let box = document.getElementById('conta-recuperar-box');
            if (!box) return;
            let visivel = box.style.display === 'flex';
            box.style.display = visivel ? 'none' : 'flex';
            if (!visivel) {
                let emailLogin = document.getElementById('conta-login-email')?.value.trim();
                let input = document.getElementById('conta-recuperar-email');
                if (input) {
                    if (emailLogin && !input.value) input.value = emailLogin;
                    input.focus();
                }
            }
        };

        window.recuperarSenhaPiloto = async function() {
            if (!auth) { alert("❌ Autenticação indisponível no momento."); return; }
            let email = document.getElementById('conta-recuperar-email')?.value.trim();
            if (!email) { alert("Informe o e-mail cadastrado."); return; }
            try {
                await auth.sendPasswordResetEmail(email);
                alert(`📧 Enviamos um link de redefinição de senha para ${email}. Confira também a caixa de spam.`);
                fecharModalMinhaConta();
            } catch (err) {
                if (err.code === 'auth/user-not-found') alert("❌ Nenhuma conta encontrada com esse e-mail.");
                else if (err.code === 'auth/invalid-email') alert("❌ E-mail inválido.");
                else alert("❌ Erro ao enviar o link: " + err.message);
            }
        };

        window.cadastrarPiloto = async function() {
            if (!auth || !db) { alert("❌ Autenticação indisponível no momento."); return; }
            let nome = document.getElementById('conta-cadastro-nome')?.value.trim();
            let email = document.getElementById('conta-cadastro-email')?.value.trim();
            let senha = document.getElementById('conta-cadastro-senha')?.value;
            if (!nome || !email || !senha) { alert("Preencha todos os campos."); return; }
            if (senha.length < 6) { alert("A senha precisa ter pelo menos 6 caracteres."); return; }

            try {
                let cred = await auth.createUserWithEmailAndPassword(email, senha);
                await db.ref(`solicitacoesCadastro/${cred.user.uid}`).set({
                    email: email,
                    nomeSolicitado: nome,
                    status: 'pendente',
                    criadoEm: Date.now()
                });
                atualizarUiContaPiloto();
            } catch (err) {
                if (err.code === 'auth/email-already-in-use') alert("❌ Esse e-mail já tem cadastro. Tente entrar em vez de cadastrar.");
                else alert("❌ Erro ao cadastrar: " + err.message);
            }
        };

        window.logoutContaPiloto = function() {
            if (auth) auth.signOut();
            fecharModalMinhaConta();
        };

        // ===================== Painel Admin: Solicitações de Acesso =====================

        window.abrirModalSolicitacoesCadastro = function() {
            let modal = document.getElementById('solicitacoes-cadastro-modal');
            if (modal) modal.style.display = 'flex';
            renderizarPainelSolicitacoesCadastro();
        };

        window.fecharModalSolicitacoesCadastro = function() {
            let modal = document.getElementById('solicitacoes-cadastro-modal');
            if (modal) modal.style.display = 'none';
        };

        function renderizarPainelSolicitacoesCadastro() {
            let corpo = document.getElementById('solicitacoes-cadastro-corpo');
            if (!corpo) return;

            let ids = Object.keys(solicitacoesCadastroCache || {}).sort((a, b) =>
                (solicitacoesCadastroCache[b]?.criadoEm || 0) - (solicitacoesCadastroCache[a]?.criadoEm || 0)
            );

            // Monta a lista de pilotos já conhecidos (cadastrados ou que já correram)
            // pra popular o select de vínculo.
            let nomesSet = new Set(Object.keys(pilotosMetadadosCache || {}));
            (typeof obterTodosDadosConsolidados === 'function' ? obterTodosDadosConsolidados() : []).forEach(d => nomesSet.add(d.piloto));
            let nomesPilotos = Array.from(nomesSet).filter(n => n && n.trim()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
            let optionsPilotos = `<option value="">Selecione o piloto...</option>` + nomesPilotos.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');

            let listaHtml = ids.map(uid => {
                let s = solicitacoesCadastroCache[uid] || {};
                let corStatus = s.status === 'aprovado' ? 'var(--accent-green)' : s.status === 'rejeitado' ? 'var(--accent-red)' : 'var(--accent-gold)';
                let dataFormatada = s.criadoEm ? new Date(s.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

                let acoesHtml = s.status === 'pendente' ? `
                    <div style="display:flex; gap:6px; margin-top:6px;">
                        <select id="select-vincular-${uid}" class="config-select" style="font-size:0.75rem; flex:1;">${optionsPilotos}</select>
                        <button class="btn-action-primary" style="padding:4px 10px; font-size:0.74rem;" onclick="aprovarSolicitacaoCadastro('${escJs(uid)}')">✅ Vincular</button>
                        <button class="btn-action-danger" style="padding:4px 10px; font-size:0.74rem;" onclick="rejeitarSolicitacaoCadastro('${escJs(uid)}')">❌ Rejeitar</button>
                    </div>` : '';

                return `
                    <div class="config-panel">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong style="font-size:0.85rem; color:var(--text-title);">${escapeHtml(s.nomeSolicitado || '(sem nome)')}</strong>
                            <span style="font-size:0.68rem; font-weight:700; color:${corStatus};">${(s.status || 'pendente').toUpperCase()}</span>
                        </div>
                        <div style="font-size:0.72rem; color:var(--text-muted);">${escapeHtml(s.email || '')} • ${dataFormatada}</div>
                        ${acoesHtml}
                    </div>`;
            }).join('');

            corpo.innerHTML = listaHtml || `<div style="color:var(--text-muted);">Nenhuma solicitação de cadastro ainda.</div>`;
        }

        window.aprovarSolicitacaoCadastro = async function(uid) {
            if (!exigirAcessoAdmin('contas', 'aprovar')) return;
            if (!db) return;
            let select = document.getElementById(`select-vincular-${uid}`);
            let piloto = select ? select.value : '';
            if (!piloto) { alert("Selecione um piloto pra vincular antes de aprovar."); return; }
            try {
                await db.ref(`usuariosPilotos/${uid}`).set({ piloto: piloto, vinculadoEm: Date.now() });
                await db.ref(`solicitacoesCadastro/${uid}/status`).set('aprovado');
                alert(`Conta vinculada a "${piloto}"!`);
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.rejeitarSolicitacaoCadastro = async function(uid) {
            if (!exigirAcessoAdmin('contas', 'aprovar')) return;
            if (!db) return;
            if (!confirm("Rejeitar esta solicitação de cadastro?")) return;
            try {
                await db.ref(`solicitacoesCadastro/${uid}/status`).set('rejeitado');
            } catch (err) { alert("Erro: " + err.message); }
        };

        // ===================== Painel Admin: Contas Vinculadas =====================
        // Espelho do que já foi aprovado: cada conta (uid) ligada a um piloto.
        // Daqui o administrador corrige vínculos errados (revincular) ou tira
        // o acesso ao painel pessoal (desvincular) — neste caso a solicitação
        // volta a aparecer como pendente em "Solicitações de Acesso".

        window.abrirModalContasVinculadas = function() {
            if (!exigirAcessoAdmin('contas', 'aprovar')) return;
            let modal = document.getElementById('contas-vinculadas-modal');
            if (modal) modal.style.display = 'flex';
            renderizarPainelContasVinculadas();
        };

        window.fecharModalContasVinculadas = function() {
            let modal = document.getElementById('contas-vinculadas-modal');
            if (modal) modal.style.display = 'none';
        };

        function renderizarPainelContasVinculadas() {
            let corpo = document.getElementById('contas-vinculadas-corpo');
            if (!corpo) return;

            let vinculos = usuariosPilotosCache || {};
            let ids = Object.keys(vinculos).sort((a, b) =>
                (vinculos[b]?.vinculadoEm || 0) - (vinculos[a]?.vinculadoEm || 0)
            );

            // Mesma base de nomes do painel de solicitações: pilotos conhecidos
            // por metadados ou que já correram pelo menos uma vez.
            let nomesSet = new Set(Object.keys(pilotosMetadadosCache || {}));
            (typeof obterTodosDadosConsolidados === 'function' ? obterTodosDadosConsolidados() : []).forEach(d => nomesSet.add(d.piloto));
            // Garante que o piloto atualmente vinculado apareça no select mesmo
            // que ainda não esteja na base (vínculo manual antigo).
            ids.forEach(uid => { if (vinculos[uid]?.piloto) nomesSet.add(vinculos[uid].piloto); });
            let nomesPilotos = Array.from(nomesSet).filter(n => n && n.trim()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

            let linhasHtml = ids.map(uid => {
                let v = vinculos[uid] || {};
                let email = (usuariosCache && usuariosCache[uid]?.email) || (solicitacoesCadastroCache && solicitacoesCadastroCache[uid]?.email) || '';
                let dataFormatada = v.vinculadoEm ? new Date(v.vinculadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                let optionsPilotos = `<option value="">Selecione o piloto...</option>` + nomesPilotos.map(n =>
                    `<option value="${escapeHtml(n)}" ${String(v.piloto || '') === n ? 'selected' : ''}>${escapeHtml(n)}</option>`
                ).join('');

                return `
                    <div class="config-panel">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                            <div style="min-width:0;">
                                <strong style="font-size:0.85rem; color:var(--text-title); word-break:break-all;">${escapeHtml(email || uid)}</strong>
                                <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">Vinculado a <span style="color:var(--accent-gold); font-weight:700;">${escapeHtml(v.piloto || '(sem piloto)')}</span>${dataFormatada ? ` • ${dataFormatada}` : ''}</div>
                            </div>
                        </div>
                        <div style="display:flex; gap:6px; margin-top:6px;">
                            <select id="select-revincular-${uid}" class="config-select" style="font-size:0.75rem; flex:1;">${optionsPilotos}</select>
                            <button class="btn-action-primary" style="padding:4px 10px; font-size:0.74rem; white-space:nowrap;" onclick="revincularContaPiloto('${escJs(uid)}')">🔗 Revincular</button>
                            <button class="btn-action-danger" style="padding:4px 10px; font-size:0.74rem; white-space:nowrap;" onclick="desvincularContaPiloto('${escJs(uid)}')">✂️ Desvincular</button>
                        </div>
                    </div>`;
            }).join('');

            corpo.innerHTML = linhasHtml || `<div style="color:var(--text-muted);">Nenhuma conta vinculada ainda.</div>`;
        }

        window.revincularContaPiloto = async function(uid) {
            if (!exigirAcessoAdmin('contas', 'aprovar')) return;
            if (!db) return;
            let select = document.getElementById(`select-revincular-${uid}`);
            let piloto = select ? select.value : '';
            let atual = (usuariosPilotosCache && usuariosPilotosCache[uid]?.piloto) || '';
            if (!piloto) { alert("Selecione o piloto pra revincular."); return; }
            if (piloto === atual) { alert("Essa conta já está vinculada a esse piloto."); return; }
            if (!confirm(`Revincular esta conta de "${atual || '(sem piloto)'}" para "${piloto}"?`)) return;
            try {
                await db.ref(`usuariosPilotos/${uid}`).set({ piloto: piloto, vinculadoEm: Date.now() });
                await db.ref(`solicitacoesCadastro/${uid}/status`).set('aprovado');
                alert(`Conta revinculada a "${piloto}"!`);
            } catch (err) { alert("Erro: " + err.message); }
        };

        window.desvincularContaPiloto = async function(uid) {
            if (!exigirAcessoAdmin('contas', 'aprovar')) return;
            if (!db) return;
            let vinculo = (usuariosPilotosCache && usuariosPilotosCache[uid]) || {};
            if (!confirm(`Desvincular esta conta de "${vinculo.piloto || '(sem piloto)'}"? O piloto perde o acesso ao painel pessoal e a solicitação volta como pendente.`)) return;
            try {
                await db.ref(`usuariosPilotos/${uid}`).remove();
                // Só mexe no status se existir solicitação — vínculos criados
                // direto no banco não têm registro em solicitacoesCadastro.
                let snapSol = await db.ref(`solicitacoesCadastro/${uid}`).once('value');
                if (snapSol.exists()) await db.ref(`solicitacoesCadastro/${uid}/status`).set('pendente');
                alert("Conta desvinculada. A solicitação voltou como pendente em \"Solicitações de Acesso\".");
            } catch (err) { alert("Erro: " + err.message); }
        };
