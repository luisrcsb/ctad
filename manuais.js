/* CTAD — manuais.js
   Manuais dinâmicos autoatualizáveis (usuário + administrador).
   - Fonte da verdade: RTDB em `manuais/usuario/{id}` (leitura pública) e
     `manuais/admin/{id}` (só staff). Qualquer doc criado/editado no banco
     aparece na tela sem deploy — o manual nunca fica obsoleto.
   - Fallback: SEED_MANUAIS embutido (derivado do Sobre + ferramentas da
     vitrine) exibido se o nó estiver vazio/offline, com aviso de versão local.
   - Gestão: seção 📖 Manuais no admin (lista, editor, excluir, restaurar padrão).
*/
(function () {
    'use strict';

    window.manuaisCache = window.manuaisCache || { usuario: {}, admin: {} };
    window.__manuaisUsandoSeed = window.__manuaisUsandoSeed || { usuario: true, admin: true };

    /* ============ SEED INICIAL (conteúdo padrão; editável pelo admin) ============ */
    const SEED_MANUAIS = {
        usuario: [
            {
                id: 'acesso', icone: '👥', ordem: 1, titulo: 'Visitante, membro e papéis',
                corpo: `
                <p><strong>Visitante (sem conta):</strong> vê a vitrine pública — pódios, resumos e classificação de <em>todas as pistas</em>. O detalhe volta a volta fica bloqueado.</p>
                <p><strong>Membro (com conta):</strong> o sistema filtra automaticamente para <em>a sua pista</em> e libera tudo: gráficos, laudo, tabela completa, dossiê, campeonatos, desafios e compras. O banner do topo mostra <em>🏁 {sua pista} (minha pista)</em>.</p>
                <p><strong>Como virar membro:</strong> clique em <strong>👤 Minha Conta</strong> → cadastre-se → o administrador vincula sua conta a um piloto da base → acesso liberado. Dá para acompanhar o status (<em>em análise / aprovada</em>) na própria Minha Conta.</p>
                <p><strong>Login:</strong> digite e-mail e senha e aperte <strong>Enter</strong> (ou clique em Entrar). Vale para login, cadastro e “Esqueci minha senha”.</p>
                <p><strong>Papéis:</strong> <em>superuser</em> (dono) • <em>admin</em> (tudo nas pistas onde é membro) • <em>gestor</em> (campeonatos, pilotos, compras, configs e aprovações) • <em>piloto</em> (dossiê, inscrição, desafios, compras) • <em>visitante</em> (só leitura pública).</p>`
            },
            {
                id: 'minha-conta', icone: '👤', ordem: 2, titulo: 'Minha Conta',
                corpo: `
                <p><strong>Já tenho conta:</strong> login com e-mail/senha + recuperação de senha por e-mail.</p>
                <p><strong>Ainda não tenho conta:</strong> cadastro com nome (como é conhecido nas corridas), e-mail e senha. Depois do cadastro, aguarde a vinculação feita pelo administrador.</p>
                <p><strong>Depois de logado, você vê:</strong> boas-vindas com seu ELO, botões <em>📊 Ver Meu Dossiê</em>, <em>📄 Gerar Relatório</em>, <em>🛒 Minhas Compras</em> (sua cota, status e rastreio), <em>❤️ Desejos</em>, <em>⚔️ Desafios e convites</em> e, se for administrador, <em>🔐 Administração</em>.</p>`
            },
            {
                id: 'dashboard', icone: '📊', ordem: 3, titulo: 'Dashboard: filtros e KPIs',
                corpo: `
                <p><strong>Filtros (topo da página):</strong> <em>SESSÕES/BATERIAS</em> (quais provas entram na análise, com botões ✅ Todas e 🗑️ Limpar), <em>PILOTOS</em> (resumo compacto com tags e botão Resumo por piloto) e <em>MÓDULOS VISÍVEIS</em> (liga/desliga cada bloco do relatório).</p>
                <p><strong>KPIs compactos:</strong> 👑 Piloto com Mais Vitórias • ⚡ Melhor Volta Geral (com km/h estimada) • 📊 Voltas Válidas Analisadas • ⏱️ Média Global do Grid.</p>`
            },
            {
                id: 'modulos', icone: '📈', ordem: 4, titulo: 'Módulos de cada bateria',
                corpo: `
                <p><strong>Os 6 módulos por bateria:</strong> 📈 <em>Evolução de Ritmo</em> (gráfico volta a volta) • 📊 <em>Posição Volta a Volta</em> • 📝 <em>Relatório de Ultrapassagens</em> (quem ganhou/perdeu posição em cada volta) • 📋 <em>Laudo Técnico</em> (domínio da sessão, melhor volta, análise) • ⏱️ <em>Tabela Geral Volta a Volta com Gaps e Líder</em> • 💬 <em>Comentários e Reações</em> (❤️ curtir por sessão).</p>
                <p><strong>Extras:</strong> botão 📤 copia o pódio formatado para o WhatsApp; clicar no nome do piloto abre o dossiê.</p>`
            },
            {
                id: 'dossie', icone: '🏎️', ordem: 5, titulo: 'Dossiê do piloto e tags',
                corpo: `
                <p><strong>Dossiê do piloto:</strong> clique em <em>Resumo</em> (filtros) ou no nome (pódio) para ver estatísticas, ELO, tags e gráficos, com botão de compartilhar no WhatsApp.</p>
                <p><strong>Tags:</strong> automáticas calculadas dos resultados (vitórias, pódios, mais rápido, estreante, veterano, maratonista…) + 1 manual 🧠 <em>Melhor Gestão</em>. Aparecem nos filtros e no dossiê.</p>
                <p><strong>Notas pessoais:</strong> cada conta pode guardar anotações privadas por piloto (só você vê as suas).</p>`
            },
            {
                id: 'campeonatos', icone: '🏆', ordem: 6, titulo: 'Campeonatos: como participar',
                corpo: `
                <p><strong>Categoria:</strong> cada campeonato tem uma categoria (ex: WLToys 1:28 4x4, Mini-Z). O selo aparece no dashboard e dá para filtrar a lista por categoria.</p>
                <p><strong>Para pilotos:</strong> veja campeonatos em andamento no card do dashboard, clique em <em>Participar</em>, escolha seu piloto e inscreva-se. Dá para ver regras, inscritos e compartilhar o convite no WhatsApp.</p>`
            },
            {
                id: 'desafios', icone: '⚔️', ordem: 7, titulo: 'Desafios + ELO',
                corpo: `
                <p><strong>Como desafiar:</strong> Minha Conta → Desafiar → escolha 1 ou mais pilotos e o formato → envie. Quando o <strong>primeiro aceita</strong>, o desafio nasce com status <em>aguardando</em>.</p>
                <p><strong>Decisão automática:</strong> na primeira corrida com todos presentes, o sistema decide sozinho pela regra do formato. <strong>W.O.:</strong> desafiado que faltar a 3 corridas seguidas perde por W.O. <strong>Expira</strong> em 30 dias sem encontro.</p>
                <p><strong>Formatos:</strong> ⚔️ <em>Duelo</em> • 🔄 <em>Mais Voltas</em> • 👑 <em>King of the Hill</em> • ✈️ <em>Voando Baixo</em> (sequência de 3, 5 ou 7 voltas mais rápido que o rival).</p>
                <p><strong>ELO:</strong> todos começam com <strong>1000 pontos</strong>. Ganhar de alguém mais forte vale mais; perder para alguém mais fraco tira mais (fórmula do xadrez, K=32).</p>`
            },
            {
                id: 'compras', icone: '🛒', ordem: 8, titulo: 'Compras coletivas',
                corpo: `
                <p><strong>Participar:</strong> entre na compra, confira sua cota no Resumo (✅ confirmado • ⏳ aguardando • ⚠️ sem Pix) e pague pela chave Pix com QR Code.</p>
                <p><strong>Rastreio:</strong> campo principal + códigos extras, com detecção automática da transportadora. Botões 📋 copiar, 🔎 rastrear e 👁️ ver embutido (17track dentro do site).</p>
                <p><strong>Histórico:</strong> linha do tempo de status, pagamentos e rastreio. Compartilhe o resumo com 📤 (WhatsApp).</p>`
            },
            {
                id: 'produtos', icone: '🛍️', ordem: 9, titulo: 'Produtos recomendados e desejos',
                corpo: `
                <p>Vitrine do que a galera já comprou ou a administração indica. Clique para ver detalhes (foto, valor, link da loja, frete/imposto). Com <strong>❤️</strong> você monta sua <em>Lista de Desejos</em> — os favoritados sobem na vitrine.</p>`
            },
            {
                id: 'extras', icone: '📺', ordem: 10, titulo: 'Telão, WhatsApp e acessibilidade',
                corpo: `
                <p><strong>WhatsApp:</strong> barra 💬 Entrar no grupo da pista no topo (quando o admin cadastra o link); botões 📤 espalhados pelo site compartilham pódio, dossiê, desafios e compras.</p>
                <p><strong>Acessibilidade:</strong> botão ♿ com alto contraste e filtros de daltonismo (protanopia, deuteranopia, tritanopia, acromatopsia).</p>
                <p><strong>Dados:</strong> telemetria e compras ficam no banco do projeto; notas de piloto são privadas por conta.</p>`
            }
        ],
        admin: [
            {
                id: 'vitrine', icone: '🏠', ordem: 1, titulo: 'A vitrine (galeria) do painel',
                corpo: `
                <p><strong>O painel abre sempre na vitrine</strong> — grade de cartões com nome em destaque e descrição. Cada cartão abre <em>uma única seção por vez</em>; o painel nunca exibe tudo empilhado. Use <strong>🏠 Galeria</strong> no cabeçalho para voltar.</p>
                <p><strong>Cartões e destinos:</strong> 🏁 Pista/Telão, 📤 Uploads, 💾 Downloads, 🏆 Championship (abre o manager em tela própria), 👤 Pilotos, 🏎️ Categorias, 🛒 Compras, 🏷️ Tags, 📝 Solicitações, 🔗 Contas, 🏁 Pistas, 🛍️ Recomendados, 📖 Manuais.</p>
                <p><strong>Permissões:</strong> cada cartão só aparece para quem tem a permissão do módulo. Gestor de pista sem poder global vê somente Gestão de Pistas.</p>`
            },
            {
                id: 'pista', icone: '🏁', ordem: 2, titulo: 'Pista / Telão 4K',
                corpo: `
                <p>Confira a última prova subida, ajuste <strong>escala</strong>, <strong>espaçamento das voltas</strong>, <strong>ordem</strong> (arraste ou ▲▼), <strong>visibilidade</strong> e <strong>tamanho de cada bloco</strong> (🏆 Pódio • ⏱️ Tabela • 📈 Gráficos) e clique em <strong>🚀 Salvar e iniciar Telão 4K</strong>.</p>
                <p>As configurações ficam salvas no navegador do PC do telão. Use <strong>💾 Salvar configurações</strong> para guardar sem abrir o telão.</p>`
            },
            {
                id: 'uploads', icone: '📤', ordem: 3, titulo: 'Central de Uploads (manual)',
                corpo: `
                <p>Selecione relatórios PDF ou HTML oficiais do ZRound e clique em <strong>Converter e Enviar</strong>. O sistema converte, <strong>evita duplicados por hash SHA-256</strong>, mostra progresso e atualiza o painel.</p>
                <p><strong>Recursos:</strong> busca por sessão/piloto/hash, filtro por status e versão do parser, inspetor JSON, log de ações, <strong>reprocessar</strong> com parser novo e <strong>excluir</strong> (com confirmação). Arquivos sem dados extraíveis ficam marcados como <em>arquivo_salvo_sem_dados</em>.</p>`
            },
            {
                id: 'app-local', icone: '🤖', ordem: 4, titulo: 'App local de upload automático',
                corpo: `
                <p>O <strong>CTAD-Upload-Auto.exe</strong> (seção 💾 Downloads) vigia a pasta da pista e subpastas (<em>treino, qualify, bateria…</em>, local ou rede UNC) e envia baterias novas <strong>sem navegador aberto</strong>, com as mesmas regras do upload manual (dedup, resumo público, log).</p>
                <p><strong>Operação:</strong> <code>--configurar</code> (e-mail/senha de admin/gestor, pasta, pista) → <code>--testar-conexao</code> → <code>--scan-once --dry-run</code> → rodar contínuo ou agendar no logon. Acompanhe por <code>upload-auto.log</code> e pelo histórico de Uploads.</p>
                <p><strong>Regras:</strong> move enviados para <code>enviados/</code>; exclusão local só é registrada (apagar do banco exige <code>apagar_remoto</code> ligado); se o Storage negar, o conteúdo segue no banco (pdfBase64).</p>`
            },
            {
                id: 'downloads', icone: '💾', ordem: 5, titulo: 'Área de Downloads',
                corpo: `
                <p>Cartão/seção onde administradores baixam o <strong>CTAD-Upload-Auto.exe</strong> e o modelo de <code>config.json</code>, com passo a passo de instalação embutido.</p>
                <p><strong>Nova versão:</strong> rode <code>app-local/build-exe.bat</code> (gera e publica em <code>downloads/</code>), atualize a versão exibida e faça <code>firebase deploy</code>.</p>`
            },
            {
                id: 'championship', icone: '🏆', ordem: 6, titulo: 'Championship Manager (5 abas)',
                corpo: `
                <p>1) <em>Geral & Configs</em> — nome, nº de provas, pilotos por chave, pontos do 1º ao 10º, grid por treino, categoria; 2) <em>Pilotos</em> — inscreve do banco geral ou cadastra manual; 3) <em>Provas</em> — treino para grid (3 melhores voltas consecutivas), importa do banco ou sobe prova separada; 4) <em>Grids</em> — gera largadas, com inversão da bateria seguinte; 5) <em>Classificação</em> — tabela de pontos + finalizar (vira <em>Finalizada</em> com pódio 🏅).</p>`
            },
            {
                id: 'pilotos', icone: '👤', ordem: 7, titulo: 'Gestão de pilotos',
                corpo: `
                <p><strong>Cadastrar:</strong> piloto novo entra no banco geral mesmo antes de correr. <strong>Apelidos/aliases:</strong> em ⚙️ Configurar Piloto (nome de exibição, variações de nome, carros com foto).</p>
                <p><strong>Mesclagens:</strong> origem → destino para unificar grafias diferentes do mesmo piloto (com sugestões automáticas). <strong>Tag manual:</strong> 🧠 Melhor Gestão é marcada aqui.</p>`
            },
            {
                id: 'categorias', icone: '🏎️', ordem: 8, titulo: 'Categorias de competição',
                corpo: `
                <p>Cadastre categorias (ex: WLToys 1:28 4x4, Mini-Z, Livre) ou use o pacote padrão. Categorias alimentam a sugestão nos carros e o campo oficial + filtro dos campeonatos. Excluir <strong>desativa</strong> (histórico preservado).</p>`
            },
            {
                id: 'compras-admin', icone: '🛒', ordem: 9, titulo: 'Compras: gestão completa',
                corpo: `
                <p>Crie a compra (nome, preço, qtd. mínima), fixe/ordene com 📍⬆️⬇️, gerencie itens, rateio, frete/imposto, Pix por piloto com QR, toggle de pagamento e Resumo com avisos automáticos.</p>
                <p><strong>Rastreio:</strong> códigos + transportadora auto; rastreio automático via API (chave só no seu navegador) ou links 17track/Correios. <strong>Histórico:</strong> registre/edite/exclua eventos com data retroativa.</p>`
            },
            {
                id: 'tags', icone: '🏷️', ordem: 10, titulo: 'Tags (visão geral)',
                corpo: `
                <p>Visão somente leitura das tags calculadas automaticamente a partir dos resultados. A única tag manual (🧠 Melhor Gestão) é marcada em ⚙️ Configurar Piloto.</p>`
            },
            {
                id: 'solicitacoes', icone: '📝', ordem: 11, titulo: 'Solicitações de acesso',
                corpo: `
                <p>Vincule cada solicitação a um piloto da base para liberar o acesso. Pendências aparecem no selo contador, na faixa de alerta e no botão 🔐 Administração. Rejeitadas voltam como “não aprovada” para o piloto.</p>`
            },
            {
                id: 'contas', icone: '🔗', ordem: 12, titulo: 'Contas vinculadas',
                corpo: `
                <p>Lista contas aprovadas (e-mail, piloto, data). Dá para <strong>revincular</strong> (trocar o piloto) ou <strong>desvincular</strong> (a solicitação volta para a fila). Vínculos só podem ser escritos por staff (sem auto-vinculação).</p>`
            },
            {
                id: 'pistas', icone: '🏁', ordem: 13, titulo: 'Gestão de pistas',
                corpo: `
                <p>Cada pista tem ao menos 1 administrador. Um admin pode cuidar de várias pistas; um piloto pode correr em várias — cadastre pelo <strong>e-mail</strong> (a pessoa precisa já ter conta).</p>
                <p><strong>Migração inicial:</strong> rode <em>Migrar tudo para Krathus</em> uma vez para direcionar pilotos, contas, baterias e campeonatos atuais. Só o superuser cria pistas e nomeia administradores.</p>`
            },
            {
                id: 'recomendados', icone: '🛍️', ordem: 14, titulo: 'Produtos recomendados',
                corpo: `
                <p>Edite nome/imagem/link/valor, ordene com ▲▼ e cadastre manual. Itens de compras marcados como “recomendar” entram sozinhos. Lembrete: editar aqui dura até a próxima salvada da compra de origem.</p>`
            },
            {
                id: 'infra', icone: '⚙️', ordem: 15, titulo: 'Infra: perfis, banco e estes manuais',
                corpo: `
                <p><strong>Perfis:</strong> <em>superuser/admin</em> (tudo) • <em>gestor</em> (campeonatos, pilotos, compras, configs, contas/aprovar, tags, produtos, desafios) • <em>piloto/visitante</em> (sem admin). Perfis remotos no nó <code>perfis</code> sobrepõem o padrão.</p>
                <p><strong>Estes manuais:</strong> vivem no nó <code>manuais/usuario</code> e <code>manuais/admin</code>. Edite na seção 📖 Manuais (título, ícone, ordem, corpo) — a tela atualiza sozinha, sem deploy. <strong>↺ Restaurar padrão</strong> regrava este conteúdo inicial.</p>`
            }
        ]
    };

    /* ============ Infra ============ */
    function getDb() {
        try { if (typeof db !== 'undefined' && db) return db; } catch (e) {}
        try { if (window.firebase) return window.firebase.database(); } catch (e) {}
        return null;
    }

    function esc(s) {
        if (typeof escapeHtml === 'function') { try { return escapeHtml(s); } catch (e) {} }
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
        });
    }

    function listaDocs(vertente) {
        var cache = (window.manuaisCache || {})[vertente] || {};
        var ids = Object.keys(cache);
        var docs = ids.map(function (id) {
            var d = cache[id] || {};
            return { id: id, icone: d.icone || '📄', titulo: d.titulo || id, ordem: (d.ordem == null ? 999 : d.ordem), corpo: d.corpoHtml || d.corpo || '' };
        });
        docs.sort(function (a, b) { return (a.ordem - b.ordem) || String(a.titulo).localeCompare(String(b.titulo), 'pt-BR'); });
        return docs;
    }

    function podeVerManualAdmin() {
        try {
            if (typeof hasPerm === 'function') return hasPerm('config', 'editar');
        } catch (e) {}
        return false;
    }

    function exigeStaffManuais() {
        if (typeof exigirAcessoAdmin === 'function') return exigirAcessoAdmin('config', 'editar');
        if (typeof hasPerm === 'function') return hasPerm('config', 'editar');
        return true;
    }

    window.iniciarListenerManuais = function () {
        var database = getDb();
        if (!database || window.__manuaisListenerOn) return;
        window.__manuaisListenerOn = true;
        try {
            database.ref('manuais/usuario').on('value', function (snap) {
                var val = snap.val() || {};
                if (Object.keys(val).length) {
                    window.manuaisCache.usuario = val;
                    window.__manuaisUsandoSeed.usuario = false;
                }
                if (typeof window.renderizarManuais === 'function') window.renderizarManuais();
            });
        } catch (e) {}
        try {
            database.ref('manuais/admin').on('value', function (snap) {
                var val = snap.val() || {};
                if (Object.keys(val).length) {
                    window.manuaisCache.admin = val;
                    window.__manuaisUsandoSeed.admin = false;
                }
                if (typeof window.renderizarManuais === 'function') window.renderizarManuais();
            }, function () { /* sem acesso: mantém seed/fallback */ });
        } catch (e) {}
        // Seed imediato (fallback offline / banco vazio)
        try {
            if (!Object.keys(window.manuaisCache.usuario).length) {
                SEED_MANUAIS.usuario.forEach(function (d) { window.manuaisCache.usuario[d.id] = d; });
            }
            if (!Object.keys(window.manuaisCache.admin).length) {
                SEED_MANUAIS.admin.forEach(function (d) { window.manuaisCache.admin[d.id] = d; });
            }
        } catch (e) {}
    };

    window.__manualBusca = '';
    window.__manualAba = 'usuario';

    window.abrirManual = function (vertente, docId) {
        if (vertente === 'admin' && !podeVerManualAdmin()) vertente = 'usuario';
        window.__manualAba = vertente || 'usuario';
        window.__manualDocAlvo = docId || null;
        window.renderizarManuais();
        var m = document.getElementById('manuais-modal');
        if (m) m.style.display = 'flex';
    };

    window.fecharManual = function () {
        var m = document.getElementById('manuais-modal');
        if (m) m.style.display = 'none';
    };

    window.renderizarManuais = function () {
        var host = document.getElementById('manuais-corpo');
        if (!host) return;
        var podeAdmin = podeVerManualAdmin();
        var aba = window.__manualAba === 'admin' && podeAdmin ? 'admin' : 'usuario';
        window.__manualAba = aba;
        var busca = (window.__manualBusca || '').toLowerCase();
        var docs = listaDocs(aba).filter(function (d) {
            if (!busca) return true;
            return (d.titulo + ' ' + d.corpo).toLowerCase().indexOf(busca) !== -1;
        });
        var abas = '<div style="display:flex;gap:6px;margin-bottom:10px;">' +
            '<button class="zround-tab-btn' + (aba === 'usuario' ? ' active' : '') + '" onclick="window.__manualAba=\'usuario\';window.renderizarManuais()">👤 Usuário</button>' +
            (podeAdmin ? '<button class="zround-tab-btn' + (aba === 'admin' ? ' active' : '') + '" onclick="window.__manualAba=\'admin\';window.renderizarManuais()">🔐 Administrador</button>' : '') +
            '</div>';
        var avisoSeed = window.__manuaisUsandoSeed[aba]
            ? '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:8px;">📋 Versão local (banco ainda sem textos publicados — o admin pode publicá-los na seção 📖 Manuais).</div>' : '';
        host.innerHTML = abas +
            '<input type="text" class="config-input" placeholder="🔍 Buscar no manual..." value="' + esc(window.__manualBusca) + '" oninput="window.__manualBusca=this.value;window.renderizarManuaisLista()">' +
            avisoSeed + '<div id="manuais-lista"></div>';
        window.renderizarManuaisLista();
        var alvo = window.__manualDocAlvo;
        window.__manualDocAlvo = null;
        if (alvo) {
            setTimeout(function () {
                var el = document.getElementById('manual-doc-' + alvo);
                if (el) { el.open = true; el.scrollIntoView({ block: 'start' }); }
            }, 50);
        }
    };

    window.renderizarManuaisLista = function () {
        var host = document.getElementById('manuais-lista');
        if (!host) return;
        var aba = window.__manualAba || 'usuario';
        var busca = (window.__manualBusca || '').toLowerCase();
        var docs = listaDocs(aba).filter(function (d) {
            if (!busca) return true;
            return (d.titulo + ' ' + d.corpo).toLowerCase().indexOf(busca) !== -1;
        });
        host.innerHTML = docs.map(function (d, i) {
            return '<details class="config-panel" id="manual-doc-' + esc(d.id) + '"' + (i === 0 && !busca ? ' open' : '') + ' style="margin-bottom:8px;">' +
                '<summary class="config-panel-title" style="cursor:pointer;font-size:0.85rem;">' + esc(d.icone) + ' ' + esc(d.titulo) + '</summary>' +
                '<div style="font-size:0.8rem;line-height:1.55;margin-top:6px;">' + d.corpo + '</div></details>';
        }).join('') || '<div style="color:var(--text-muted);">Nada encontrado.</div>';
    };

    /* ============ Gestão (admin) ============ */
    window.renderizarSecaoManuais = function () {
        var host = document.getElementById('manuais-editor-corpo');
        if (!host) return;
        var ed = window.__manualEditando || null;
        var blocoLista = ['usuario', 'admin'].map(function (vert) {
            var docs = listaDocs(vert);
            var linhas = docs.map(function (d) {
                return '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:6px 0;border-bottom:1px dashed var(--border-card);">' +
                    '<span style="font-size:0.8rem;">' + esc(d.icone) + ' <strong>' + esc(d.titulo) + '</strong> <span style="color:var(--text-muted);">#' + d.ordem + '</span></span>' +
                    '<span style="display:flex;gap:4px;flex-shrink:0;">' +
                    '<button class="btn-text-action" style="font-size:0.7rem;" onclick="editarDocManual(\'' + vert + '\',\'' + esc(d.id).replace(/'/g, "\\'") + '\')">Editar</button>' +
                    '<button class="btn-text-action" style="color:var(--accent-red);font-size:0.7rem;" onclick="excluirDocManual(\'' + vert + '\',\'' + esc(d.id).replace(/'/g, "\\'") + '\')">Excluir</button>' +
                    '</span></div>';
            }).join('') || '<div style="color:var(--text-muted);font-size:0.78rem;">Nenhum doc (usando seed local).</div>';
            return '<div class="config-panel"><div class="config-panel-title">' + (vert === 'usuario' ? '👤 Manual do Usuário' : '🔐 Manual do Administrador') + '</div>' +
                '<button class="btn-action-primary" style="font-size:0.75rem;align-self:flex-start;" onclick="novoDocManual(\'' + vert + '\')">+ Novo tópico</button>' + linhas + '</div>';
        }).join('');
        var form = '<div class="config-panel"><div class="config-panel-title">✏️ ' + (ed ? 'Editar' : 'Novo') + ' tópico</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<select id="manual-ed-vert" class="config-input" style="max-width:200px;"><option value="usuario">👤 Usuário</option><option value="admin">🔐 Admin</option></select>' +
            '<input type="text" id="manual-ed-id" class="config-input" placeholder="ID (ex: uploads)" ' + (ed ? 'disabled' : '') + '>' +
            '<input type="text" id="manual-ed-icone" class="config-input" placeholder="Ícone" style="max-width:90px;">' +
            '<input type="number" id="manual-ed-ordem" class="config-input" placeholder="#" style="max-width:80px;">' +
            '</div>' +
            '<input type="text" id="manual-ed-titulo" class="config-input" placeholder="Título">' +
            '<textarea id="manual-ed-corpo" class="config-input" rows="8" placeholder="Corpo em HTML (<p>, <strong>, <code>...)"></textarea>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<button class="btn-action-primary" onclick="salvarDocManual()">💾 Salvar no banco</button>' +
            '<button class="btn" style="background:transparent;border:1px solid var(--border-card);" onclick="window.__manualEditando=null;window.renderizarSecaoManuais()">Limpar</button>' +
            '<button class="btn" style="background:transparent;border:1px dashed var(--accent-gold);color:var(--accent-gold);" onclick="restaurarSeedManuais()">↺ Restaurar padrão</button>' +
            '</div></div>';
        host.innerHTML = blocoLista + form;
        if (ed) {
            try {
                document.getElementById('manual-ed-vert').value = ed.vert;
                document.getElementById('manual-ed-id').value = ed.id;
                document.getElementById('manual-ed-icone').value = ed.icone || '';
                document.getElementById('manual-ed-ordem').value = ed.ordem == null ? '' : ed.ordem;
                document.getElementById('manual-ed-titulo').value = ed.titulo || '';
                document.getElementById('manual-ed-corpo').value = ed.corpo || '';
            } catch (e) {}
        }
    };

    function corpoParaBanco(html) {
        // Higiene mínima: nunca publica <script> vindo do editor.
        return String(html || '').replace(/<script[\s\S]*?<\/script\s*>/gi, '');
    }

    window.novoDocManual = function (vert) {
        if (!exigeStaffManuais()) return;
        window.__manualEditando = null;
        window.renderizarSecaoManuais();
        try { document.getElementById('manual-ed-vert').value = vert; } catch (e) {}
    };

    window.editarDocManual = function (vert, id) {
        if (!exigeStaffManuais()) return;
        var d = ((window.manuaisCache || {})[vert] || {})[id] || {};
        window.__manualEditando = { vert: vert, id: id, icone: d.icone, ordem: d.ordem, titulo: d.titulo, corpo: d.corpoHtml || d.corpo || '' };
        window.renderizarSecaoManuais();
    };

    window.salvarDocManual = async function () {
        if (!exigeStaffManuais()) return;
        var database = getDb();
        if (!database) { alert('Banco não conectado.'); return; }
        var ed = window.__manualEditando || {};
        var vert = (document.getElementById('manual-ed-vert') || {}).value || 'usuario';
        var id = ed.id || ((document.getElementById('manual-ed-id') || {}).value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
        var titulo = ((document.getElementById('manual-ed-titulo') || {}).value || '').trim();
        if (!id || !titulo) { alert('Preencha ao menos ID e título.'); return; }
        var doc = {
            icone: ((document.getElementById('manual-ed-icone') || {}).value || '📄').trim(),
            titulo: titulo,
            ordem: parseInt(((document.getElementById('manual-ed-ordem') || {}).value || '999'), 10) || 999,
            corpoHtml: corpoParaBanco((document.getElementById('manual-ed-corpo') || {}).value || ''),
            atualizadoEm: Date.now()
        };
        try { doc.atualizadoPor = (typeof usuarioAtual !== 'undefined' && usuarioAtual && usuarioAtual.email) || null; } catch (e) {}
        await database.ref('manuais/' + vert + '/' + id).set(doc);
        window.__manualEditando = null;
        window.renderizarSecaoManuais();
        alert('Tópico publicado! O manual atualiza sozinho.');
    };

    window.excluirDocManual = async function (vert, id) {
        if (!exigeStaffManuais()) return;
        var database = getDb();
        if (!database) return;
        if (!confirm('Excluir o tópico "' + id + '" do manual?')) return;
        await database.ref('manuais/' + vert + '/' + id).remove();
        window.renderizarSecaoManuais();
    };

    window.restaurarSeedManuais = async function () {
        if (!exigeStaffManuais()) return;
        var database = getDb();
        if (!database) { alert('Banco não conectado.'); return; }
        if (!confirm('Regravar TODO o conteúdo padrão nos dois manuais? (sobrescreve edições)')) return;
        var tudo = {};
        ['usuario', 'admin'].forEach(function (vert) {
            SEED_MANUAIS[vert].forEach(function (d) {
                tudo['manuais/' + vert + '/' + d.id] = { icone: d.icone, titulo: d.titulo, ordem: d.ordem, corpoHtml: d.corpo, atualizadoEm: Date.now() };
            });
        });
        await database.ref().update(tudo);
        window.renderizarSecaoManuais();
        alert('Manuais restaurados para o padrão.');
    };

    function boot() {
        try { window.iniciarListenerManuais(); } catch (e) {}
        try {
            if (typeof window.renderizarSecaoManuais === 'function' && document.getElementById('manuais-editor-corpo')) window.renderizarSecaoManuais();
        } catch (e) {}
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    setTimeout(boot, 2000);
})();
