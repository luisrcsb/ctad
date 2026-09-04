import { comprasColetivasCache, compraAbertaKey, setCompraAbertaKey, compraAbertaDados, setCompraAbertaDados, db, SENHA_UNIFICADA, pilotosMetadadosCache } from './state.js';

export function gerarPayloadPixBRCode(chave, nomeRecebedor, cidade, valor) {
    function formatEmv(id, val) {
        let s = String(val);
        return id + String(s.length).padStart(2, '0') + s;
    }

    let nomeLimpo = (nomeRecebedor || "CTAD RACING").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().substring(0, 25).trim();
    let cidadeLimpa = (cidade || "MACEIO").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().substring(0, 15).trim();
    let chaveLimpa = String(chave).trim();

    if (chaveLimpa.startsWith("000201")) return chaveLimpa;

    let gui = formatEmv("00", "br.gov.bcb.pix") + formatEmv("01", chaveLimpa);
    let merchantAccount = formatEmv("26", gui);
    let valStr = (valor !== undefined && valor !== null && Number(valor) > 0) ? Number(valor).toFixed(2) : "";
    let field54 = valStr ? formatEmv("54", valStr) : "";
    let field62 = formatEmv("62", formatEmv("05", "***"));

    let payloadSemCrc = (
        formatEmv("00", "01") + merchantAccount + formatEmv("52", "0000") +
        formatEmv("53", "986") + field54 + formatEmv("58", "BR") +
        formatEmv("59", nomeLimpo) + formatEmv("60", cidadeLimpa) + field62 + "6304"
    );

    let crc = 0xFFFF;
    for (let i = 0; i < payloadSemCrc.length; i++) {
        let b = payloadSemCrc.charCodeAt(i) & 0xFF;
        crc ^= (b << 8);
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
            else crc = ((crc << 1)) & 0xFFFF;
        }
    }
    let crcHex = crc.toString(16).toUpperCase().padStart(4, '0');
    return payloadSemCrc + crcHex;
}

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
        let parts = Object.keys(c.participantes || {}).filter(p => c.participantes[p] === true);
        let totalParts = parts.length;
        let pagos = 0;
        parts.forEach(p => { if (c.pagamentos && c.pagamentos[p] === true) pagos++; });
        let perc = totalParts > 0 ? (pagos / totalParts) * 100 : 0;
        let isFinalizada = c.finalizada === true;

        let li = document.createElement('li');
        li.style.background = "var(--bg-input)";
        li.style.padding = "12px 14px";
        li.style.borderRadius = "8px";
        li.style.border = `1px solid ${isFinalizada ? "var(--accent-blue)" : (perc === 100 ? "var(--accent-green)" : "var(--accent-gold)")}`;
        li.style.display = "flex";
        li.style.flexDirection = "column";
        li.style.gap = "8px";
        li.style.marginBottom = "8px";

        let badgeStatus = isFinalizada ? 
            `<span style="background: rgba(0, 119, 182, 0.2); color: var(--accent-blue); padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 0.72rem;">🔵 FINALIZADA</span>` :
            (perc === 100 ? 
                `<span style="background: rgba(46, 196, 182, 0.2); color: var(--accent-green); padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 0.72rem;">🟢 QUITADO</span>` : 
                `<span style="background: rgba(255, 183, 3, 0.2); color: var(--accent-gold); padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 0.72rem;">🟡 EM ANDAMENTO</span>`
            );

        li.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1rem; font-weight: 700; color: var(--text-title);">🛒 ${escapeHtml(c.nome)}</span>
                    ${badgeStatus}
                </div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button class="btn-action-summary btn-res" data-key="${key}">📊 Resumir</button>
                    <button class="btn-action-primary btn-ger" data-key="${key}" style="background: var(--accent-cc);">⚙️ Gerenciar</button>
                </div>
            </div>
            <div>
                <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: bold;">STATUS (${pagos}/${totalParts})</span>
                <div class="progress-bar-container"><div class="progress-bar-fill" style="width: ${perc}%;"></div><div class="progress-bar-text">${Math.round(perc)}%</div></div>
            </div>
        `;
        ul.appendChild(li);

        li.querySelector('.btn-res').onclick = () => window.abrirResumoFiscalModal(key);
        li.querySelector('.btn-ger').onclick = () => window.abrirGerenciadorCompraModal(key);
    });
}

export async function criarCompraColetiva() {
    let senha = prompt("🔒 Digite a senha para criar uma nova lista de peças:");
    if (senha !== SENHA_UNIFICADA) { alert("❌ Senha incorreta!"); return; }
    let nome = document.getElementById('cc-input-nova-compra').value.trim();
    if (!nome) { alert("Digite o nome da lista."); return; }

    let key = "cc_" + Date.now();
    let pilotosBase = Object.keys(pilotosMetadadosCache).length > 0 ? Object.keys(pilotosMetadadosCache) : ["Piloto 1", "Piloto 2"];
    let participantesIniciais = {};
    pilotosBase.forEach(p => participantesIniciais[p] = true);

    let nova = {
        chave: key, nome: nome, frete: 0, imposto: 0, icms: 0, desconto: 0, outrosDescontos: 0,
        itens: [{ imgUrl: "", nomeItem: "", link: "", valor: 0, qtd: 1, atribuidoA: pilotosBase[0] || "" }],
        comprador: "", chavePix: "", participantes: participantesIniciais, pagamentos: {}, recibos: {}, valoresManuais: {}, rastreio: "", finalizada: false
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
