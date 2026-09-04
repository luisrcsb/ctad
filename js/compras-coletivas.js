import { comprasColetivasCache, db, SENHA_UNIFICADA, pilotosMetadadosCache } from './state.js';

export function renderizarListaComprasColetivas() {
    const ul = document.getElementById('cc-lista-cadastradas');
    if(!ul) return;
    ul.innerHTML = "";
    let keys = Object.keys(comprasColetivasCache);
    if (keys.length === 0) {
        ul.innerHTML = `<li style="color: var(--text-muted); text-align: center; padding: 6px;">Nenhuma lista de peças cadastrada.</li>`;
        return;
    }

    keys.forEach(key => {
        let c = comprasColetivasCache[key];
        if (!c) return;
        let li = document.createElement('li');
        li.style.background = "var(--bg-input)";
        li.style.padding = "12px 14px";
        li.style.borderRadius = "8px";
        li.style.border = "1px solid var(--border-card)";
        li.innerHTML = `<span style="font-size: 1rem; font-weight: 700; color: var(--text-title);">🛒 ${escapeHtml(c.nome)}</span>`;
        ul.appendChild(li);
    });
}

export async function criarCompraColetiva() {
    let senha = prompt("🔒 Digite a senha (1234):");
    if (senha !== SENHA_UNIFICADA) { alert("❌ Senha incorreta!"); return; }
    let nome = document.getElementById('cc-input-nova-compra').value.trim();
    if (!nome) { alert("Digite o nome da lista."); return; }

    let key = "cc_" + Date.now();
    let nova = {
        chave: key, nome: nome, frete: 0, imposto: 0, icms: 0, desconto: 0, outrosDescontos: 0,
        itens: [], comprador: "", chavePix: "", participantes: {}, pagamentos: {}, finalizada: false
    };
    if (db) {
        await db.ref(`comprasColetivas/${key}`).set(nova);
        document.getElementById('cc-input-nova-compra').value = "";
        alert("Lista criada com sucesso!");
    }
}

function escapeHtml(text) {
    if (!text) return '';
    let map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}
