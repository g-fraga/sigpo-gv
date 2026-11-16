// Login, logout e controle de acesso.
// A senha nunca é guardada: o banco tem só o hash (bcrypt). A sessão fica num cookie assinado.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { agora } from '../relogio.js';

const rotas = Router();

// Limite simples contra tentativa e erro: 8 tentativas erradas por IP a cada 10 minutos.
const tentativas = new Map();
const JANELA = 10 * 60 * 1000, MAXIMO = 8;
function bloqueado(ip) {
  const t = tentativas.get(ip);
  if (!t || Date.now() - t.inicio > JANELA) return false;
  return t.erros >= MAXIMO;
}
function registrarErro(ip) {
  const t = tentativas.get(ip);
  if (!t || Date.now() - t.inicio > JANELA) tentativas.set(ip, { inicio: Date.now(), erros: 1 });
  else t.erros++;
}

export async function usuarioDaSessao(req) {
  if (!req.session?.uid) return null;
  const [u] = await query(`SELECT u.id, u.nome, u.email, u.perfil, u.regiao_id, u.guarda_vidas_id, r.nome AS regiao
    FROM usuarios u LEFT JOIN regioes r ON r.id = u.regiao_id WHERE u.id = $1 AND u.ativo`, [req.session.uid]);
  return u || null;
}

// Middleware: só deixa passar quem está logado e tem um dos perfis indicados.
export function exigirPerfil(...perfis) {
  return async (req, res, next) => {
    const u = await usuarioDaSessao(req);
    if (!u) return res.status(401).json({ erro: 'Faça login para continuar.' });
    if (perfis.length && !perfis.includes(u.perfil)) return res.status(403).json({ erro: 'Seu perfil não tem acesso a esta função.' });
    req.usuario = u;
    next();
  };
}

export async function auditar(usuario, acao, objeto, detalhe = null) {
  const { ts } = await agora();
  await query('INSERT INTO auditoria (usuario_id, usuario_nome, acao, objeto, detalhe, criado_em) VALUES ($1,$2,$3,$4,$5,$6)',
    [usuario.id, usuario.nome, acao, objeto, detalhe, ts]);
}

rotas.post('/entrar', async (req, res) => {
  const ip = req.ip;
  if (bloqueado(ip)) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  const senha = String(req.body?.senha || '');
  if (!email || !senha) return res.status(400).json({ erro: 'Informe e-mail e senha.' });

  const [u] = await query('SELECT id, nome, perfil, senha_hash, ativo FROM usuarios WHERE email = $1', [email]);
  const confere = u ? await bcrypt.compare(senha, u.senha_hash) : false;
  if (!u || !confere || !u.ativo) {
    registrarErro(ip);
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' }); // mesma mensagem nos dois casos, de propósito
  }
  req.session.uid = u.id;
  await auditar(u, 'Entrou no sistema', u.perfil);
  res.json({ nome: u.nome, perfil: u.perfil });
});

rotas.post('/sair', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

rotas.get('/eu', async (req, res) => {
  const u = await usuarioDaSessao(req);
  if (!u) return res.status(401).json({ erro: 'Não autenticado.' });
  const { data, hhmm } = await agora();
  res.json({ ...u, relogio: { data, hhmm } });
});

export default rotas;
