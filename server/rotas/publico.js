// API pública: o que qualquer visitante pode ver. Só números agregados, sem dados pessoais.
import { Router } from 'express';
import { query } from '../db.js';
import { situacaoDosPostos, paraPublico } from '../regras/presenca.js';

const rotas = Router();

function resumir(postos) {
  const emHorario = postos.filter((p) => p.em_horario);
  return {
    postos: postos.length,
    em_operacao: emHorario.filter((p) => p.presentes > 0).length,
    no_posto: emHorario.reduce((s, p) => s + (p.sem_sinal ? 0 : p.presentes), 0),
    previstos: postos.reduce((s, p) => s + p.previsto, 0),
    sem_atualizacao: emHorario.filter((p) => p.sem_sinal).length,
  };
}

// Situação geral da praia, a partir dos postos dela.
function statusDaPraia(postos) {
  if (!postos.length) return 'sem_posto';
  if (postos.every((p) => !p.em_horario)) return 'fechado';
  if (postos.some((p) => p.sem_sinal)) return 'sem_atualizacao';
  if (postos.some((p) => p.status === 'sem_efetivo')) return 'sem_efetivo';
  if (postos.some((p) => p.status === 'reduzido')) return 'reduzido';
  return 'completo';
}

const media = (lista, campo) => (lista.length ? lista.reduce((s, p) => s + p[campo], 0) / lista.length : null);

// Junta todas as praias do catálogo (com ou sem posto) com a situação dos seus postos.
function montarPraias(catalogo, postos) {
  return catalogo.map((pr) => {
    const lista = postos.filter((p) => p.slug === pr.slug);
    return {
      ...pr, ...resumir(lista), status: statusDaPraia(lista), ids: lista.map((p) => p.id),
      latitude: media(lista, 'latitude'), longitude: media(lista, 'longitude'), // centro da praia = média dos postos
    };
  });
}

const SQL_PRAIAS = `SELECT pr.slug, pr.nome, pr.regiao_id, r.nome AS regiao, pr.observacao
  FROM praias pr JOIN regioes r ON r.id = pr.regiao_id`;

// GET /api/publico/situacao → relógio, totais da cidade, praias e postos.
rotas.get('/situacao', async (req, res) => {
  const { relogio, postos } = await situacaoDosPostos();
  const publicos = postos.map(paraPublico);
  const catalogo = await query(SQL_PRAIAS + ' ORDER BY pr.ordem');
  const regioes = await query('SELECT id, nome FROM regioes ORDER BY CASE id WHEN \'N\' THEN 1 WHEN \'L\' THEN 2 WHEN \'S\' THEN 3 ELSE 4 END');
  res.json({ ficticio: true, relogio, totais: resumir(publicos), regioes, praias: montarPraias(catalogo, publicos), postos: publicos });
});

// GET /api/publico/praias/:slug → uma praia e seus postos.
rotas.get('/praias/:slug', async (req, res) => {
  const catalogo = await query(SQL_PRAIAS + ' WHERE pr.slug = $1', [req.params.slug]);
  if (!catalogo.length) return res.status(404).json({ erro: 'Praia não encontrada.' });
  const { relogio, postos } = await situacaoDosPostos();
  const daPraia = postos.filter((p) => p.slug === req.params.slug).map(paraPublico);
  const [praia] = montarPraias(catalogo, daPraia);
  res.json({ ficticio: true, relogio, praia, postos: daPraia });
});

export default rotas;
