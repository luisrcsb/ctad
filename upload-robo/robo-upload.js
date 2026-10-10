/* CTAD — robo-upload.js
   Robo de upload automatico (PC do superuser, 24h).
   Vigia a pasta do ZRound a cada N segundos; arquivo novo (.pdf/.html/.htm)
   e enviado ao Firebase (Storage + Realtime Database) com o MESMO formato
   do upload manual do site: baterias/{batKey}, publicResumo e uploadLog.
   Deduplicacao por SHA-256 (igual ao site): arquivo repetido e ignorado.

   Uso:
     node robo-upload.js                      vigia continuo (padrao)
     node robo-upload.js --scan-once          uma varredura e sai
     node robo-upload.js --scan-once --dry-run  testa sem enviar (nao precisa de credencial)
     node robo-upload.js --test <arquivo>      so extrai e parseia, mostra o resultado
     node robo-upload.js --configurar          assistente para configurar pasta e opcoes
     node robo-upload.js --pasta "C:\ZRound"   usa outra pasta so nesta execucao

   Requisitos: Node 18+, `npm install` nesta pasta e serviceAccountKey.json
   (Firebase Console > Configuracoes do projeto > Contas de servico > Gerar nova
   chave privada). So o SUPERUSER deve operar este robo: a chave tem poder total.
*/
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const DIR = __dirname;
const CONFIG_PATH = path.join(DIR, 'config.json');
const ESTADO_PATH = path.join(DIR, '.estado.json');
const LOG_PATH = path.join(DIR, 'robo.log');

const PARSER_VERSION = 2; // mesma versao do site (v2 atual)
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB, igual ao site

const args = process.argv.slice(2);
const MODO_TESTE = args[0] === '--test' ? args[1] : null;
const SCAN_ONCE = args.includes('--scan-once') || !!MODO_TESTE;
const DRY_RUN = args.includes('--dry-run') || !!MODO_TESTE;
const MODO_CONFIGURAR = args.includes('--configurar');

function valorArg(nome) {
  const i = args.indexOf(nome);
  return (i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')) ? args[i + 1] : null;
}

function carregarConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('[robo] Nao achei config.json em ' + CONFIG_PATH);
    process.exit(1);
  }
  cfg.intervaloSegundos = Math.max(5, Number(cfg.intervaloSegundos) || 15);
  cfg.extensoes = (cfg.extensoes || ['.pdf', '.html', '.htm']).map(s => String(s).toLowerCase());
  cfg.pistaId = cfg.pistaId || 'krathus';
  if (typeof cfg.moverParaEnviados !== 'boolean') cfg.moverParaEnviados = true;
  if (MODO_TESTE) cfg.pasta = path.dirname(path.resolve(MODO_TESTE));
  const pastaArg = valorArg('--pasta');
  if (pastaArg) cfg.pasta = path.resolve(pastaArg);
  return cfg;
}

const config = carregarConfig();

function log(msg) {
  const linha = new Date().toLocaleString('pt-BR') + ' ' + msg;
  console.log(linha);
  try { fs.appendFileSync(LOG_PATH, linha + '\n'); } catch (e) {}
}

function carregarEstado() {
  try {
    return JSON.parse(fs.readFileSync(ESTADO_PATH, 'utf8'));
  } catch (e) {
    return { arquivos: {}, hashes: {} };
  }
}

function salvarEstado(estado) {
  try { fs.writeFileSync(ESTADO_PATH, JSON.stringify(estado, null, 2)); } catch (e) {}
}

// ---- Assistente de configuracao (pasta + opcoes, sem editar JSON na mao) ----
// Com entrada redirecionada (pipe/arquivo) o readline encerra apos a 1a pergunta,
// entao nesse caso lemos todas as respostas de uma vez.
function lerRespostasPipe() {
  if (process.stdin.isTTY) return null;
  try {
    return fs.readFileSync(0, 'utf8').split(/\r?\n/);
  } catch (e) { return []; }
}

function perguntar(rl, respostasPipe, texto, padrao) {
  if (respostasPipe) {
    const resp = String(respostasPipe.length ? respostasPipe.shift() : '').trim().replace(/^["']|["']$/g, '');
    console.log(texto + (padrao ? ' [' + padrao + ']' : '') + ': ' + resp);
    return Promise.resolve(resp || padrao);
  }
  return new Promise(resolve => {
    rl.question(texto + (padrao ? ' [' + padrao + ']' : '') + ': ', resp => {
      resp = String(resp || '').trim().replace(/^["']|["']$/g, '');
      resolve(resp || padrao);
    });
  });
}

async function configurarAssistente() {
  const atual = carregarConfig();
  const respostasPipe = lerRespostasPipe();
  const rl = respostasPipe ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('--- CTAD robo-upload: configuracao (Enter mantem o atual) ---');
  try {
    let pasta = await perguntar(rl, respostasPipe, 'Pasta vigiada (onde o ZRound salva os relatorios)', atual.pasta);
    pasta = path.resolve(pasta);
    if (!fs.existsSync(pasta)) {
      const criar = await perguntar(rl, respostasPipe, 'Pasta nao existe. Criar agora? (s/n)', 's');
      if (/^(s|sim|y|yes)$/i.test(criar)) {
        fs.mkdirSync(pasta, { recursive: true });
        console.log('Pasta criada: ' + pasta);
      } else {
        console.log('Configuracao cancelada (pasta inexistente).');
        return;
      }
    } else if (!fs.statSync(pasta).isDirectory()) {
      console.log('ERRO: o caminho nao e uma pasta. Nada foi alterado.');
      return;
    }
    const intervalo = Math.max(5, parseInt(await perguntar(rl, respostasPipe, 'Intervalo de verificacao (segundos, min 5)', String(atual.intervaloSegundos)), 10) || 15);
    const pistaId = (await perguntar(rl, respostasPipe, 'ID da pista (carimbo dos uploads)', atual.pistaId)).toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'krathus';
    const mover = await perguntar(rl, respostasPipe, 'Mover enviados para subpasta "enviados"? (s/n)', atual.moverParaEnviados ? 's' : 'n');

    const nova = { ...atual, pasta, intervaloSegundos: intervalo, pistaId, moverParaEnviados: /^(s|sim|y|yes)$/i.test(mover) };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(nova, null, 2));
    console.log('Salvo em ' + CONFIG_PATH + ':');
    console.log(JSON.stringify(nova, null, 2));
  } finally {
    if (rl) rl.close();
  }
}

// ---- Firebase (so quando vai enviar de verdade) ----
let admin = null;
let db = null;
let bucket = null;

function initFirebase() {
  if (db) return;
  const keyPath = path.resolve(DIR, config.serviceAccountPath || './serviceAccountKey.json');
  if (!fs.existsSync(keyPath)) {
    throw new Error('serviceAccountKey.json nao encontrado em ' + keyPath +
      ' (baixe no Firebase Console > Configuracoes > Contas de servico).');
  }
  admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(require(keyPath)),
      databaseURL: config.databaseURL,
      storageBucket: config.storageBucket
    });
  }
  db = admin.database();
  bucket = admin.storage().bucket();
}

// ---- Utilidades ----
function sha256Arquivo(caminho) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(caminho);
    s.on('data', d => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }

async function arquivoEstavel(caminho) {
  // Arquivo ainda sendo gravado pelo ZRound? Compara tamanho 2x com 3s de pausa.
  try {
    const a = fs.statSync(caminho).size;
    await esperar(3000);
    const b = fs.statSync(caminho).size;
    return a === b;
  } catch (e) { return false; }
}

async function extrairTexto(caminho, extensao) {
  if (extensao === '.html' || extensao === '.htm') {
    let html;
    try { html = fs.readFileSync(caminho, 'utf8'); }
    catch (e) { html = fs.readFileSync(caminho, 'latin1'); }
    return htmlParaTexto(html);
  }
  if (extensao === '.pdf') {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(fs.readFileSync(caminho));
    return data.text || '';
  }
  throw new Error('Formato nao suportado. Use PDF, HTML ou HTM.');
}

function htmlParaTexto(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h\d|li)>/gi, '\n')
    .replace(/<(td|th)[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
}

// ---- Parsers (port fiel do index.html: detectarFormato + csv/mylaps/zround) ----
function detectarFormatoRelatorio(texto) {
  const t = texto.toLowerCase();
  if (t.includes('zround') || t.includes('z-round') || (t.includes('piloto') && t.includes('voltas') && t.includes('tempo') && t.includes('volta por piloto'))) {
    return 'zround';
  }
  if (t.includes('mylaps') || t.includes('my laps') || t.includes('track') && t.includes('sector') || t.includes('best lap') && t.includes('sector')) {
    return 'mylaps';
  }
  if (texto.includes(',') && texto.split('\n').some(l => l.split(',').length >= 4 && /^\d+,\s*.+,\s*\d+,\s*[\d:.,]+/.test(l))) {
    return 'csv';
  }
  return 'zround';
}

function parsearCSV(texto, sessaoNome, batKey) {
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (linhas.length < 2) return [];
  const headers = linhas[0].split(',').map(h => h.trim().toLowerCase());
  const pilotoIdx = headers.findIndex(h => h.includes('piloto') || h.includes('driver') || h.includes('name'));
  const posIdx = headers.findIndex(h => h.includes('pos') || h.includes('rank'));
  const voltasIdx = headers.findIndex(h => h.includes('volta') || h.includes('lap') && !h.includes('best') && !h.includes('sector'));
  const melhorIdx = headers.findIndex(h => h.includes('best') || h.includes('melhor') || h.includes('fastest'));
  if (pilotoIdx === -1) return [];
  const resultado = [];
  for (let i = 1; i < linhas.length; i++) {
    const cols = linhas[i].split(',').map(c => c.trim());
    if (cols.length <= pilotoIdx) continue;
    const piloto = cols[pilotoIdx];
    if (!piloto) continue;
    const pos = posIdx !== -1 && cols[posIdx] ? parseInt(cols[posIdx].replace(/[º°]/g, '')) || (resultado.length + 1) : resultado.length + 1;
    const voltas = voltasIdx !== -1 && cols[voltasIdx] ? parseInt(cols[voltasIdx]) || 0 : 0;
    let melhorVoltaVal = 0;
    if (melhorIdx !== -1 && cols[melhorIdx]) {
      const t = cols[melhorIdx].replace(',', '.');
      const parts = t.split(':');
      melhorVoltaVal = parts.length === 2 ? parseInt(parts[0]) * 60 + parseFloat(parts[1]) : parseFloat(t) || 0;
    }
    resultado.push({ piloto, pos: pos + 'º', bateriaKey: batKey, sessao: sessaoNome, voltasTotais: voltas, melhorVoltaVal, melhorVoltaTxt: melhorVoltaVal ? melhorVoltaVal.toFixed(3).replace('.', ',') + 's' : '00,000s', mediaVal: 0, mediaTxt: '00,000s', desvioVal: 0, desvio: '±0,000s', laps: [] });
  }
  return resultado;
}

function parsearMyLaps(texto, sessaoNome, batKey) {
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const resultado = [];
  let capturando = false;
  for (const linha of linhas) {
    if (linha.toLowerCase().includes('best lap') || linha.toLowerCase().includes('driver')) { capturando = true; continue; }
    if (!capturando) continue;
    const partes = linha.split(/\s{2,}|\t/).filter(Boolean);
    if (partes.length < 3) continue;
    let piloto = '';
    let pos = resultado.length + 1;
    let melhorVoltaVal = 0;
    for (let i = 0; i < partes.length; i++) {
      const p = partes[i].trim();
      if (/^\d+$/.test(p) && pos === resultado.length + 1) { pos = parseInt(p); }
      else if (/\d+[:.]\d+/.test(p)) {
        const t = p.replace(',', '.');
        const parts = t.split(':');
        const val = parts.length === 2 ? parseInt(parts[0]) * 60 + parseFloat(parts[1]) : parseFloat(t);
        if (val > 0 && (melhorVoltaVal === 0 || val < melhorVoltaVal)) melhorVoltaVal = val;
      } else if (!piloto && p.length > 2 && !/^\d+$/.test(p)) { piloto = p; }
    }
    if (piloto) {
      resultado.push({ piloto, pos: pos + 'º', bateriaKey: batKey, sessao: sessaoNome, voltasTotais: 0, melhorVoltaVal, melhorVoltaTxt: melhorVoltaVal ? melhorVoltaVal.toFixed(3).replace('.', ',') + 's' : '00,000s', mediaVal: 0, mediaTxt: '00,000s', desvioVal: 0, desvio: '±0,000s', laps: [] });
    }
  }
  return resultado;
}

function parsearZRound(texto, sessaoNome, batKey) {
  const pilotosMap = {};
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const ordemPilotos = [];
  let capturandoResumo = false;
  let capturandoVoltas = false;
  linhas.forEach(linha => {
    const linhaLimpa = linha.replace(/\|/g, ' ').trim();
    const partes = linhaLimpa.split(/\s+/).filter(Boolean);
    if (partes.length === 0) return;
    const linhaLower = linhaLimpa.toLowerCase();
    if (linhaLower.startsWith('top ') || linhaLower.includes('top 10')) { capturandoResumo = false; capturandoVoltas = false; return; }
    if ((linhaLimpa.includes('Piloto') || linhaLimpa.includes('Pos')) && (linhaLimpa.includes('Voltas') || linhaLimpa.includes('Tempo'))) { capturandoResumo = true; capturandoVoltas = false; return; }
    if (linhaLower.includes('volta por piloto') || linhaLower.includes('lap by lap') || (partes[0] === 'Num.' && capturandoResumo)) { capturandoResumo = false; capturandoVoltas = true; return; }
    if (capturandoResumo) {
      let posDetectada = null;
      let startIndex = 0;
      if (/^\d{1,2}º?$/.test(partes[0])) {
        posDetectada = partes[0].includes('º') ? partes[0] : partes[0] + 'º';
        startIndex = 1;
        if (/^\d+$/.test(partes[1])) startIndex = 2;
      }
      const nomePartes = [];
      for (let i = startIndex; i < partes.length; i++) {
        const p = partes[i];
        if (/^\d+$/.test(p) && i > startIndex + 1) break;
        if (/^\d+[:.,]\d+/.test(p)) break;
        if (p === 'º' || p === '°') continue;
        nomePartes.push(p);
      }
      if (nomePartes.length > 0) {
        const pilotoNome = nomePartes.join(' ').replace(/\s+\d+$/, '').trim();
        if (pilotoNome && !pilotosMap[pilotoNome]) {
          pilotosMap[pilotoNome] = { pos: posDetectada || ((ordemPilotos.length + 1) + 'º'), piloto: pilotoNome, bateriaKey: batKey, sessao: sessaoNome, voltasTotais: 0, melhorVoltaVal: 0, melhorVoltaTxt: '00,000s', mediaVal: 0, mediaTxt: '00,000s', desvioVal: 0, desvio: '±0,000s', laps: [] };
          ordemPilotos.push(pilotoNome);
        }
      }
    }
    if (capturandoVoltas && (/^\d+$/.test(partes[0]) || /^\d+[º°]?$/.test(partes[0]))) {
      const numVolta = parseInt(partes[0].replace(/[º°]/g, ''), 10);
      if (isNaN(numVolta)) return;
      const temposLinha = [];
      for (let i = 1; i < partes.length; i++) {
        const token = partes[i].split('-')[0].trim().replace(/[^\d:,.]/g, '');
        if (token && /\d+[,.]\d+/.test(token)) {
          const tempoNum = token.includes(':') ? (parseInt(token.split(':')[0], 10) * 60) + parseFloat(token.split(':')[1].replace(',', '.')) : parseFloat(token.replace(',', '.'));
          if (!isNaN(tempoNum) && tempoNum > 0) temposLinha.push(parseFloat(tempoNum.toFixed(3)));
        }
      }
      temposLinha.forEach((tempoVal, idx) => {
        if (ordemPilotos[idx]) {
          const pName = ordemPilotos[idx];
          if (!pilotosMap[pName].laps) pilotosMap[pName].laps = [];
          pilotosMap[pName].laps[numVolta - 1] = tempoVal;
        }
      });
    }
  });
  const resultadoFinal = [];
  Object.keys(pilotosMap).forEach(pName => {
    const pObj = pilotosMap[pName];
    const lapsLimpos = (pObj.laps || []).filter(t => t !== undefined && !isNaN(t) && t > 0);
    pObj.laps = lapsLimpos;
    if (pObj.laps.length === 0) return;
    const melhor = Math.min(...pObj.laps);
    const media = pObj.laps.reduce((a, b) => a + b, 0) / pObj.laps.length;
    const desvio = Math.sqrt(pObj.laps.reduce((sum, t) => sum + Math.pow(t - media, 2), 0) / pObj.laps.length);
    pObj.melhorVoltaVal = parseFloat(melhor.toFixed(3));
    pObj.melhorVoltaTxt = melhor.toFixed(3).replace('.', ',') + 's';
    pObj.mediaVal = parseFloat(media.toFixed(3));
    pObj.mediaTxt = media.toFixed(3).replace('.', ',') + 's';
    pObj.desvioVal = parseFloat(desvio.toFixed(3));
    pObj.desvio = '±' + desvio.toFixed(3).replace('.', ',') + 's';
    pObj.voltasTotais = pObj.laps.length;
    resultadoFinal.push(pObj);
  });
  return resultadoFinal;
}

function parsearTextoConvertido(texto, sessaoNome, batKey) {
  const formato = detectarFormatoRelatorio(texto);
  let resultado;
  if (formato === 'csv') resultado = parsearCSV(texto, sessaoNome, batKey);
  else if (formato === 'mylaps') resultado = parsearMyLaps(texto, sessaoNome, batKey);
  else resultado = parsearZRound(texto, sessaoNome, batKey);
  return { formato, resultado };
}

// Resumo leve da vitrine publica (port de portal-pistas.js)
function gerarResumoBateria(reg) {
  const participantes = Array.isArray(reg.dados) ? reg.dados : [];
  const extrair = v => {
    if (v === null || v === undefined) return NaN;
    if (typeof v === 'object') return Number(v.tempo ?? v.time ?? v.lapTime ?? NaN);
    return Number(v);
  };
  const proc = participantes.map(d => {
    const nome = (d.piloto || d.name || d.pilot || '').trim();
    if (!nome) return null;
    const laps = (d.laps || []).map(extrair).filter(t => Number.isFinite(t) && t > 0);
    if (!laps.length) return null;
    return { piloto: nome, voltas: laps.length, melhor: Math.min(...laps) };
  }).filter(Boolean);
  proc.sort((a, b) => (a.voltas !== b.voltas) ? b.voltas - a.voltas : a.melhor - b.melhor);
  const podio = proc.slice(0, 3).map(p => p.piloto);
  const melhor = proc.length ? proc.reduce((acc, p) => p.melhor < acc.melhor ? p : acc, proc[0]) : null;
  return {
    pistaId: reg.pistaId, nomePista: reg.pistaId,
    sessao: reg.sessao, firebaseKey: reg.firebaseKey || reg.bateriaKey,
    podio, totalPilotos: proc.length,
    melhorVolta: melhor ? { piloto: melhor.piloto, tempo: Number(melhor.melhor.toFixed(3)) } : null,
    atualizadoEm: Date.now()
  };
}

// ---- Envio (mesmo formato do upload manual do site) ----
async function enviarArquivo(caminho, nome, tamanho) {
  const extensao = path.extname(nome).toLowerCase();
  const sessaoNome = nome.replace(/\.[^/.]+$/, '').trim();
  const batKey = 'bat_' + sessaoNome.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

  const fileHash = await sha256Arquivo(caminho);

  if (!DRY_RUN) {
    initFirebase();
    const snapHash = await db.ref('baterias').orderByChild('fileHash').equalTo(fileHash).limitToFirst(1).once('value');
    if (snapHash.exists()) {
      const existente = Object.values(snapHash.val())[0];
      return { status: 'duplicado', detalhe: 'duplicado de "' + (existente.nomeArquivoOriginal || existente.sessao) + '"' };
    }
  }

  if (tamanho > MAX_FILE_SIZE) throw new Error('Arquivo maior que 25MB.');

  const textoExtraido = await extrairTexto(caminho, extensao);
  const { formato, resultado } = parsearTextoConvertido(textoExtraido, sessaoNome, batKey);
  const historicoOriginal = {};
  resultado.forEach(d => { if (d && d.piloto) historicoOriginal[d.piloto] = d.piloto; });

  const uploadData = {
    bateriaKey: batKey,
    sessao: sessaoNome,
    id: Date.now(),
    dados: resultado,
    pdfBase64: 'data:application/octet-stream;base64,' + fs.readFileSync(caminho).toString('base64'),
    nomeArquivoOriginal: nome,
    historicoNomesOriginais: historicoOriginal,
    textoExtraido,
    statusProcessamento: resultado && resultado.length ? 'processado' : 'arquivo_salvo_sem_dados',
    fileHash,
    parserVersion: PARSER_VERSION,
    fileSize: tamanho,
    uploadedBy: 'robo-auto',
    uploadedAt: Date.now(),
    pistaId: config.pistaId
  };

  if (DRY_RUN) {
    return { status: MODO_TESTE ? 'teste' : 'simulado', detalhe: 'formato=' + formato, formato, pilotos: resultado.length, fileHash, batKey };
  }

  await bucket.upload(caminho, { destination: 'uploads/' + batKey + '/' + nome });
  await db.ref('baterias/' + batKey).set(uploadData);
  try {
    await db.ref('publicResumo/baterias/' + batKey).set(gerarResumoBateria({ firebaseKey: batKey, ...uploadData }));
  } catch (e) { log('[robo] aviso: nao publicou resumo (' + e.message + ')'); }
  await db.ref('uploadLog/' + batKey).set({ uid: 'robo-auto', acao: 'upload', bateriaKey: batKey, fileHash, timestamp: Date.now() });

  return { status: 'enviado', detalhe: formato + ' com ' + resultado.length + ' piloto(s)', formato, pilotos: resultado.length, fileHash, batKey };
}

// ---- Varredura ----
let escaneando = false;

async function varrer() {
  if (escaneando) return;
  escaneando = true;
  try {
    if (!fs.existsSync(config.pasta)) {
      log('[robo] ERRO: pasta nao existe: ' + config.pasta + ' (confira config.json)');
      return;
    }
    const estado = carregarEstado();
    let nomes;
    try { nomes = fs.readdirSync(config.pasta); } catch (e) { log('[robo] ERRO lendo pasta: ' + e.message); return; }

    let novos = 0;
    for (const nome of nomes) {
      const caminho = path.join(config.pasta, nome);
      let stat;
      try { stat = fs.statSync(caminho); } catch (e) { continue; }
      if (!stat.isFile()) continue;
      if (!config.extensoes.includes(path.extname(nome).toLowerCase())) continue;

      const conhecido = estado.arquivos[nome];
      if (conhecido && conhecido.size === stat.size && conhecido.mtimeMs === stat.mtimeMs && conhecido.status !== 'falha') continue;

      // Arquivo modificado ha menos de 10s pode estar sendo gravado: confere estabilidade.
      const idadeMs = Date.now() - stat.mtimeMs;
      if (idadeMs < 10000 && !(await arquivoEstavel(caminho))) {
        log('[robo] "' + nome + '" ainda mudando, deixo para o proximo ciclo.');
        continue;
      }

      log('[robo] novo arquivo: ' + nome + ' (' + (stat.size / 1024).toFixed(1) + ' KB)');
      try {
        const r = await enviarArquivo(caminho, nome, stat.size);
        log('[robo] "' + nome + '" -> ' + r.status + (r.detalhe ? ' (' + r.detalhe + ')' : ''));
        estado.arquivos[nome] = { size: stat.size, mtimeMs: stat.mtimeMs, hash: r.fileHash || null, batKey: r.batKey || null, status: r.status === 'falha' ? 'falha' : 'ok', em: Date.now() };
        if (r.fileHash) estado.hashes[r.fileHash] = r.batKey;
        if ((r.status === 'enviado' || (DRY_RUN && r.status === 'simulado')) && config.moverParaEnviados && !MODO_TESTE) {
          try {
            const destDir = path.join(config.pasta, 'enviados');
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir);
            let destino = path.join(destDir, nome);
            if (fs.existsSync(destino)) destino = path.join(destDir, Date.now() + '_' + nome);
            fs.renameSync(caminho, destino);
            log('[robo] movido para enviados/' + path.basename(destino));
            delete estado.arquivos[nome];
          } catch (e) { log('[robo] aviso: nao consegui mover (' + e.message + ')'); }
        }
        if (r.status === 'enviado' || r.status === 'simulado') novos++;
      } catch (e) {
        log('[robo] FALHA em "' + nome + '": ' + e.message);
        estado.arquivos[nome] = { size: stat.size, mtimeMs: stat.mtimeMs, hash: null, batKey: null, status: 'falha', em: Date.now() };
      }
      salvarEstado(estado);
    }
    salvarEstado(estado);
    if (novos === 0) log('[robo] varredura ok, nada novo.');
  } finally {
    escaneando = false;
  }
}

// ---- Main ----
(async () => {
  if (MODO_CONFIGURAR) {
    await configurarAssistente();
    process.exit(0);
  }

  if (MODO_TESTE) {
    const alvo = path.resolve(MODO_TESTE);
    if (!fs.existsSync(alvo)) { console.error('[robo] arquivo nao encontrado: ' + alvo); process.exit(1); }
    const stat = fs.statSync(alvo);
    const r = await enviarArquivo(alvo, path.basename(alvo), stat.size);
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  }

  log('[robo] CTAD upload automatico iniciado. Pasta: ' + config.pasta + ' | a cada ' + config.intervaloSegundos + 's | pista: ' + config.pistaId + (DRY_RUN ? ' | DRY-RUN (sem enviar)' : ''));
  if (!DRY_RUN) {
    try { initFirebase(); log('[robo] Firebase conectado.'); }
    catch (e) { log('[robo] ERRO Firebase: ' + e.message); process.exit(1); }
  }

  await varrer();
  if (SCAN_ONCE) process.exit(0);
  setInterval(varrer, config.intervaloSegundos * 1000);
})();
