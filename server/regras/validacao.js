// Validações e escopo de acesso usados pelas rotas dos painéis.
// Toda regra de permissão fica no servidor: o navegador só mostra o que a API deixa ver.
import { query } from '../db.js';

// Erro com status HTTP. As rotas lançam ErroHttp e o servidor responde { erro: mensagem }.
export class ErroHttp extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}
export const falha = (status, mensagem) => { throw new ErroHttp(status, mensagem); };

// Região que o usuário pode ver: o supervisor fica preso à dele; o administrador escolhe (ou vê todas).
export function regiaoPermitida(usuario, pedida) {
  if (usuario.perfil === 'supervisor') return usuario.regiao_id;
  if (usuario.perfil === 'admin') return pedida || null;
  return falha(403, 'Seu perfil não tem acesso a esta função.');
}

export async function postoNoEscopo(usuario, postoId) {
  const id = inteiro(postoId, 'Posto');
  const [p] = await query(`SELECT p.id, p.codigo, p.nome, p.tipo, p.ativo, pr.nome AS praia, pr.regiao_id
    FROM postos p JOIN praias pr ON pr.id = p.praia_id WHERE p.id = $1`, [id]);
  if (!p) falha(404, 'Posto não encontrado.');
  if (usuario.perfil === 'supervisor' && p.regiao_id !== usuario.regiao_id) falha(403, 'Este posto não pertence à sua região.');
  return p;
}

export function inteiro(valor, nome = 'Valor') {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) falha(400, `${nome} inválido.`);
  return n;
}

export function texto(valor, nome, { min = 1, max = 500, opcional = false } = {}) {
  const t = String(valor ?? '').trim();
  if (!t && opcional) return null;
  if (t.length < min) falha(400, min > 1 ? `${nome}: escreva pelo menos ${min} caracteres.` : `Informe ${nome.toLowerCase()}.`);
  if (t.length > max) falha(400, `${nome}: no máximo ${max} caracteres.`);
  return t;
}

export function opcao(valor, nome, lista) {
  if (!lista.includes(valor)) falha(400, `${nome} inválido.`);
  return valor;
}

export function data(valor, nome = 'Data') {
  const s = String(valor ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T12:00:00Z'))) falha(400, `${nome} inválida. Use o formato AAAA-MM-DD.`);
  return s;
}

export function hora(valor, nome = 'Horário') {
  const s = String(valor ?? '').slice(0, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) falha(400, `${nome} inválido. Use o formato HH:MM.`);
  return s;
}

export const somaDias = (d, n) => new Date(new Date(d + 'T12:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
export const TIPOS_REGISTRO = ['apresentacao', 'intervalo', 'retorno', 'saida'];
