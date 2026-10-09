import { listaJsonsCache, pilotosMetadadosCache, mesclagensCache } from './state.js';

export function formatarNomeSessao(sessaoStr) {
    if (!sessaoStr) return "Bateria";
    let match = sessaoStr.match(/(\d{2})[-/](\d{2})[-/](\d{2}).*?\((\d+)\)/);
    if (match) {
        let dia = match[1], mes = match[2], anoCompleto = "20" + match[3];
        let numBateria = match[4].padStart(2, '0');
        return `Bateria ${numBateria} (${dia}/${mes}/${anoCompleto})`;
    }
    let matchSeq = sessaoStr.match(/\((\d+)\)/);
    if (matchSeq) {
        let numBateria = matchSeq[1].padStart(2, '0');
        return `Bateria ${numBateria} - ${sessaoStr.replace(/\(?\d+[-/]\d+[-/]\d+\)?/, '').trim()}`;
    }
    return sessaoStr;
}

export function extrairPesoOrdenacao(sessaoStr) {
    if (!sessaoStr) return 0;
    let matchData = sessaoStr.match(/(\d{2})[-/](\d{2})[-/](\d{2})/);
    let timestampData = 0;
    if (matchData) {
        let dia = parseInt(matchData[1], 10);
        let mes = parseInt(matchData[2], 10) - 1;
        let ano = parseInt(matchData[3], 10) + 2000;
        timestampData = new Date(ano, mes, dia).getTime();
    }
    let matchSeq = sessaoStr.match(/\((\d+)\)/) || sessaoStr.match(/bateria\s*(\d+)/i) || sessaoStr.match(/(\d+)/);
    let sequencial = matchSeq ? parseInt(matchSeq[1], 10) : 0;
    return timestampData + sequencial;
}

export function obterTodosDadosConsolidados() {
    let consolidado = [];
    if (listaJsonsCache && Array.isArray(listaJsonsCache)) {
        listaJsonsCache.forEach(arq => {
            if (arq.dados && Array.isArray(arq.dados)) {
                arq.dados.forEach(d => {
                    if (!d.laps || d.laps.length === 0) return;
                    let pilotoReal = d.piloto;
                    let safeNomeKey = pilotoReal.replace(/[.#$\/\[\]]/g, "_");
                    if (mesclagensCache[safeNomeKey]) pilotoReal = mesclagensCache[safeNomeKey];
                    let meta = pilotosMetadadosCache[pilotoReal] || {};
                    consolidado.push({
                        ...d, piloto: pilotoReal, pilotoOriginal: d.piloto, bateriaKey: arq.firebaseKey,
                        pilotoExibicao: meta.apelido ? `${pilotoReal} (${meta.apelido})` : pilotoReal, apelido: meta.apelido || ''
                    });
                });
            }
        });
    }
    return consolidado;
}

export function parsearTextoConvertido(texto, sessaoNome, batKey) {
    let pilotosMap = {};
    let linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let ordemPilotos = [];
    let capturandoResumo = false;
    let capturandoVoltas = false;

    linhas.forEach(linha => {
        let linhaLimpa = linha.replace(/\|/g, ' ').trim();
        let partes = linhaLimpa.split(/\s+/).filter(Boolean);
        if (partes.length === 0) return;

        let linhaLower = linhaLimpa.toLowerCase();
        if (linhaLower.startsWith("top ") || linhaLower.includes("top 10")) {
            capturandoResumo = false; capturandoVoltas = false; return;
        }
        if ((linhaLimpa.includes("Piloto") || linhaLimpa.includes("Pos")) && (linhaLimpa.includes("Voltas") || linhaLimpa.includes("Tempo"))) {
            capturandoResumo = true; capturandoVoltas = false; return;
        }
        if (linhaLower.includes("volta por piloto") || linhaLower.includes("lap by lap")) {
            capturandoResumo = false; capturandoVoltas = true; return;
        }

        if (capturandoResumo) {
            let posDetectada = null; let startIndex = 0;
            if (/^\d{1,2}º?$/.test(partes[0])) {
                posDetectada = partes[0].includes('º') ? partes[0] : partes[0] + 'º';
                startIndex = 1; if (/^\d+$/.test(partes[1])) startIndex = 2;
            }
            let nomePartes = [];
            for (let i = startIndex; i < partes.length; i++) {
                let p = partes[i];
                if (/^\d+$/.test(p) && i > startIndex + 1) break;
                if (/^\d+[:.,]\d+/.test(p)) break;
                if (p === 'º' || p === '°') continue;
                nomePartes.push(p);
            }
            if (nomePartes.length > 0) {
                let pilotoNome = nomePartes.join(' ').replace(/\s+\d+$/, '').trim();
                if (pilotoNome && !pilotosMap[pilotoNome]) {
                    pilotosMap[pilotoNome] = { pos: posDetectada || '1º', piloto: pilotoNome, bateriaKey: batKey, sessao: sessaoNome, laps: [] };
                    ordemPilotos.push(pilotoNome);
                }
            }
        }

        if (capturandoVoltas && (/^\d+$/.test(partes[0]) || /^\d+[º°]?$/.test(partes[0]))) {
            let numVolta = parseInt(partes[0].replace(/[º°]/g, ''), 10);
            if (isNaN(numVolta)) return;
            let temposLinha = [];
            for (let i = 1; i < partes.length; i++) {
                let token = partes[i].split('-')[0].trim().replace(/[^\d:,.]/g, '');
                if (token && /\d+[,.]\d+/.test(token)) {
                    let tempoNum = token.includes(':') ? (parseInt(token.split(':')[0], 10) * 60) + parseFloat(token.split(':')[1].replace(',', '.')) : parseFloat(token.replace(',', '.'));
                    if (!isNaN(tempoNum) && tempoNum > 0) temposLinha.push(parseFloat(tempoNum.toFixed(3)));
                }
            }
            temposLinha.forEach((tVal, idx) => {
                if (ordemPilotos[idx]) pilotosMap[ordemPilotos[idx]].laps[numVolta - 1] = tVal;
            });
        }
    });

    let resultadoFinal = [];
    Object.keys(pilotosMap).forEach(pName => {
        let pObj = pilotosMap[pName];
        pObj.laps = (pObj.laps || []).filter(t => t !== undefined && !isNaN(t));
        if (pObj.laps.length > 0) resultadoFinal.push(pObj);
    });
    return resultadoFinal;
}

export async function converterPdfParaTexto(arquivo) {
    const arrayBuffer = await arquivo.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    let textoCompleto = "";
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const pagina = await pdfDoc.getPage(pageNum);
        const tokenTextos = await pagina.getTextContent();
        let linhasY = {};
        tokenTextos.items.forEach(item => {
            let y = Math.round(item.transform[5] / 3) * 3;
            if (!linhasY[y]) linhasY[y] = [];
            linhasY[y].push({ x: item.transform[4], str: item.str });
        });
        Object.keys(linhasY).sort((a, b) => b - a).forEach(y => {
            textoCompleto += linhasY[y].sort((a, b) => a.x - b.x).map(i => i.str).join(" | ") + "\n";
        });
    }
    return textoCompleto;
}

export async function arquivoParaBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}
