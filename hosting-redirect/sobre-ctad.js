/* CTAD — sobre-ctad.js
   Página "Sobre o CTAD": tudo sobre o site em 12 seções detalhadas.
   Para atualizar o texto, edite o array SECOES_SOBRE abaixo — o modal é gerado sozinho.
   A versão exibida vem de VERSAO_ATUAL_SISTEMA (patch-notes.js), sem duplicar número.
*/
(function () {
    'use strict';

    const SECOES_SOBRE = [
        {
            icone: '🏁', titulo: '1. O que é o CTAD',
            corpo: `
            <p>A <strong>CTAD — Central de Telemetria e Análise de Desempenho</strong> transforma os relatórios oficiais de cronometragem (MYLAPS / ZRound, em PDF ou HTML) em análise de corrida: ritmo volta a volta, posições, ultrapassagens, laudo técnico, tabelas com gaps, campeonatos, desafios, compras coletivas e muito mais — tudo no navegador, sem instalar nada.</p>
            <p><strong>Como funciona, em 3 passos:</strong> 1) o administrador sobe o relatório da prova; 2) o sistema converte, evita duplicados e organiza por bateria e piloto; 3) todos veem pódios, gráficos e análises, cada um no seu nível de acesso.</p>`
        },
        {
            icone: '👥', titulo: '2. Visitante, membro e Telão — como entrar',
            corpo: `
            <p><strong>Visitante (sem conta):</strong> vê a vitrine pública — pódios, resumos e classificação de <em>todas as pistas</em>. O detalhe volta a volta fica bloqueado: os módulos pesados aparecem desabilitados.</p>
            <p><strong>Membro (com conta):</strong> o sistema filtra automaticamente para <em>a sua pista</em> e libera tudo: gráficos, laudo, tabela completa, dossiê, campeonatos, desafios e compras. O banner do topo mostra <em>🏁 {sua pista} (minha pista)</em>.</p>
            <p><strong>Como virar membro:</strong> clique em <strong>👤 Minha Conta</strong> → cadastre-se → o administrador vincula sua conta a um piloto da base → acesso liberado. Dá para acompanhar o status (<em>em análise / aprovada</em>) na própria Minha Conta.</p>
            <p><strong>Login:</strong> digite e-mail e senha e aperte <strong>Enter</strong> (ou clique em Entrar). Vale para login, cadastro e “Esqueci minha senha”.</p>
            <p><strong>WhatsApp:</strong> barra 💬 Entrar no grupo da pista no topo (quando o admin cadastra o link); botões 📤 espalhados pelo site compartilham pódio, dossiê, desafios e compras.</p>
            <p><strong>WhatsApp:</strong> barra <em>💬 Entrar no grupo da pista</em> no topo (quando o admin cadastra o link); botões 📤 espalhados pelo site compartilham pódio, dossiê, desafios e compras (abre o app, senão copia o texto, senão abre o wa.me).</p>`
        },
        {
            icone: '👤', titulo: '3. Minha Conta',
            corpo: `
            <p><strong>Já tenho conta:</strong> login com e-mail/senha + recuperação de senha por e-mail.</p>
            <p><strong>Ainda não tenho conta:</strong> cadastro com nome (como é conhecido nas corridas), e-mail e senha. Depois do cadastro, aguarde a vinculação feita pelo administrador.</p>
            <p><strong>Depois de logado, você vê:</strong> boas-vindas com seu ELO, botões <em>📊 Ver Meu Dossiê</em>, <em>📄 Gerar Relatório</em>, <em>🛒 Minhas Compras</em> (sua cota, status e rastreio), <em>❤️ Desejos</em>, <em>⚔️ Desafios e convites</em> e, se for administrador, <em>🔐 Administração</em>.</p>`
        },
        {
            icone: '📊', titulo: '4. Telemetria — filtros, KPIs e módulos',
            corpo: `
            <p><strong>Filtros (topo da página):</strong> <em>SESSÕES/BATERIAS</em> (quais provas entram na análise, com botões ✅ Todas e 🗑️ Limpar), <em>PILOTOS</em> (resumo compacto com tags e botão Resumo por piloto) e <em>MÓDULOS VISÍVEIS</em> (liga/desliga cada bloco do relatório).</p>
            <p><strong>KPIs compactos:</strong> 👑 Piloto com Mais Vitórias • ⚡ Melhor Volta Geral (com km/h estimada) • 📊 Voltas Válidas Analisadas • ⏱️ Média Global do Grid.</p>
            <p><strong>Os 6 módulos por bateria:</strong> 📈 <em>Evolução de Ritmo</em> (gráfico volta a volta, carrega só quando aparece na tela) • 📊 <em>Posição Volta a Volta</em> • 📝 <em>Relatório de Ultrapassagens</em> (quem ganhou/perdeu posição em cada volta) • 📋 <em>Laudo Técnico</em> (domínio da sessão, melhor volta, análise) • ⏱️ <em>Tabela Geral Volta a Volta com Gaps e Líder</em> • 💬 <em>Comentários e Reações</em> (❤️ curtir por sessão).</p>
            <p><strong>Extras:</strong> botão 📤 copia o pódio formatado para o WhatsApp; clicar no nome do piloto abre o dossiê.</p>`
        },
        {
            icone: '🏆', titulo: '5. Campeonatos (Championship Manager)',
            corpo: `
            <p><strong>Categoria:</strong> cada campeonato tem uma categoria (ex: WLToys 1:28 4x4, Mini-Z), cadastrada pelo admin em 🏎️ Categorias; dá para filtrar a lista por categoria e o selo aparece no dashboard.</p>
            <p><strong>Para pilotos:</strong> veja campeonatos em andamento no card do dashboard, clique em <em>Participar</em>, escolha seu piloto e inscreva-se. Dá para ver regras, inscritos e compartilhar o convite no WhatsApp.</p>
            <p><strong>Para admins (as 5 abas):</strong> 1) <em>Geral & Configs</em> — nome, nº de provas, pilotos por chave, pontos do 1º ao 10º, grid por treino; 2) <em>Pilotos</em> — inscreve do banco geral ou cadastra manual; 3) <em>Provas</em> — sessão de treino para grid (3 melhores voltas consecutivas), importa do banco principal ou sobe prova separada; 4) <em>Grids</em> — gera largadas, com opção de inverter a bateria seguinte; 5) <em>Classificação</em> — tabela geral de pontos + finalizar campeonato (vira <em>Finalizada</em> com pódio 🏅).</p>`
        },
        {
            icone: '⚔️', titulo: '6. Desafios + ELO',
            corpo: `
            <p><strong>Como desafiar:</strong> Minha Conta → Desafiar → escolha 1 ou mais pilotos e o formato → envie. Os convidados recebem em Minha Conta; quando o <strong>primeiro aceita</strong>, o desafio nasce com status <em>aguardando</em>.</p>
            <p><strong>Decisão automática:</strong> na primeira corrida com todos presentes (“primeiro encontro”), o sistema decide sozinho pela regra do formato. <strong>W.O.:</strong> desafiado que faltar a 3 corridas seguidas perde por W.O. <strong>Expira</strong> em 30 dias sem encontro.</p>
            <p><strong>Formatos:</strong> ⚔️ <em>Duelo</em> (melhor posição no 1º encontro; empate → melhor volta) • 🔄 <em>Mais Voltas</em> (mais voltas válidas; empate → posição) • 👑 <em>King of the Hill</em> (mais voltas na liderança) • ✈️ <em>Voando Baixo</em> (maior sequência de voltas mais rápido que o rival: 3, 5 ou 7).</p>
            <p><strong>ELO (força do piloto):</strong> todos começam com <strong>1000 pontos</strong>. Cada decisão recalcula o ELO dos envolvidos (gravando <em>antes/depois</em> para auditoria) pela fórmula do xadrez com K=32: <em>novo = elo + 32 × (resultado − esperado)</em>. Na prática: <strong>ganhar de alguém mais forte vale mais; perder para alguém mais fraco tira mais.</strong> Exemplo: você (1000) vence um 1200 → +24 pontos; perde → −8. Contra um igual, ±16. O ranking fica ordenado do maior para o menor ELO.</p>`
        },
        {
            icone: '🏎️', titulo: '7. Pilotos — dossiê, apelidos, mesclagens e tags',
            corpo: `
            <p><strong>Dossiê do piloto:</strong> clique em <em>Resumo</em> (filtros) ou no nome (pódio) para ver estatísticas, ELO, tags e gráficos, com botão de compartilhar no WhatsApp.</p>
            <p><strong>Apelidos e carros:</strong> em <em>⚙️ Configurar Piloto</em> o admin cadastra apelido/nome de exibição, aliases (variações de nome que aparecem nos relatórios) e carros.</p>
            <p><strong>Mesclagens:</strong> quando o mesmo piloto aparece com nomes diferentes nos PDFs (ex: “edgard” vs “Edgard Camilo (DJ)”), o admin mescla origem → destino e tudo passa a contar junto.</p>
            <p><strong>Tags:</strong> 18 automáticas calculadas dos resultados (vitórias, pódios, mais rápido, estreante, veterano, maratonista…) + 1 manual 🧠 <em>Melhor Gestão</em> marcada pelo admin. Aparecem nos filtros e no dossiê.</p>
            <p><strong>Notas pessoais:</strong> cada conta pode guardar anotações privadas por piloto (só você vê as suas).</p>`
        },
        {
            icone: '🛒', titulo: '8. Compras Coletivas',
            corpo: `
            <p><strong>Criar e ordenar:</strong> o admin cria a compra (nome, preço, qtd. mínima) e todos os pilotos entram ativos. Use <strong>📍 Fixar</strong> para prender no topo (com selo 📌), <strong>⬆️ ⬇️</strong> para ordenar as fixadas e clique em <em>📌 Fixada</em> para soltar (volta à ordem automática por última atualização).</p>
            <p><strong>Financeiro:</strong> itens, rateio automático por participante, frete/imposto/ICMS/descontos, chave Pix global ou por piloto com QR Code, toggle rápido ✔️/↩️ de pagamento (admin) e o <strong>Resumo</strong> com avisos automáticos abaixo de cada nome (✅ confirmado com data • ⏳ aguardando • ⚠️ sem Pix • 🛒 responsável).</p>
            <p><strong>Rastreio:</strong> campo principal + códigos extras, com detecção automática da transportadora (Correios, Shopee/SPX, Jadlog, Mercado Livre). Botões 📋 copiar, 🔎 rastrear e 👁️ ver embutido (17track dentro do site, sem chave). O <strong>rastreio automático</strong> consulta a API (chave gratuita guardada só no navegador do admin) e grava os eventos com 🤖, marcando entregue sozinho quando chega. Códigos inválidos/texto colado por engano são ignorados.</p>
            <p><strong>Histórico de Movimentação:</strong> linha do tempo de tudo (status, pagamentos, rastreio). O admin registra eventos em 1 clique (📮 Postado, 🚚 Trânsito, 📦 Saiu, ✅ Entregue, atalhos personalizados, data retroativa) e pode <strong>✏️ editar</strong> (texto e data) ou <strong>✖ excluir</strong> qualquer evento, no Resumo ou na Gestão.</p>
            <p><strong>Compartilhar:</strong> 📤 envia o resumo financeiro + rastreio (app nativo → clipboard → WhatsApp).</p>`
        },
        {
            icone: '🛍️', titulo: '9. Produtos Recomendados',
            corpo: `
            <p>Vitrine do que a galera já comprou ou a administração indica. Clique para ver detalhes (foto, valor, link da loja, frete/imposto). Com <strong>❤️</strong> você monta sua <em>Lista de Desejos</em> — os favoritados sobem na vitrine. Itens de compras coletivas marcados como “recomendar” entram aqui sozinhos. O admin ordena com ▲▼ e edita tudo pelo painel.</p>`
        },
        {
            icone: '📺', titulo: '10. Telão 4K (modo pista)',
            corpo: `
            <p>Para projetar na pista: no admin, seção <em>Pista</em>, confira a última prova subida, ajuste a <strong>escala de tamanho</strong>, o <strong>espaçamento das voltas</strong>, a <strong>ordem</strong> (arraste ou ▲▼), a <strong>visibilidade</strong> e o <strong>tamanho de cada bloco</strong> (🏆 Pódio dinâmico • ⏱️ Tabela volta a volta com gaps • 📈 Gráficos) e clique em <strong>🚀 Salvar e iniciar Telão 4K</strong>. As configurações ficam salvas no navegador do PC do telão.</p>`
        },
        {
            icone: '🔐', titulo: '11. Administração',
            corpo: `
            <p><strong>Entrada:</strong> botão <em>🔐 Administração</em> dentro da Minha Conta (só para quem tem permissão), em tela cheia com menu lateral.</p>
            <p><strong>As 9 seções:</strong> 🏁 <em>Pista/Telão</em> (config acima) • 📤 <em>Uploads</em> (sobe PDFs/HTMLs do ZRound com progresso, evita duplicados por hash, inspetor de estrutura JSON, histórico e log de ações, reprocessar/excluir) • 🏆 <em>Campeonato</em> (atalho ao manager) • 👤 <em>Pilotos</em> (cadastrar, apelidos, mesclagens com sugestões) • 🛒 <em>Compras</em> (gestão completa) • 🏷️ <em>Tags</em> (visão das automáticas) • 📝 <em>Solicitações</em> (aprova vínculo conta→piloto, com selo contador) • 🔗 <em>Contas</em> (vinculadas, revincular/desvincular) • 🛍️ <em>Recomendados</em> (editar produtos).</p>`
        },
        {
            icone: '📜', titulo: '12. Regras, papéis e privacidade',
            corpo: `
            <p><strong>Papéis (do mais ao menos poder):</strong> <em>superuser</em> (dono: tudo, em todas as pistas) • <em>admin</em> (tudo, só nas pistas onde é membro) • <em>gestor</em> (campeonatos, pilotos, compras, configs, aprovações, tags, produtos, desafios) • <em>piloto</em> (inscrever-se, editar a própria conta, dossiê, desejos, desafios, compras) • <em>visitante</em> (só leitura pública).</p>
            <p><strong>Regra do portal:</strong> deslogado vê resumo de todas as pistas; logado filtra para a sua. Detalhe volta a volta exige login.</p>
            <p><strong>Dados:</strong> telemetria e compras ficam no banco do projeto; a chave da API de rastreio fica <strong>só no navegador do admin</strong> (nunca no banco); notas de piloto são privadas por conta.</p>
            <p><strong>Acessibilidade:</strong> botão ♿ com alto contraste e filtros de daltonismo (protanopia, deuteranopia, tritanopia, acromatopsia).</p>
            <p id="sobre-versao-linha" style="color:var(--text-muted);"></p>`
        }
    ];

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
    }

    function renderizarSobreCtad() {
        const host = document.getElementById('sobre-ctad-corpo');
        if (!host) return;
        host.innerHTML = SECOES_SOBRE.map((s, i) => `
            <details class="config-panel" ${i === 0 ? 'open' : ''} style="margin-bottom:8px;">
                <summary class="config-panel-title" style="cursor:pointer;font-size:0.85rem;">${s.icone} ${esc(s.titulo)}</summary>
                <div style="font-size:0.8rem;line-height:1.55;margin-top:6px;">${s.corpo}</div>
            </details>`).join('');
        try {
            let v = (typeof VERSAO_ATUAL_SISTEMA !== 'undefined') ? VERSAO_ATUAL_SISTEMA : '';
            let el = document.getElementById('sobre-versao-linha');
            if (el && v) el.innerHTML = `📌 Versão atual do sistema: <strong>${esc(v)}</strong> (veja o histórico em 📌 Versão no rodapé).`;
            let badge = document.getElementById('sobre-versao-badge');
            if (badge && v) badge.textContent = v;
        } catch (e) {}
    }

    window.abrirModalSobreCtad = function () {
        renderizarSobreCtad();
        document.getElementById('sobre-ctad-modal').style.display = 'flex';
    };

    window.fecharModalSobreCtad = function () {
        document.getElementById('sobre-ctad-modal').style.display = 'none';
    };
})();
