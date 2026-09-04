export const SENHA_UNIFICADA = "1234";

export let db = null;
export let listaJsonsCache = [];
export let campeonatosCache = {};
export let comprasColetivasCache = {};

export let chartInstances = [];
export let pilotosMetadadosCache = {};
export let mesclagensCache = {};
export let campeonatoAtivoKey = null;
export let campeonatoParticiparKey = null;
export let replayStates = {};

export let compraAbertaKey = null;
export let compraAbertaDados = null;
export let senhaCallbackPendente = null;

export const ALIAS_EDGARD_DJ_DEFAULTS = {
    "edgard": "Edgard Camilo (DJ)",
    "Edgard": "Edgard Camilo (DJ)",
    "edgar": "Edgard Camilo (DJ)",
    "Edgar": "Edgard Camilo (DJ)",
    "Dj_Edgar": "Edgard Camilo (DJ)",
    "DJ": "Edgard Camilo (DJ)"
};

export function setDb(val) { db = val; }
export function setListaJsonsCache(val) { listaJsonsCache = val; }
export function setCampeonatosCache(val) { campeonatosCache = val; }
export function setComprasColetivasCache(val) { comprasColetivasCache = val; }
export function setPilotosMetadadosCache(val) { pilotosMetadadosCache = val; }
export function setMesclagensCache(val) { mesclagensCache = val; }
export function setCampeonatoAtivoKey(val) { campeonatoAtivoKey = val; }
export function setCampeonatoParticiparKey(val) { campeonatoParticiparKey = val; }
export function setCompraAbertaKey(val) { compraAbertaKey = val; }
export function setCompraAbertaDados(val) { compraAbertaDados = val; }
export function setSenhaCallbackPendente(val) { senhaCallbackPendente = val; }