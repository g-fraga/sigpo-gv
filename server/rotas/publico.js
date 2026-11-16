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

function agruparPorPraia(postos) {
  const praias = new Map();
  for (const p of postos) {
    if (!praias.has(p.slug)) praias.set(p.slug, { slug: p.slug, nome: p.praia, regiao_id: p.regiao_id, regiao: p.regiao, lista: [] });
    praias.get(p.slug).lista.push(p);
  }
  return [...praias.values()].map((pr) => ({ ...pr, ...resumir(pr.lista) })); // resumir() devolve postos = quantidade
}

// GET /api/publico/situacao → relógio, totais da cidade, praias e postos.
rotas.get('/situacao', async (req, res) => {
  const { relogio, postos } = await situacaoDosPostos();
  const publicos = postos.map(paraPublico);
  const coords = await query('SELECT slug, latitude, longitude FROM praias');
  const coordDe = Object.fromEntries(coords.map((c) => [c.slug, c]));
  const praias = agruparPorPraia(publicos).map(({ lista, ...pr }) => ({
    ...pr, latitude: coordDe[pr.slug].latitude, longitude: coordDe[pr.slug].longitude, ids: lista.map((p) => p.id),
  }));
  res.json({ ficticio: true, relogio, totais: resumir(publicos), praias, postos: publicos });
});

// GET /api/publico/praias/:slug → uma praia e seus postos.
rotas.get('/praias/:slug', async (req, res) => {
  const [praia] = await query(`SELECT pr.slug, pr.nome, pr.latitude, pr.longitude, r.nome AS regiao
    FROM praias pr JOIN regioes r ON r.id = pr.regiao_id WHERE pr.slug = $1`, [req.params.slug]);
  if (!praia) return res.status(404).json({ erro: 'Praia não encontrada.' });
  const { relogio, postos } = await situacaoDosPostos();
  const daPraia = postos.filter((p) => p.slug === praia.slug).map(paraPublico);
  res.json({ ficticio: true, relogio, praia: { ...praia, ...resumir(daPraia) }, postos: daPraia });
});

export default rotas;
