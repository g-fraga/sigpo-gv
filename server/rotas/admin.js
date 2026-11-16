// Rotas exclusivas da administração: postos, guarda-vidas, pulseiras, escalas, auditoria e posição dos postos.
import { Router } from 'express';
import { query } from '../db.js';
import { agora } from '../relogio.js';
import { exigirPerfil, auditar } from './auth.js';
import { criarDemonstracao, escalasDaLotacao } from '../dados-demo.js';
import { falha, inteiro, texto, opcao, data as validarData, hora as validarHora, somaDias } from '../regras/validacao.js';

// O ajuste de posição só fica ligado no computador de desenvolvimento (ou com AJUSTE_POSICOES=sim),
// porque as contas de demonstração são públicas e qualquer um poderia mexer no site publicado.
export const ajusteLigado = () => process.env.AJUSTE_POSICOES === 'sim' || process.env.NODE_ENV !== 'production';

const rotas = Router();
rotas.use(exigirPerfil('admin'));

// Limites aproximados do município, para recusar uma coordenada fora de Florianópolis.
const LIMITES = { latMin: -27.9, latMax: -27.35, lngMin: -48.7, lngMax: -48.33 };
function coordenada(lat, lng) {
  const a = Number(lat), o = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(o)) falha(400, 'Coordenada inválida.');
  if (a < LIMITES.latMin || a > LIMITES.latMax || o < LIMITES.lngMin || o > LIMITES.lngMax) falha(400, 'Essa coordenada fica fora de Florianópolis. Confira se latitude e longitude não estão trocadas.');
  return [a, o];
}

// ---------------------------------------------------------------------------------------------
// Postos
// ---------------------------------------------------------------------------------------------
const SQL_POSTOS = `SELECT p.id, p.codigo, pr.slug AS praia, pr.nome AS praia_nome, pr.id AS praia_id, pr.regiao_id, r.nome AS regiao, p.nome AS posto, p.tipo, p.sazonal,
    p.latitude, p.longitude, p.precisao, COALESCE(p.observacao, '') AS observacao, p.previsto, p.energia, p.ativo,
    to_char(p.hora_inicio, 'HH24:MI') AS hora_inicio, to_char(p.hora_fim, 'HH24:MI') AS hora_fim, t.codigo AS terminal,
    (SELECT COUNT(*)::int FROM guarda_vidas g WHERE g.posto_id = p.id AND g.situacao = 'ativo') AS lotados
  FROM postos p JOIN praias pr ON pr.id = p.praia_id JOIN regioes r ON r.id = pr.regiao_id LEFT JOIN terminais t ON t.posto_id = p.id`;

rotas.get('/postos', async (req, res) => {
  const praias = await query('SELECT pr.id, pr.nome, pr.regiao_id, r.nome AS regiao FROM praias pr JOIN regioes r ON r.id = pr.regiao_id ORDER BY pr.ordem');
  res.json({ ajuste: ajusteLigado(), praias, postos: await query(SQL_POSTOS + ' ORDER BY pr.ordem, p.tipo DESC, p.codigo') });
});

rotas.get('/postos/:id', async (req, res) => {
  const [p] = await query(SQL_POSTOS + ' WHERE p.id = $1', [inteiro(req.params.id, 'Posto')]);
  if (!p) falha(404, 'Posto não encontrado.');
  const { data: hoje } = await agora();
  const lotados = await query("SELECT id, codigo, nome, vinculo, situacao FROM guarda_vidas WHERE posto_id = $1 ORDER BY (vinculo = 'Militar') DESC, codigo", [p.id]);
  const escalados = await query(`SELECT g.codigo, g.nome, ei.funcao, to_char(ei.inicio, 'HH24:MI') AS inicio, to_char(ei.fim, 'HH24:MI') AS fim FROM escala_itens ei
    JOIN escalas e ON e.id = ei.escala_id JOIN guarda_vidas g ON g.id = ei.guarda_vidas_id
    WHERE e.posto_id = $1 AND e.data = $2 AND e.versao = (SELECT MAX(versao) FROM escalas e2 WHERE e2.posto_id = $1 AND e2.data = $2) ORDER BY ei.id`, [p.id, hoje]);
  const [{ n: registros }] = await query('SELECT COUNT(*)::int AS n FROM registros WHERE posto_id = $1', [p.id]);
  res.json({ ...p, lotados, escalados, registros });
});

function dadosDoPosto(b) {
  const nome = texto(b.nome, 'Nome do posto', { min: 3, max: 60 });
  const tipo = opcao(b.tipo, 'Tipo', ['guarita', 'avancado']);
  const previsto = Number(b.previsto);
  if (!Number.isInteger(previsto) || previsto < 1 || previsto > 20) falha(400, 'Efetivo previsto: informe um número entre 1 e 20.');
  const ini = validarHora(b.hora_inicio || '08:00', 'Horário de início');
  const fim = validarHora(b.hora_fim || '19:00', 'Horário de fim');
  if (ini >= fim) falha(400, 'O horário de início deve ser antes do fim.');
  const energia = tipo === 'avancado' ? 'nenhuma' : opcao(b.energia || 'rede', 'Energia', ['rede', 'bateria', 'solar']);
  const [lat, lng] = coordenada(b.latitude, b.longitude);
  return { nome, tipo, previsto, ini, fim, energia, lat, lng, sazonal: b.sazonal === true || b.sazonal === 'sim', observacao: texto(b.observacao, 'Observação', { opcional: true, max: 200 }) };
}

rotas.post('/postos', async (req, res) => {
  const b = req.body || {};
  const praiaId = inteiro(b.praia_id, 'Praia');
  const [praia] = await query('SELECT id, nome, regiao_id FROM praias WHERE id = $1', [praiaId]);
  if (!praia) falha(404, 'Praia não encontrada.');
  const d = dadosDoPosto(b);
  // Código: letra da região + próximo número livre (ex.: L11).
  const [{ n }] = await query("SELECT COALESCE(MAX(NULLIF(regexp_replace(codigo, '\\D', '', 'g'), '')::int), 0) + 1 AS n FROM postos WHERE codigo LIKE $1", [praia.regiao_id + '%']);
  const codigo = praia.regiao_id + String(n).padStart(2, '0');
  const [p] = await query(`INSERT INTO postos (codigo, praia_id, nome, tipo, latitude, longitude, previsto, hora_inicio, hora_fim, energia, sazonal, precisao, observacao)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'conferida',$12) RETURNING id`, [codigo, praia.id, d.nome, d.tipo, d.lat, d.lng, d.previsto, d.ini, d.fim, d.energia, d.sazonal, d.observacao]);
  if (d.tipo === 'guarita') await query('INSERT INTO terminais (posto_id, codigo, online) VALUES ($1,$2,TRUE)', [p.id, 'T-' + codigo]);
  await auditar(req.usuario, 'Cadastrou posto', `${praia.nome}, ${d.nome} (${codigo})`);
  res.status(201).json({ ok: true, id: p.id, mensagem: `Posto ${codigo} cadastrado.` });
});

rotas.put('/postos/:id', async (req, res) => {
  const id = inteiro(req.params.id, 'Posto');
  const [atual] = await query('SELECT p.*, pr.nome AS praia FROM postos p JOIN praias pr ON pr.id = p.praia_id WHERE p.id = $1', [id]);
  if (!atual) falha(404, 'Posto não encontrado.');
  const d = dadosDoPosto(req.body || {});
  const mudouPosicao = Math.abs(d.lat - atual.latitude) > 1e-7 || Math.abs(d.lng - atual.longitude) > 1e-7;
  await query(`UPDATE postos SET nome=$1, tipo=$2, latitude=$3, longitude=$4, previsto=$5, hora_inicio=$6, hora_fim=$7, energia=$8, sazonal=$9, observacao=$10,
    precisao = CASE WHEN $11 THEN 'conferida' ELSE precisao END WHERE id=$12`, [d.nome, d.tipo, d.lat, d.lng, d.previsto, d.ini, d.fim, d.energia, d.sazonal, d.observacao, mudouPosicao, id]);
  if (d.tipo === 'guarita') await query("INSERT INTO terminais (posto_id, codigo, online) SELECT $1::int, 'T-' || $2::text, TRUE WHERE NOT EXISTS (SELECT 1 FROM terminais WHERE posto_id = $1::int)", [id, atual.codigo]);
  await auditar(req.usuario, 'Editou posto', `${atual.praia}, ${d.nome} (${atual.codigo})`);
  res.json({ ok: true, mensagem: 'Posto atualizado.' });
});

rotas.post('/postos/:id/ativo', async (req, res) => {
  const id = inteiro(req.params.id, 'Posto');
  const ativo = req.body?.ativo === true;
  const justificativa = texto(req.body?.justificativa, 'Justificativa', { min: 10 });
  const [p] = await query('UPDATE postos p SET ativo = $1 FROM praias pr WHERE pr.id = p.praia_id AND p.id = $2 RETURNING p.codigo, p.nome, pr.nome AS praia', [ativo, id]);
  if (!p) falha(404, 'Posto não encontrado.');
  await auditar(req.usuario, ativo ? 'Reativou posto' : 'Desativou posto', `${p.praia}, ${p.nome} (${p.codigo})`, justificativa);
  res.json({ ok: true, mensagem: ativo ? 'Posto reativado.' : 'Posto desativado. O histórico de escalas e registros foi mantido.' });
});

rotas.put('/postos/:codigo/posicao', async (req, res) => {
  if (!ajusteLigado()) falha(403, 'O ajuste de posições está desligado neste servidor.');
  const [lat, lng] = coordenada(req.body?.latitude, req.body?.longitude);
  const [posto] = await query("UPDATE postos SET latitude=$1, longitude=$2, precisao='conferida' WHERE codigo=$3 RETURNING codigo, nome", [lat, lng, req.params.codigo]);
  if (!posto) falha(404, 'Posto não encontrado.');
  // Guarda também na tabela que sobrevive à recriação da demonstração.
  await query(`INSERT INTO posicoes_conferidas (codigo, latitude, longitude, conferida_em) VALUES ($1,$2,$3,now())
    ON CONFLICT (codigo) DO UPDATE SET latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, conferida_em=now()`, [posto.codigo, lat, lng]);
  await auditar(req.usuario, 'Conferiu posição do posto', posto.codigo, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  res.json({ ok: true, codigo: posto.codigo, latitude: lat, longitude: lng });
});

// GET /api/admin/postos.csv → o arquivo postos.csv com as posições atuais, pronto para substituir o do repositório.
rotas.get('/postos.csv', async (req, res) => {
  const linhas = (await query(SQL_POSTOS + ' ORDER BY pr.ordem, p.tipo DESC, p.codigo')).map((p) => [p.codigo, p.praia, p.posto, p.tipo, p.sazonal ? 'sim' : 'nao',
    p.latitude.toFixed(5), p.longitude.toFixed(5), p.precisao, p.observacao].join(';'));
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="postos.csv"' });
  res.send(['codigo;praia;posto;tipo;sazonal;latitude;longitude;precisao;observacao', ...linhas].join('\n') + '\n');
});

// ---------------------------------------------------------------------------------------------
// Guarda-vidas
// ---------------------------------------------------------------------------------------------
rotas.get('/guarda-vidas', async (req, res) => {
  const busca = req.query.busca ? '%' + String(req.query.busca).trim().slice(0, 60) + '%' : null;
  const { data: hoje } = await agora();
  const lista = await query(`SELECT g.id, g.codigo, g.nome, g.vinculo, g.situacao, g.posto_id, p.nome AS posto, pr.nome AS praia, pr.regiao_id,
      (SELECT pu.numero_chip FROM pulseiras pu WHERE pu.guarda_vidas_id = g.id AND pu.situacao = 'ativa' LIMIT 1) AS pulseira,
      EXISTS (SELECT 1 FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id WHERE ei.guarda_vidas_id = g.id AND e.data = $1
        AND e.versao = (SELECT MAX(versao) FROM escalas e2 WHERE e2.posto_id = e.posto_id AND e2.data = $1)) AS escalado_hoje
    FROM guarda_vidas g LEFT JOIN postos p ON p.id = g.posto_id LEFT JOIN praias pr ON pr.id = p.praia_id
    WHERE ($2::text IS NULL OR g.codigo ILIKE $2 OR g.nome ILIKE $2) AND ($3::text IS NULL OR g.situacao = $3)
      AND ($4::text IS NULL OR pr.regiao_id = $4 OR ($4 = 'sem' AND g.posto_id IS NULL))
    ORDER BY g.codigo`, [hoje, busca, req.query.situacao || null, req.query.regiao || null]);
  res.json({ guarda_vidas: lista });
});

rotas.get('/guarda-vidas/:id', async (req, res) => {
  const id = inteiro(req.params.id, 'Guarda-vidas');
  const [g] = await query(`SELECT g.id, g.codigo, g.nome, g.vinculo, g.situacao, g.posto_id, p.nome AS posto, pr.nome AS praia, r.nome AS regiao
    FROM guarda_vidas g LEFT JOIN postos p ON p.id = g.posto_id LEFT JOIN praias pr ON pr.id = p.praia_id LEFT JOIN regioes r ON r.id = pr.regiao_id WHERE g.id = $1`, [id]);
  if (!g) falha(404, 'Guarda-vidas não encontrado.');
  const pulseiras = await query("SELECT id, numero_chip, tipo, situacao, to_char(emitida_em, 'DD/MM/YYYY') AS emitida, motivo FROM pulseiras WHERE guarda_vidas_id = $1 ORDER BY id DESC", [id]);
  const registros = await query(`SELECT r.id, to_char(r.hora_leitura, 'DD/MM HH24:MI') AS quando, r.tipo, r.origem, r.situacao, r.sincronizado, p.nome AS posto, pr.nome AS praia
    FROM registros r JOIN postos p ON p.id = r.posto_id JOIN praias pr ON pr.id = p.praia_id WHERE r.guarda_vidas_id = $1 ORDER BY r.hora_leitura DESC LIMIT 40`, [id]);
  const escalas = await query(`SELECT to_char(e.data, 'YYYY-MM-DD') AS data, p.nome AS posto, pr.nome AS praia, ei.funcao, to_char(ei.inicio, 'HH24:MI') AS inicio, to_char(ei.fim, 'HH24:MI') AS fim
    FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id JOIN postos p ON p.id = e.posto_id JOIN praias pr ON pr.id = p.praia_id
    WHERE ei.guarda_vidas_id = $1 AND e.versao = (SELECT MAX(versao) FROM escalas e2 WHERE e2.posto_id = e.posto_id AND e2.data = e.data)
    ORDER BY e.data DESC LIMIT 14`, [id]);
  res.json({ ...g, pulseiras, registros, escalas });
});

async function dadosDoGuardaVidas(b) {
  const nome = texto(b.nome, 'Nome', { min: 3, max: 80 });
  const vinculo = opcao(b.vinculo, 'Vínculo', ['GVCV', 'Militar']);
  const situacao = opcao(b.situacao || 'ativo', 'Situação', ['ativo', 'afastado', 'desligado']);
  let postoId = null;
  if (b.posto_id) {
    postoId = inteiro(b.posto_id, 'Posto base');
    const [p] = await query('SELECT ativo FROM postos WHERE id = $1', [postoId]);
    if (!p) falha(404, 'Posto base não encontrado.');
    if (!p.ativo) falha(400, 'O posto base escolhido está desativado.');
  }
  return { nome, vinculo, situacao, postoId };
}

rotas.post('/guarda-vidas', async (req, res) => {
  const b = req.body || {};
  const d = await dadosDoGuardaVidas(b);
  let codigo;
  if (b.codigo) {
    const n = String(b.codigo).replace(/\D/g, '');
    if (!n || n.length > 4) falha(400, 'Matrícula: use até 4 números (ex.: 0123).');
    codigo = 'GV ' + n.padStart(4, '0');
  } else {
    const [{ n }] = await query("SELECT COALESCE(MAX(regexp_replace(codigo, '\\D', '', 'g')::int), 100) + 1 AS n FROM guarda_vidas");
    codigo = 'GV ' + String(n).padStart(4, '0');
  }
  const [existe] = await query('SELECT 1 FROM guarda_vidas WHERE codigo = $1', [codigo]);
  if (existe) falha(409, `Já existe um guarda-vidas com a matrícula ${codigo}.`);
  const [g] = await query('INSERT INTO guarda_vidas (codigo, nome, vinculo, situacao, posto_id) VALUES ($1,$2,$3,$4,$5) RETURNING id', [codigo, d.nome, d.vinculo, d.situacao, d.postoId]);
  await auditar(req.usuario, 'Cadastrou guarda-vidas', `${codigo} ${d.nome}`);
  res.status(201).json({ ok: true, id: g.id, mensagem: `${codigo} cadastrado. Agora vincule uma pulseira.` });
});

rotas.put('/guarda-vidas/:id', async (req, res) => {
  const id = inteiro(req.params.id, 'Guarda-vidas');
  const [atual] = await query('SELECT codigo, situacao FROM guarda_vidas WHERE id = $1', [id]);
  if (!atual) falha(404, 'Guarda-vidas não encontrado.');
  const d = await dadosDoGuardaVidas(req.body || {});
  await query('UPDATE guarda_vidas SET nome=$1, vinculo=$2, situacao=$3, posto_id=$4 WHERE id=$5', [d.nome, d.vinculo, d.situacao, d.postoId, id]);
  // Quem deixa de estar ativo tem a credencial ativa desligada, para a pulseira não ser aceita nos terminais.
  if (d.situacao !== 'ativo') await query("UPDATE pulseiras SET situacao = 'inativa', motivo = $1 WHERE guarda_vidas_id = $2 AND situacao = 'ativa'", [`Guarda-vidas ${d.situacao}`, id]);
  await auditar(req.usuario, 'Editou guarda-vidas', `${atual.codigo} ${d.nome}`, atual.situacao !== d.situacao ? `Situação: ${atual.situacao} → ${d.situacao}` : null);
  res.json({ ok: true, mensagem: 'Cadastro atualizado. A mudança de posto base vale para as escalas geradas a partir de agora.' });
});

// ---------------------------------------------------------------------------------------------
// Pulseiras NFC
// ---------------------------------------------------------------------------------------------
function chipValido(valor) {
  const hex = String(valor || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length < 8 || hex.length > 20 || hex.length % 2) falha(400, 'Código da pulseira: use de 4 a 10 pares hexadecimais (ex.: 04:A1:B2:C3:D4:E5:F6).');
  return hex.match(/../g).join(':');
}

rotas.get('/pulseiras', async (req, res) => {
  const busca = req.query.busca ? '%' + String(req.query.busca).trim().slice(0, 60) + '%' : null;
  const pulseiras = await query(`SELECT pu.id, pu.numero_chip, pu.tipo, pu.situacao, to_char(pu.emitida_em, 'DD/MM/YYYY') AS emitida, pu.motivo,
      g.id AS gv_id, g.codigo, g.nome, g.situacao AS gv_situacao
    FROM pulseiras pu JOIN guarda_vidas g ON g.id = pu.guarda_vidas_id
    WHERE ($1::text IS NULL OR pu.situacao = $1) AND ($2::text IS NULL OR g.codigo ILIKE $2 OR g.nome ILIKE $2 OR pu.numero_chip ILIKE $2)
    ORDER BY (pu.situacao = 'ativa') DESC, g.codigo, pu.id DESC`, [req.query.situacao || null, busca]);
  const semCredencial = await query(`SELECT g.id, g.codigo, g.nome FROM guarda_vidas g WHERE g.situacao = 'ativo'
    AND NOT EXISTS (SELECT 1 FROM pulseiras pu WHERE pu.guarda_vidas_id = g.id AND pu.situacao = 'ativa') ORDER BY g.codigo`);
  res.json({ pulseiras, sem_credencial: semCredencial });
});

async function chipLivre(chip) {
  const [usado] = await query('SELECT g.codigo FROM pulseiras pu JOIN guarda_vidas g ON g.id = pu.guarda_vidas_id WHERE pu.numero_chip = $1', [chip]);
  if (usado) falha(409, `Este código de pulseira já está cadastrado (${usado.codigo}). Cada pulseira só pode ter um vínculo.`);
}

rotas.post('/pulseiras', async (req, res) => {
  const b = req.body || {};
  const gvId = inteiro(b.guarda_vidas_id, 'Guarda-vidas');
  const [g] = await query('SELECT id, codigo, nome, situacao FROM guarda_vidas WHERE id = $1', [gvId]);
  if (!g) falha(404, 'Guarda-vidas não encontrado.');
  if (g.situacao !== 'ativo') falha(400, 'Só é possível vincular pulseira a um guarda-vidas ativo.');
  const [ativa] = await query("SELECT 1 FROM pulseiras WHERE guarda_vidas_id = $1 AND situacao = 'ativa'", [gvId]);
  if (ativa) falha(409, `${g.codigo} já tem uma credencial ativa. Use "Substituir" na pulseira atual.`);
  const chip = chipValido(b.numero_chip);
  await chipLivre(chip);
  const tipo = opcao(b.tipo || 'pulseira', 'Tipo', ['pulseira', 'cartao_reserva']);
  const { data: hoje } = await agora();
  await query("INSERT INTO pulseiras (guarda_vidas_id, numero_chip, tipo, situacao, emitida_em) VALUES ($1,$2,$3,'ativa',$4)", [gvId, chip, tipo, hoje]);
  await auditar(req.usuario, 'Vinculou pulseira', `${g.codigo} ${g.nome}`, `${tipo === 'pulseira' ? 'Pulseira' : 'Cartão reserva'} ${chip}`);
  res.status(201).json({ ok: true, mensagem: `Credencial ${chip} vinculada a ${g.codigo}.` });
});

async function pulseira(id) {
  const [p] = await query('SELECT pu.*, g.codigo, g.nome, g.situacao AS gv_situacao FROM pulseiras pu JOIN guarda_vidas g ON g.id = pu.guarda_vidas_id WHERE pu.id = $1', [inteiro(id, 'Pulseira')]);
  if (!p) falha(404, 'Pulseira não encontrada.');
  return p;
}

rotas.post('/pulseiras/:id/bloquear', async (req, res) => {
  const p = await pulseira(req.params.id);
  if (p.situacao !== 'ativa') falha(400, 'Só uma credencial ativa pode ser bloqueada.');
  const motivo = { perda: 'Perda', roubo: 'Roubo ou furto', defeito: 'Defeito', outro: 'Outro' }[opcao(req.body?.motivo, 'Motivo', ['perda', 'roubo', 'defeito', 'outro'])];
  const detalhe = texto(req.body?.detalhe, 'Detalhe', { opcional: true, max: 200 });
  await query("UPDATE pulseiras SET situacao = 'bloqueada', motivo = $1 WHERE id = $2", [detalhe ? `${motivo}: ${detalhe}` : motivo, p.id]);
  await auditar(req.usuario, 'Bloqueou pulseira', `${p.codigo} ${p.nome}`, `${p.numero_chip}: ${motivo}${detalhe ? ' (' + detalhe + ')' : ''}`);
  res.json({ ok: true, mensagem: 'Credencial bloqueada. Leituras com ela serão negadas e geram alerta.' });
});

rotas.post('/pulseiras/:id/substituir', async (req, res) => {
  const p = await pulseira(req.params.id);
  if (!['ativa', 'bloqueada'].includes(p.situacao)) falha(400, 'Esta credencial já foi substituída ou desativada.');
  if (p.gv_situacao !== 'ativo') falha(400, 'O guarda-vidas não está ativo.');
  const chip = chipValido(req.body?.numero_chip);
  await chipLivre(chip);
  const tipo = opcao(req.body?.tipo || 'pulseira', 'Tipo', ['pulseira', 'cartao_reserva']);
  const motivo = texto(req.body?.motivo, 'Motivo', { min: 5, max: 200 });
  const { data: hoje } = await agora();
  if (p.situacao === 'ativa') await query("UPDATE pulseiras SET situacao = 'substituida', motivo = $1 WHERE id = $2", [motivo, p.id]);
  // Se havia outra credencial ativa (ex.: cartão reserva), ela também sai de uso.
  await query("UPDATE pulseiras SET situacao = 'substituida', motivo = $1 WHERE guarda_vidas_id = $2 AND situacao = 'ativa'", [`Substituída por ${chip}`, p.guarda_vidas_id]);
  await query("INSERT INTO pulseiras (guarda_vidas_id, numero_chip, tipo, situacao, emitida_em, motivo) VALUES ($1,$2,$3,'ativa',$4,$5)", [p.guarda_vidas_id, chip, tipo, hoje, `Substitui ${p.numero_chip}`]);
  await auditar(req.usuario, 'Substituiu pulseira', `${p.codigo} ${p.nome}`, `${p.numero_chip} → ${chip}. ${motivo}`);
  res.json({ ok: true, mensagem: `Nova credencial ${chip} ativa. A anterior ficou no histórico.` });
});

rotas.post('/pulseiras/:id/desativar', async (req, res) => {
  const p = await pulseira(req.params.id);
  if (p.situacao !== 'ativa') falha(400, 'Só uma credencial ativa pode ser desativada.');
  const motivo = texto(req.body?.motivo, 'Motivo', { min: 5, max: 200 });
  await query("UPDATE pulseiras SET situacao = 'inativa', motivo = $1 WHERE id = $2", [motivo, p.id]);
  await auditar(req.usuario, 'Desativou pulseira', `${p.codigo} ${p.nome}`, `${p.numero_chip}: ${motivo}`);
  res.json({ ok: true, mensagem: 'Credencial desativada.' });
});

// ---------------------------------------------------------------------------------------------
// Escalas (criação e alteração; cada alteração vira uma nova versão)
// ---------------------------------------------------------------------------------------------
rotas.put('/escalas', async (req, res) => {
  const b = req.body || {};
  const u = req.usuario;
  const { data: hoje, ts } = await agora();
  const dia = validarData(b.data);
  if (dia < hoje) falha(400, 'Escalas de dias anteriores fazem parte do histórico e não podem ser alteradas.');
  if (dia > somaDias(hoje, 60)) falha(400, 'Escolha uma data nos próximos 60 dias.');
  const postoId = inteiro(b.posto_id, 'Posto');
  const [posto] = await query('SELECT p.id, p.codigo, p.nome, p.ativo, pr.nome AS praia FROM postos p JOIN praias pr ON pr.id = p.praia_id WHERE p.id = $1', [postoId]);
  if (!posto) falha(404, 'Posto não encontrado.');
  if (!posto.ativo) falha(400, 'Este posto está desativado.');
  if (!Array.isArray(b.itens) || b.itens.length > 20) falha(400, 'A escala precisa ter de 0 a 20 pessoas.');
  const itens = b.itens.map((it) => {
    const ini = validarHora(it.inicio, 'Início'); const fim = validarHora(it.fim, 'Fim');
    if (ini >= fim) falha(400, 'Em cada linha, o início deve ser antes do fim.');
    return { gv: inteiro(it.guarda_vidas_id, 'Guarda-vidas'), funcao: opcao(it.funcao, 'Função', ['Chefe de posto', 'Guarda-vidas']), ini, fim };
  });
  if (new Set(itens.map((i) => i.gv)).size !== itens.length) falha(400, 'A mesma pessoa aparece duas vezes nesta escala.');
  if (itens.filter((i) => i.funcao === 'Chefe de posto').length > 1) falha(400, 'A escala pode ter só um chefe de posto.');
  if (itens.length) {
    const ativos = await query("SELECT id FROM guarda_vidas WHERE id = ANY($1::int[]) AND situacao = 'ativo'", [itens.map((i) => i.gv)]);
    if (ativos.length !== itens.length) falha(400, 'Há pessoas na escala que não estão ativas.');
    // Conflito: a pessoa já está em outro posto no mesmo dia, em horário que se sobrepõe.
    const outros = await query(`SELECT ei.guarda_vidas_id, to_char(ei.inicio, 'HH24:MI') AS inicio, to_char(ei.fim, 'HH24:MI') AS fim, g.codigo, p.nome AS posto, pr.nome AS praia
      FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id JOIN guarda_vidas g ON g.id = ei.guarda_vidas_id JOIN postos p ON p.id = e.posto_id JOIN praias pr ON pr.id = p.praia_id
      WHERE e.data = $1 AND e.posto_id <> $2 AND ei.guarda_vidas_id = ANY($3::int[])
        AND e.versao = (SELECT MAX(versao) FROM escalas e2 WHERE e2.posto_id = e.posto_id AND e2.data = $1)`, [dia, postoId, itens.map((i) => i.gv)]);
    const conflitos = outros.filter((o) => { const i = itens.find((x) => x.gv === o.guarda_vidas_id); return i.ini < o.fim && o.inicio < i.fim; });
    if (conflitos.length) falha(409, 'Conflito de escala: ' + conflitos.map((c) => `${c.codigo} já está em ${c.praia}, ${c.posto} (${c.inicio}–${c.fim})`).join('; ') + '. Tire a pessoa da outra escala primeiro.');
  }
  const [{ v }] = await query('SELECT COALESCE(MAX(versao), 0)::int AS v FROM escalas WHERE posto_id = $1 AND data = $2', [postoId, dia]);
  const justificativa = v > 0 ? texto(b.justificativa, 'Justificativa da alteração', { min: 10 }) : (texto(b.justificativa, 'Justificativa', { opcional: true }) || 'Escala criada');
  const [e] = await query('INSERT INTO escalas (posto_id, data, versao, publicada_em, publicada_por, justificativa) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [postoId, dia, v + 1, ts, u.id, justificativa]);
  for (const i of itens) await query('INSERT INTO escala_itens (escala_id, guarda_vidas_id, funcao, inicio, fim) VALUES ($1,$2,$3,$4,$5)', [e.id, i.gv, i.funcao, i.ini, i.fim]);
  if (v > 0 && dia === hoje) {
    await query("INSERT INTO alertas (chave, tipo, posto_id, titulo, detalhe, criado_em) VALUES ($1,'escala',$2,'Escala alterada',$3,$4) ON CONFLICT (chave) DO NOTHING",
      [`esc:${postoId}:${dia}:${v + 1}`, postoId, `Versão ${v + 1}: ${justificativa}`, ts]);
  }
  await auditar(u, v > 0 ? 'Alterou escala' : 'Criou escala', `${posto.praia}, ${posto.nome} em ${dia}`, `Versão ${v + 1}, ${itens.length} pessoa(s). ${justificativa}`);
  res.json({ ok: true, versao: v + 1, mensagem: v > 0 ? `Escala salva como versão ${v + 1}. A versão anterior ficou no histórico.` : 'Escala criada.' });
});

rotas.post('/escalas/gerar', async (req, res) => {
  const { data: hoje, ts } = await agora();
  const dia = validarData(req.body?.data);
  if (dia < hoje) falha(400, 'Não é possível gerar escala para dias anteriores.');
  if (dia > somaDias(hoje, 60)) falha(400, 'Escolha uma data nos próximos 60 dias.');
  const n = await escalasDaLotacao(dia, ts, req.usuario.id, 'Gerada a partir do posto base');
  await auditar(req.usuario, 'Gerou escalas', dia, `${n} posto(s) a partir do posto base`);
  res.json({ ok: true, mensagem: n ? `${n} escala(s) gerada(s) a partir do posto base.` : 'Todos os postos ativos já têm escala neste dia.' });
});

// ---------------------------------------------------------------------------------------------
// Auditoria e demonstração
// ---------------------------------------------------------------------------------------------
rotas.get('/auditoria', async (req, res) => {
  const { data: hoje } = await agora();
  const de = req.query.de ? validarData(req.query.de) : somaDias(hoje, -6);
  const ate = req.query.ate ? validarData(req.query.ate) : hoje;
  const busca = req.query.busca ? '%' + String(req.query.busca).trim().slice(0, 60) + '%' : null;
  const linhas = await query(`SELECT id, to_char(criado_em, 'DD/MM/YYYY HH24:MI') AS quando, usuario_nome, acao, objeto, detalhe FROM auditoria
    WHERE criado_em >= $1::date AND criado_em < $2::date + 1 AND ($3::text IS NULL OR usuario_nome ILIKE $3 OR acao ILIKE $3 OR objeto ILIKE $3 OR detalhe ILIKE $3)
    ORDER BY criado_em DESC, id DESC LIMIT 400`, [de, ate, busca]);
  res.json({ de, ate, linhas });
});

rotas.post('/demonstracao/recriar', async (req, res) => {
  await criarDemonstracao();
  req.session = null; // o banco foi recriado: é preciso entrar de novo
  res.json({ ok: true, mensagem: 'Demonstração recriada. O relógio voltou para 10:30. Entre novamente.' });
});

export default rotas;
