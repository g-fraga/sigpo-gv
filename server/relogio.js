// Relógio da demonstração.
// O site simula um dia de temporada. Quando a demonstração começa (ou é reiniciada), o relógio marca 10:30
// e anda junto com o tempo real. Assim, mesmo apresentando à noite, os postos aparecem "em operação".
import { query } from './db.js';

export const INICIO_PADRAO = 10 * 60 + 30; // 10:30

let cache = null;

export function hojeEmFlorianopolis() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export async function carregarRelogio() {
  const linhas = await query("SELECT chave, valor FROM config WHERE chave LIKE 'demo_%'");
  const c = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  cache = { data: c.demo_data, inicioReal: Number(c.demo_inicio_real), inicioMin: Number(c.demo_inicio_min) };
  return cache;
}

export function limparCache() { cache = null; }

export const doisDigitos = (n) => String(n).padStart(2, '0');
export function minParaHora(min) {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.floor(min)));
  return doisDigitos(Math.floor(m / 60)) + ':' + doisDigitos(m % 60);
}
export function horaParaMin(txt) {
  if (!txt) return null;
  const s = String(txt);
  const hora = s.length > 8 ? s.slice(11, 16) : s.slice(0, 5); // aceita "2026-11-16 10:42:00" ou "10:42:00"
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

// Retorna o "agora" da demonstração: data, minutos do dia, texto HH:MM e carimbo para o banco.
export async function agora() {
  if (!cache) await carregarRelogio();
  const passados = (Date.now() - cache.inicioReal) / 60000;
  const minutos = Math.min(23 * 60 + 59, cache.inicioMin + passados);
  const seg = Math.floor((minutos % 1) * 60);
  return {
    data: cache.data,
    minutos,
    hhmm: minParaHora(minutos),
    ts: cache.data + ' ' + minParaHora(minutos) + ':' + doisDigitos(seg),
  };
}

export function carimbo(data, minutos) {
  return data + ' ' + minParaHora(minutos) + ':00';
}
