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

export const ALIAS_EDGARD_DJ_DEFAULTS = {
    "edgard": "Edgard Camilo (DJ)",
    "Edgard": "Edgard Camilo (DJ)",
    "edgar": "Edgard Camilo (DJ)",
    "Edgar": "Edgard Camilo (DJ)",
    "Dj_Edgar": "Edgard Camilo (DJ)",
    "DJ": "Edgard Camilo (DJ)"
};

export function setDb(val) { db = val; }
export const PISTA_PADRAO = "krathus";

export let pistaAtivaId = PISTA_PADRAO;
export let minhasPistas = [];
export let modoPortal = "vitrine"; // vitrine | pista | todas
export function setPistaAtivaId(v) { pistaAtivaId = v || PISTA_PADRAO; }
export function setMinhasPistas(v) { minhasPistas = v || []; }
export function setModoPortal(v) { modoPortal = v || "vitrine"; }
export function refPista(path) {
    return (db ? db.ref('pistas/' + pistaAtivaId + '/' + path) : null);
}
export function getPistaIdDeRegistro(reg) {
    if (!reg) return PISTA_PADRAO;
    return reg.pistaId || reg.pista || PISTA_PADRAO;
}
export function setListaJsonsCache(val) { listaJsonsCache = val; }
export function setCampeonatosCache(val) { campeonatosCache = val; }
export function setComprasColetivasCache(val) { comprasColetivasCache = val; }
export function setPilotosMetadadosCache(val) { pilotosMetadadosCache = val; }
export function setMesclagensCache(val) { mesclagensCache = val; }
export function setCampeonatoAtivoKey(val) { campeonatoAtivoKey = val; }
export function setCampeonatoParticiparKey(val) { campeonatoParticiparKey = val; }
