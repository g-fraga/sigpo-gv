// Rotas da administração. Por enquanto: conferir a posição dos postos no mapa.
// O ajuste só fica ligado no computador de desenvolvimento (ou com AJUSTE_POSICOES=sim),
// porque as contas de demonstração são públicas e qualquer um poderia mexer no site publicado.
import { Router } from 'express';
import { query } from '../db.js';
import { exigirPerfil, auditar } from './auth.js';

export const ajusteLigado = () => process.env.AJUSTE_POSICOES === 'sim' || process.env.NODE_ENV !== 'production';

const rotas = Router();
rotas.use(exigirPerfil('admin'));

// Limites aproximados do município, para recusar um clique fora de Florianópolis.
const LIMITES = { latMin: -27.9, latMax: -27.35, lngMin: -48.7, lngMax: -48.33 };

const SQL_POSTOS = `SELECT p.codigo, pr.slug AS praia, pr.nome AS praia_nome, p.nome AS posto, p.tipo, p.sazonal,
    p.latitude, p.longitude, p.precisao, COALESCE(p.observacao, '') AS observacao
  FROM postos p JOIN praias pr ON pr.id = p.praia_id ORDER BY pr.ordem, p.tipo DESC, p.codigo`;

rotas.get('/postos', async (req, res) => {
  res.json({ ajuste: ajusteLigado(), postos: await query(SQL_POSTOS) });
});

rotas.put('/postos/:codigo/posicao', async (req, res) => {
  if (!ajusteLigado()) return res.status(403).json({ erro: 'O ajuste de posições está desligado neste servidor.' });
  const lat = Number(req.body?.latitude), lng = Number(req.body?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ erro: 'Coordenada inválida.' });
  if (lat < LIMITES.latMin || lat > LIMITES.latMax || lng < LIMITES.lngMin || lng > LIMITES.lngMax) {
    return res.status(400).json({ erro: 'Essa coordenada fica fora de Florianópolis. Confira se latitude e longitude não estão trocadas.' });
  }
  const [posto] = await query("UPDATE postos SET latitude=$1, longitude=$2, precisao='conferida' WHERE codigo=$3 RETURNING codigo, nome", [lat, lng, req.params.codigo]);
  if (!posto) return res.status(404).json({ erro: 'Posto não encontrado.' });
  // Guarda também na tabela que sobrevive à recriação diária da demonstração.
  await query(`INSERT INTO posicoes_conferidas (codigo, latitude, longitude, conferida_em) VALUES ($1,$2,$3,now())
    ON CONFLICT (codigo) DO UPDATE SET latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, conferida_em=now()`, [posto.codigo, lat, lng]);
  await auditar(req.usuario, 'Conferiu posição do posto', posto.codigo, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  res.json({ ok: true, codigo: posto.codigo, latitude: lat, longitude: lng });
});

// GET /api/admin/postos.csv → o arquivo postos.csv com as posições atuais, pronto para substituir o do repositório.
rotas.get('/postos.csv', async (req, res) => {
  const linhas = (await query(SQL_POSTOS)).map((p) => [p.codigo, p.praia, p.posto, p.tipo, p.sazonal ? 'sim' : 'nao',
    p.latitude.toFixed(5), p.longitude.toFixed(5), p.precisao, p.observacao].join(';'));
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="postos.csv"' });
  res.send(['codigo;praia;posto;tipo;sazonal;latitude;longitude;precisao;observacao', ...linhas].join('\n') + '\n');
});

export default rotas;
