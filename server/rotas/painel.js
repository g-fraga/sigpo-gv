// Rotas da operação, usadas pela Administração (todas as regiões) e pela Supervisão (só a própria região).
import { Router } from 'express';
import crypto from 'node:crypto';
import { query } from '../db.js';
import { agora } from '../relogio.js';
import { situacaoDosPostos } from '../regras/presenca.js';
import { exigirPerfil, auditar } from './auth.js';
import { falha, regiaoPermitida, postoNoEscopo, inteiro, texto, opcao, data as validarData, hora as validarHora, somaDias, TIPOS_REGISTRO } from '../regras/validacao.js';

const rotas = Router();
rotas.use(exigirPerfil('admin', 'supervisor'));

// Filtro SQL de região: "$n::text IS NULL" deixa passar tudo quando a região é nula (administração).
const FILTRO_REGIAO = (n) => `($${n}::text IS NULL OR pr.regiao_id = $${n})`;

async function registrarTratativa(alertaId, usuario, situacao, nota) {
  const { ts } = await agora();
  await query('INSERT INTO alerta_tratativas (alerta_id, usuario_id, usuario_nome, situacao, nota, criado_em) VALUES ($1,$2,$3,$4,$5,$6)',
    [alertaId, usuario?.id || null, usuario?.nome || 'Sistema', situacao, nota, ts]);
}

// Cria alertas de pendência e de terminal sem sinal, e resolve sozinho o que já se normalizou.
export async function atualizarAlertas() {
  const { relogio, postos } = await situacaoDosPostos();
  const { ts } = await agora();
  const situacaoDe = new Map();
  for (const p of postos) {
    for (const pe of p.pessoas) {
      situacaoDe.set(pe.id, pe);
      if (pe.chave === 'pendentes') {
        await query(`INSERT INTO alertas (chave, tipo, posto_id, guarda_vidas_id, titulo, detalhe, criado_em)
          VALUES ($1,'pendente',$2,$3,'Confirmação pendente',$4,$5) ON CONFLICT (chave) DO NOTHING`,
        ['pend:' + pe.id + ':' + relogio.data, p.id, pe.id, `Escalado para ${pe.inicio}, sem apresentação registrada.`, ts]);
      }
    }
  }
  const abertos = await query("SELECT id, guarda_vidas_id FROM alertas WHERE tipo = 'pendente' AND situacao IN ('aberto','reconhecido') AND chave LIKE $1", ['pend:%:' + relogio.data]);
  for (const a of abertos) {
    const pe = situacaoDe.get(a.guarda_vidas_id);
    if (pe && ['presentes', 'intervalo', 'transito', 'sairam'].includes(pe.chave)) {
      const nota = `Resolvido automaticamente: registro recebido às ${pe.desde}.`;
      await query("UPDATE alertas SET situacao = 'resolvido', tratado_em = $1, nota = $2 WHERE id = $3", [ts, nota, a.id]);
      await registrarTratativa(a.id, null, 'resolvido', nota);
    }
  }
  const semSinal = await query(`SELECT t.id, t.posto_id, to_char(t.offline_desde, 'HH24:MI') AS desde FROM terminais t JOIN postos p ON p.id = t.posto_id
    WHERE NOT t.online AND p.ativo`);
  for (const t of semSinal) {
    await query(`INSERT INTO alertas (chave, tipo, posto_id, titulo, detalhe, criado_em)
      SELECT $1::text, 'offline', $2::int, 'Terminal sem sinal', $3::text, $4::timestamp
      WHERE NOT EXISTS (SELECT 1 FROM alertas WHERE tipo = 'offline' AND posto_id = $2::int AND situacao IN ('aberto','reconhecido'))
      ON CONFLICT (chave) DO NOTHING`,
    ['off:' + t.id + ':' + relogio.data, t.posto_id, `Sem comunicação desde ${t.desde}. As leituras ficam guardadas no aparelho e são enviadas quando o sinal voltar.`, ts]);
  }
}

// ---------------------------------------------------------------------------------------------
// Opções para os filtros (sempre dentro do escopo do usuário)
// ---------------------------------------------------------------------------------------------
rotas.get('/opcoes', async (req, res) => {
  const regiao = regiaoPermitida(req.usuario, null);
  const { data: hoje, hhmm } = await agora();
  const regioes = await query(`SELECT id, nome FROM regioes WHERE ($1::text IS NULL OR id = $1) ORDER BY CASE id WHEN 'N' THEN 1 WHEN 'L' THEN 2 WHEN 'S' THEN 3 ELSE 4 END`, [regiao]);
  const praias = await query(`SELECT pr.slug, pr.nome, pr.regiao_id FROM praias pr WHERE ${FILTRO_REGIAO(1)} AND EXISTS (SELECT 1 FROM postos p WHERE p.praia_id = pr.id) ORDER BY pr.ordem`, [regiao]);
  const postos = await query(`SELECT p.id, p.codigo, p.nome, p.tipo, p.ativo, pr.nome AS praia, pr.slug, pr.regiao_id FROM postos p JOIN praias pr ON pr.id = p.praia_id
    WHERE ${FILTRO_REGIAO(1)} ORDER BY pr.ordem, p.tipo DESC, p.codigo`, [regiao]);
  // Supervisão: guarda-vidas com posto base na região ou escalados hoje na região.
  const guardaVidas = await query(`SELECT DISTINCT g.id, g.codigo, g.nome, g.situacao FROM guarda_vidas g
    LEFT JOIN postos pb ON pb.id = g.posto_id LEFT JOIN praias prb ON prb.id = pb.praia_id
    WHERE g.situacao = 'ativo' AND ($1::text IS NULL OR prb.regiao_id = $1 OR g.id IN (
      SELECT ei.guarda_vidas_id FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id JOIN postos p ON p.id = e.posto_id JOIN praias pr ON pr.id = p.praia_id
      WHERE e.data = $2 AND pr.regiao_id = $1))
    ORDER BY g.codigo`, [regiao, hoje]);
  res.json({ hoje, agora: hhmm, regiao, regioes, praias, postos, guarda_vidas: guardaVidas });
});

// ---------------------------------------------------------------------------------------------
// Visão geral (administração) e visão da região (supervisão)
// ---------------------------------------------------------------------------------------------
rotas.get('/visao', async (req, res) => {
  const regiao = regiaoPermitida(req.usuario, req.query.regiao);
  await atualizarAlertas();
  const { relogio, postos } = await situacaoDosPostos({ regiao });
  const lista = req.query.praia ? postos.filter((p) => p.slug === req.query.praia) : postos;
  const ids = lista.map((p) => p.id);
  const soma = (campo) => lista.reduce((s, p) => s + (p[campo] || 0), 0);

  const [{ n: gvCadastrados }] = await query(`SELECT COUNT(*)::int AS n FROM guarda_vidas g LEFT JOIN postos p ON p.id = g.posto_id LEFT JOIN praias pr ON pr.id = p.praia_id
    WHERE g.situacao = 'ativo' AND ($1::text IS NULL OR pr.regiao_id = $1)`, [regiao]);
  const alertas = await query(`SELECT a.id, a.tipo, a.titulo, a.detalhe, a.situacao, to_char(a.criado_em, 'HH24:MI') AS hora, p.nome AS posto, pr.nome AS praia, g.codigo AS gv_codigo, g.nome AS gv_nome
    FROM alertas a JOIN postos p ON p.id = a.posto_id JOIN praias pr ON pr.id = p.praia_id LEFT JOIN guarda_vidas g ON g.id = a.guarda_vidas_id
    WHERE a.situacao IN ('aberto','reconhecido') AND a.posto_id = ANY($1::int[]) ORDER BY a.criado_em DESC LIMIT 50`, [ids]);
  const [{ n: revisoes }] = await query("SELECT COUNT(*)::int AS n FROM pedidos_revisao WHERE situacao = 'aberto' AND posto_id = ANY($1::int[])", [ids]);
  const registros = await query(`SELECT r.id, to_char(r.hora_leitura, 'HH24:MI') AS hora, r.tipo, r.origem, r.situacao, r.sincronizado, p.nome AS posto, pr.nome AS praia, g.codigo AS gv_codigo, g.nome AS gv_nome
    FROM registros r JOIN postos p ON p.id = r.posto_id JOIN praias pr ON pr.id = p.praia_id LEFT JOIN guarda_vidas g ON g.id = r.guarda_vidas_id
    WHERE r.hora_leitura >= $1::date AND r.hora_leitura <= $2::timestamp AND r.posto_id = ANY($3::int[]) ORDER BY r.hora_leitura DESC, r.id DESC LIMIT 12`, [relogio.data, (await agora()).ts, ids]);
  const movimentacoes = await query(`SELECT m.id, m.tipo, m.situacao, m.motivo, to_char(m.saida_em, 'HH24:MI') AS saida, to_char(m.chegada_em, 'HH24:MI') AS chegada,
      g.codigo AS gv_codigo, g.nome AS gv_nome, po.nome AS origem, pro.nome AS origem_praia, pd.nome AS destino, prd.nome AS destino_praia
    FROM movimentacoes m JOIN guarda_vidas g ON g.id = m.guarda_vidas_id LEFT JOIN postos po ON po.id = m.origem_id LEFT JOIN praias pro ON pro.id = po.praia_id
    JOIN postos pd ON pd.id = m.destino_id JOIN praias prd ON prd.id = pd.praia_id
    WHERE m.data = $1 AND (m.destino_id = ANY($2::int[]) OR m.origem_id = ANY($2::int[])) ORDER BY m.criada_em DESC`, [relogio.data, ids]);

  const porRegiao = {};
  for (const p of lista) {
    const r = (porRegiao[p.regiao_id] ||= { id: p.regiao_id, nome: p.regiao, postos: 0, escalados: 0, presentes: 0, pendentes: 0, sem_sinal: 0 });
    r.postos++; r.escalados += p.escalados; r.presentes += p.presentes; r.pendentes += p.pendentes; if (p.sem_sinal) r.sem_sinal++;
  }

  res.json({
    relogio, regiao,
    kpis: {
      postos: lista.length, postos_com_pendencia: lista.filter((p) => p.pendentes > 0 || p.sem_sinal).length,
      gv_cadastrados: gvCadastrados, escalados: soma('escalados'), presentes: soma('presentes'), intervalo: soma('intervalo'),
      transito: soma('transito'), pendentes: soma('pendentes'), alertas: alertas.length, revisoes,
    },
    regioes: Object.values(porRegiao), postos: lista, alertas, registros, movimentacoes,
  });
});

// ---------------------------------------------------------------------------------------------
// Registros: consulta, inconsistências, registro manual e correção
// ---------------------------------------------------------------------------------------------
const SQL_REGISTRO = `SELECT r.id, to_char(r.hora_leitura, 'YYYY-MM-DD') AS data, to_char(r.hora_leitura, 'HH24:MI:SS') AS hora,
    to_char(r.hora_recebida, 'DD/MM HH24:MI') AS recebida, r.sincronizado, r.tipo, r.origem, r.situacao, r.transito, r.observacoes, r.justificativa, r.corrige_id,
    ROUND(EXTRACT(EPOCH FROM (r.hora_recebida - r.hora_leitura)) / 60)::int AS atraso_min,
    p.id AS posto_id, p.nome AS posto, pr.nome AS praia, pr.regiao_id, g.id AS gv_id, g.codigo AS gv_codigo, g.nome AS gv_nome, u.nome AS autor,
    EXISTS (SELECT 1 FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id
      WHERE ei.guarda_vidas_id = r.guarda_vidas_id AND e.posto_id = r.posto_id AND e.data = r.hora_leitura::date) AS na_escala
  FROM registros r JOIN postos p ON p.id = r.posto_id JOIN praias pr ON pr.id = p.praia_id
  LEFT JOIN guarda_vidas g ON g.id = r.guarda_vidas_id LEFT JOIN usuarios u ON u.id = r.autor_id`;

async function inconsistenciasDoDia(dia, regiao, filtro) {
  const relogio = await agora();
  const itens = [];
  // 1. Escalados sem apresentação registrada (no dia de hoje, só depois do horário + tolerância).
  const faltas = await query(`SELECT g.id, g.codigo, g.nome, p.id AS posto_id, p.nome AS posto, pr.nome AS praia, to_char(ei.inicio, 'HH24:MI') AS inicio
    FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id JOIN postos p ON p.id = e.posto_id JOIN praias pr ON pr.id = p.praia_id JOIN guarda_vidas g ON g.id = ei.guarda_vidas_id
    WHERE e.data = $1 AND e.versao = (SELECT MAX(versao) FROM escalas e2 WHERE e2.posto_id = e.posto_id AND e2.data = $1) AND ${FILTRO_REGIAO(2)}
      AND NOT EXISTS (SELECT 1 FROM registros r WHERE r.guarda_vidas_id = g.id AND r.tipo = 'apresentacao' AND r.situacao = 'valido' AND r.sincronizado
        AND r.hora_leitura >= $1::date AND r.hora_leitura < $1::date + 1 AND r.hora_leitura <= $3::timestamp)
    ORDER BY pr.ordem, p.codigo`, [dia, regiao, relogio.ts]);
  for (const f of faltas) {
    const [h, m] = f.inicio.split(':').map(Number);
    if (dia === relogio.data && relogio.minutos < h * 60 + m + 10) continue;
    itens.push({ tipo: 'sem_apresentacao', titulo: 'Escalado sem apresentação', gv: `${f.codigo} ${f.nome}`, posto: `${f.praia}, ${f.posto}`, posto_id: f.posto_id, detalhe: `Turno a partir de ${f.inicio}.` });
  }
  // 2. Leituras ainda guardadas no terminal sem sinal.
  const fila = await query(`SELECT g.codigo, g.nome, p.id AS posto_id, p.nome AS posto, pr.nome AS praia, to_char(r.hora_leitura, 'HH24:MI') AS hora FROM registros r
    JOIN postos p ON p.id = r.posto_id JOIN praias pr ON pr.id = p.praia_id LEFT JOIN guarda_vidas g ON g.id = r.guarda_vidas_id
    WHERE NOT r.sincronizado AND r.hora_leitura >= $1::date AND r.hora_leitura < $1::date + 1 AND ${FILTRO_REGIAO(2)}`, [dia, regiao]);
  for (const f of fila) itens.push({ tipo: 'nao_sincronizado', titulo: 'Leitura aguardando sincronização', gv: `${f.codigo} ${f.nome}`, posto: `${f.praia}, ${f.posto}`, posto_id: f.posto_id, detalhe: `Lida às ${f.hora}; o terminal está sem sinal.` });
  // 3. Leituras negadas (pulseira bloqueada, não cadastrada ou pessoa inativa).
  const negadas = await query(`SELECT g.codigo, g.nome, p.id AS posto_id, p.nome AS posto, pr.nome AS praia, to_char(r.hora_leitura, 'HH24:MI') AS hora, r.observacoes FROM registros r
    JOIN postos p ON p.id = r.posto_id JOIN praias pr ON pr.id = p.praia_id LEFT JOIN guarda_vidas g ON g.id = r.guarda_vidas_id
    WHERE r.situacao = 'negado' AND r.hora_leitura >= $1::date AND r.hora_leitura < $1::date + 1 AND ${FILTRO_REGIAO(2)}`, [dia, regiao]);
  for (const f of negadas) itens.push({ tipo: 'negada', titulo: 'Leitura negada', gv: f.codigo ? `${f.codigo} ${f.nome}` : 'Pulseira desconhecida', posto: `${f.praia}, ${f.posto}`, posto_id: f.posto_id, detalhe: `${f.hora}: ${f.observacoes || ''}` });
  // 4. Intervalo sem retorno há mais de 60 minutos (só hoje).
  if (dia === relogio.data) {
    const { postos } = await situacaoDosPostos({ regiao });
    for (const p of postos) for (const pe of p.pessoas) {
      if (pe.chave !== 'intervalo') continue;
      const [h, m] = pe.desde.split(':').map(Number);
      if (relogio.minutos - (h * 60 + m) > 60) itens.push({ tipo: 'intervalo_longo', titulo: 'Intervalo sem retorno há mais de 1 hora', gv: `${pe.codigo} ${pe.nome}`, posto: `${p.praia}, ${p.nome}`, posto_id: p.id, detalhe: `Em intervalo desde ${pe.desde}.` });
    }
  }
  return filtro.posto ? itens.filter((i) => i.posto_id === filtro.posto) : itens;
}

rotas.get('/registros', async (req, res) => {
  const regiao = regiaoPermitida(req.usuario, req.query.regiao);
  const relogio = await agora();
  const de = req.query.de ? validarData(req.query.de, 'Data inicial') : relogio.data;
  const ate = req.query.ate ? validarData(req.query.ate, 'Data final') : de;
  if (ate < de) falha(400, 'A data final deve ser igual ou posterior à inicial.');
  if (somaDias(de, 31) < ate) falha(400, 'Escolha um período de até 31 dias.');
  const posto = req.query.posto ? inteiro(req.query.posto, 'Posto') : null;
  const busca = req.query.gv ? '%' + String(req.query.gv).trim().slice(0, 60) + '%' : null;
  const tipo = req.query.tipo && [...TIPOS_REGISTRO, 'negada'].includes(req.query.tipo) ? req.query.tipo : null;
  const origem = req.query.origem && ['nfc', 'manual', 'correcao'].includes(req.query.origem) ? req.query.origem : null;
  const registros = await query(`${SQL_REGISTRO}
    WHERE r.hora_leitura >= $1::date AND r.hora_leitura < $2::date + 1 AND r.hora_leitura <= $9::timestamp AND ${FILTRO_REGIAO(3)}
      AND ($4::text IS NULL OR pr.slug = $4) AND ($5::int IS NULL OR p.id = $5) AND ($6::text IS NULL OR g.codigo ILIKE $6 OR g.nome ILIKE $6)
      AND ($7::text IS NULL OR r.tipo = $7) AND ($8::text IS NULL OR r.origem = $8)
    ORDER BY r.hora_leitura DESC, r.id DESC LIMIT 400`, [de, ate, regiao, req.query.praia || null, posto, busca, tipo, origem, relogio.ts]);
  const movimentacoes = await query(`SELECT m.id, to_char(m.data, 'YYYY-MM-DD') AS data, m.tipo, m.situacao, m.motivo, to_char(m.saida_em, 'HH24:MI') AS saida, to_char(m.chegada_em, 'HH24:MI') AS chegada,
      g.codigo AS gv_codigo, g.nome AS gv_nome, po.nome AS origem, pro.nome AS origem_praia, pd.nome AS destino, prd.nome AS destino_praia, u.nome AS criada_por
    FROM movimentacoes m JOIN guarda_vidas g ON g.id = m.guarda_vidas_id LEFT JOIN postos po ON po.id = m.origem_id LEFT JOIN praias pro ON pro.id = po.praia_id
    JOIN postos pd ON pd.id = m.destino_id JOIN praias prd ON prd.id = pd.praia_id LEFT JOIN usuarios u ON u.id = m.criada_por
    WHERE m.data BETWEEN $1 AND $2 AND ($3::text IS NULL OR prd.regiao_id = $3 OR pro.regiao_id = $3) ORDER BY m.data DESC, m.criada_em DESC`, [de, ate, regiao]);
  const inconsistencias = de === ate ? await inconsistenciasDoDia(de, regiao, { posto }) : [];
  res.json({ de, ate, hoje: relogio.data, agora: relogio.hhmm, registros, movimentacoes, inconsistencias });
});

rotas.post('/registros/manual', async (req, res) => {
  const u = req.usuario; const b = req.body || {};
  const relogio = await agora();
  const posto = await postoNoEscopo(u, b.posto_id);
  if (!posto.ativo) falha(400, 'Este posto está desativado.');
  const gvId = inteiro(b.guarda_vidas_id, 'Guarda-vidas');
  const [gv] = await query("SELECT id, codigo, nome, situacao FROM guarda_vidas WHERE id = $1", [gvId]);
  if (!gv) falha(404, 'Guarda-vidas não encontrado.');
  if (gv.situacao !== 'ativo') falha(400, 'Este guarda-vidas não está ativo.');
  const tipo = opcao(b.tipo, 'Tipo de registro', TIPOS_REGISTRO);
  const dia = b.data ? validarData(b.data) : relogio.data;
  if (dia > relogio.data || dia < somaDias(relogio.data, -7)) falha(400, 'O registro manual vale para hoje ou para os últimos 7 dias.');
  const h = validarHora(b.hora);
  if (dia === relogio.data && h > relogio.hhmm) falha(400, `O horário não pode ser posterior ao horário atual (${relogio.hhmm}).`);
  const justificativa = texto(b.justificativa, 'Justificativa', { min: 10 });
  const observacoes = texto(b.observacoes, 'Observações', { opcional: true });
  if (u.perfil === 'supervisor') {
    // A supervisão só lança registro de quem está na escala ou tem posto base na sua região.
    const [ok] = await query(`SELECT 1 FROM guarda_vidas g LEFT JOIN postos pb ON pb.id = g.posto_id LEFT JOIN praias prb ON prb.id = pb.praia_id
      WHERE g.id = $1 AND (prb.regiao_id = $2 OR EXISTS (SELECT 1 FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id JOIN postos p ON p.id = e.posto_id JOIN praias pr ON pr.id = p.praia_id
        WHERE ei.guarda_vidas_id = g.id AND e.data = $3 AND pr.regiao_id = $2))`, [gvId, u.regiao_id, dia]);
    if (!ok) falha(403, 'Este guarda-vidas não está escalado nem lotado na sua região.');
  }
  const [r] = await query(`INSERT INTO registros (codigo_unico, tipo, guarda_vidas_id, posto_id, hora_leitura, hora_recebida, origem, situacao, observacoes, justificativa, autor_id)
    VALUES ($1,$2,$3,$4,$5,$6,'manual','valido',$7,$8,$9) RETURNING id`, [crypto.randomUUID(), tipo, gvId, posto.id, `${dia} ${h}:00`, relogio.ts, observacoes, justificativa, u.id]);
  await auditar(u, 'Registro manual', `${posto.praia}, ${posto.nome}`, `${gv.codigo} ${gv.nome}: ${tipo} às ${h} de ${dia}. ${justificativa}`);
  res.status(201).json({ ok: true, id: r.id, mensagem: 'Registro manual salvo.' });
});

// Corrige um registro: cria um novo registro (origem "correcao") e marca o antigo como corrigido. Nada é apagado.
export async function corrigirRegistro(u, registroId, novo, justificativa) {
  const [orig] = await query(`SELECT r.*, to_char(r.hora_leitura, 'YYYY-MM-DD') AS dia, to_char(r.hora_leitura, 'HH24:MI') AS hhmm, pr.regiao_id
    FROM registros r JOIN postos p ON p.id = r.posto_id JOIN praias pr ON pr.id = p.praia_id WHERE r.id = $1`, [registroId]);
  if (!orig) falha(404, 'Registro não encontrado.');
  if (u.perfil === 'supervisor' && orig.regiao_id !== u.regiao_id) falha(403, 'Este registro não pertence à sua região.');
  if (orig.situacao !== 'valido') falha(400, 'Só é possível corrigir um registro válido (este já foi corrigido ou não foi aceito).');
  const tipo = novo.tipo ? opcao(novo.tipo, 'Tipo de registro', TIPOS_REGISTRO) : orig.tipo;
  const h = novo.hora ? validarHora(novo.hora) : orig.hhmm;
  const postoId = novo.posto_id ? (await postoNoEscopo(u, novo.posto_id)).id : orig.posto_id;
  const { ts } = await agora();
  const [r] = await query(`INSERT INTO registros (codigo_unico, tipo, guarda_vidas_id, pulseira_id, terminal_id, posto_id, hora_leitura, hora_recebida, origem, situacao, justificativa, autor_id, corrige_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'correcao','valido',$9,$10,$11) RETURNING id`,
  [crypto.randomUUID(), tipo, orig.guarda_vidas_id, orig.pulseira_id, orig.terminal_id, postoId, `${orig.dia} ${h}:00`, ts, justificativa, u.id, orig.id]);
  await query("UPDATE registros SET situacao = 'corrigido' WHERE id = $1", [orig.id]);
  await auditar(u, 'Corrigiu registro', `Registro nº ${orig.id}`, `${orig.tipo} ${orig.hhmm} → ${tipo} ${h}. ${justificativa}`);
  return r.id;
}

rotas.post('/registros/:id/correcao', async (req, res) => {
  const b = req.body || {};
  const justificativa = texto(b.justificativa, 'Justificativa', { min: 10 });
  const id = await corrigirRegistro(req.usuario, inteiro(req.params.id, 'Registro'), { tipo: b.tipo, hora: b.hora, posto_id: b.posto_id }, justificativa);
  res.status(201).json({ ok: true, id, mensagem: 'Correção salva. O registro original foi mantido no histórico.' });
});

// ---------------------------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------------------------
const SITUACOES_ALERTA = ['aberto', 'reconhecido', 'resolvido', 'descartado'];

async function alertaNoEscopo(u, id) {
  const [a] = await query(`SELECT a.id, a.tipo, a.titulo, a.detalhe, a.situacao, a.nota, to_char(a.criado_em, 'DD/MM HH24:MI') AS criado, to_char(a.tratado_em, 'DD/MM HH24:MI') AS tratado,
      p.nome AS posto, pr.nome AS praia, pr.regiao_id, g.codigo AS gv_codigo, g.nome AS gv_nome, ut.nome AS tratado_por
    FROM alertas a JOIN postos p ON p.id = a.posto_id JOIN praias pr ON pr.id = p.praia_id LEFT JOIN guarda_vidas g ON g.id = a.guarda_vidas_id LEFT JOIN usuarios ut ON ut.id = a.tratado_por
    WHERE a.id = $1`, [id]);
  if (!a) falha(404, 'Alerta não encontrado.');
  if (u.perfil === 'supervisor' && a.regiao_id !== u.regiao_id) falha(403, 'Este alerta não pertence à sua região.');
  return a;
}

rotas.get('/alertas', async (req, res) => {
  const regiao = regiaoPermitida(req.usuario, req.query.regiao);
  await atualizarAlertas();
  const { data: hoje } = await agora();
  const situacao = req.query.situacao || 'abertos';
  const de = req.query.de ? validarData(req.query.de) : somaDias(hoje, -6);
  const filtroSituacao = situacao === 'abertos' ? ['aberto', 'reconhecido'] : situacao === 'todos' ? SITUACOES_ALERTA : [opcao(situacao, 'Situação', SITUACOES_ALERTA)];
  const alertas = await query(`SELECT a.id, a.tipo, a.titulo, a.detalhe, a.situacao, to_char(a.criado_em, 'YYYY-MM-DD') AS data, to_char(a.criado_em, 'HH24:MI') AS hora,
      p.nome AS posto, pr.nome AS praia, pr.regiao_id, g.codigo AS gv_codigo, g.nome AS gv_nome,
      (SELECT COUNT(*)::int FROM alerta_tratativas t WHERE t.alerta_id = a.id) AS tratativas
    FROM alertas a JOIN postos p ON p.id = a.posto_id JOIN praias pr ON pr.id = p.praia_id LEFT JOIN guarda_vidas g ON g.id = a.guarda_vidas_id
    WHERE a.situacao = ANY($1::text[]) AND a.criado_em >= $2::date AND ${FILTRO_REGIAO(3)} AND ($4::text IS NULL OR a.tipo = $4)
    ORDER BY a.criado_em DESC LIMIT 300`, [filtroSituacao, de, regiao, req.query.tipo || null]);
  res.json({ alertas, de });
});

rotas.get('/alertas/:id', async (req, res) => {
  const a = await alertaNoEscopo(req.usuario, inteiro(req.params.id, 'Alerta'));
  const tratativas = await query("SELECT usuario_nome, situacao, nota, to_char(criado_em, 'DD/MM HH24:MI') AS quando FROM alerta_tratativas WHERE alerta_id = $1 ORDER BY criado_em, id", [a.id]);
  res.json({ ...a, tratativas });
});

rotas.post('/alertas/:id/tratativa', async (req, res) => {
  const u = req.usuario; const b = req.body || {};
  const a = await alertaNoEscopo(u, inteiro(req.params.id, 'Alerta'));
  const situacao = opcao(b.situacao, 'Situação', SITUACOES_ALERTA);
  const nota = texto(b.nota, 'Providência', { min: 5 });
  if (['resolvido', 'descartado'].includes(a.situacao) && situacao !== 'aberto') falha(400, 'Este alerta já foi encerrado. Para registrar algo novo, reabra o alerta.');
  const { ts } = await agora();
  await query('UPDATE alertas SET situacao = $1, nota = $2, tratado_por = $3, tratado_em = $4 WHERE id = $5', [situacao, nota, u.id, ts, a.id]);
  await registrarTratativa(a.id, u, situacao, nota);
  await auditar(u, 'Tratou alerta', `${a.titulo}: ${a.praia}, ${a.posto}`, `${situacao}. ${nota}`);
  res.json({ ok: true, mensagem: 'Providência registrada.' });
});

// ---------------------------------------------------------------------------------------------
// Pedidos de revisão (feitos pelos guarda-vidas)
// ---------------------------------------------------------------------------------------------
export const MOTIVOS_REVISAO = { horario: 'Horário incorreto', tipo: 'Tipo de registro incorreto', posto: 'Posto incorreto', nao_reconhece: 'Não reconheço o registro', ausente: 'Registro ausente', outro: 'Outro motivo' };

rotas.get('/revisoes', async (req, res) => {
  const regiao = regiaoPermitida(req.usuario, req.query.regiao);
  const situacao = req.query.situacao === 'todos' ? null : (req.query.situacao || 'aberto');
  const pedidos = await query(`SELECT pe.id, pe.motivo, pe.texto, pe.situacao, pe.resposta, to_char(pe.data_referencia, 'YYYY-MM-DD') AS data_referencia, to_char(pe.hora_informada, 'HH24:MI') AS hora_informada,
      to_char(pe.criado_em, 'DD/MM HH24:MI') AS criado, to_char(pe.respondido_em, 'DD/MM HH24:MI') AS respondido, ur.nome AS respondido_por,
      g.codigo AS gv_codigo, g.nome AS gv_nome, p.nome AS posto, pr.nome AS praia,
      r.id AS registro_id, r.tipo AS registro_tipo, to_char(r.hora_leitura, 'HH24:MI') AS registro_hora, r.situacao AS registro_situacao, r.origem AS registro_origem
    FROM pedidos_revisao pe JOIN guarda_vidas g ON g.id = pe.guarda_vidas_id JOIN postos p ON p.id = pe.posto_id JOIN praias pr ON pr.id = p.praia_id
    LEFT JOIN registros r ON r.id = pe.registro_id LEFT JOIN usuarios ur ON ur.id = pe.respondido_por
    WHERE ${FILTRO_REGIAO(1)} AND ($2::text IS NULL OR pe.situacao = $2) ORDER BY pe.criado_em DESC LIMIT 200`, [regiao, situacao]);
  res.json({ pedidos: pedidos.map((p) => ({ ...p, motivo_texto: MOTIVOS_REVISAO[p.motivo] })) });
});

rotas.post('/revisoes/:id/resposta', async (req, res) => {
  const u = req.usuario; const b = req.body || {};
  const [pe] = await query(`SELECT pe.*, to_char(pe.data_referencia, 'YYYY-MM-DD') AS dia, to_char(pe.hora_informada, 'HH24:MI') AS hhmm, pr.regiao_id, g.codigo, g.nome
    FROM pedidos_revisao pe JOIN postos p ON p.id = pe.posto_id JOIN praias pr ON pr.id = p.praia_id JOIN guarda_vidas g ON g.id = pe.guarda_vidas_id WHERE pe.id = $1`, [inteiro(req.params.id, 'Pedido')]);
  if (!pe) falha(404, 'Pedido não encontrado.');
  if (u.perfil === 'supervisor' && pe.regiao_id !== u.regiao_id) falha(403, 'Este pedido não pertence à sua região.');
  if (pe.situacao !== 'aberto') falha(400, 'Este pedido já foi respondido.');
  const decisao = opcao(b.decisao, 'Decisão', ['aceito', 'recusado']);
  const resposta = texto(b.resposta, 'Resposta', { min: 10 });
  let correcaoId = null;
  if (decisao === 'aceito') {
    const just = `Pedido de revisão nº ${pe.id} aceito: ${resposta}`;
    if (pe.registro_id) {
      if (!b.hora && !b.tipo && !pe.hhmm) falha(400, 'Informe o horário ou o tipo correto para corrigir o registro.');
      correcaoId = await corrigirRegistro(u, pe.registro_id, { hora: b.hora || pe.hhmm, tipo: b.tipo }, just);
    } else {
      const h = validarHora(b.hora || pe.hhmm);
      const tipo = b.tipo ? opcao(b.tipo, 'Tipo', TIPOS_REGISTRO) : 'apresentacao';
      const { ts } = await agora();
      const [r] = await query(`INSERT INTO registros (codigo_unico, tipo, guarda_vidas_id, posto_id, hora_leitura, hora_recebida, origem, situacao, justificativa, autor_id)
        VALUES ($1,$2,$3,$4,$5,$6,'manual','valido',$7,$8) RETURNING id`, [crypto.randomUUID(), tipo, pe.guarda_vidas_id, pe.posto_id, `${pe.dia} ${h}:00`, ts, just, u.id]);
      correcaoId = r.id;
    }
  }
  const { ts } = await agora();
  await query('UPDATE pedidos_revisao SET situacao = $1, resposta = $2, respondido_por = $3, respondido_em = $4, correcao_id = $5 WHERE id = $6', [decisao, resposta, u.id, ts, correcaoId, pe.id]);
  await auditar(u, decisao === 'aceito' ? 'Aceitou pedido de revisão' : 'Recusou pedido de revisão', `Pedido nº ${pe.id} (${pe.codigo} ${pe.nome})`, resposta);
  res.json({ ok: true, mensagem: decisao === 'aceito' ? 'Pedido aceito. O registro foi corrigido e o original ficou no histórico.' : 'Pedido recusado. O guarda-vidas verá a resposta.' });
});

// ---------------------------------------------------------------------------------------------
// Escalas (consulta). A edição é exclusiva da administração (rotas/admin.js).
// ---------------------------------------------------------------------------------------------
rotas.get('/escalas', async (req, res) => {
  const regiao = regiaoPermitida(req.usuario, req.query.regiao);
  const { data: hoje } = await agora();
  const dia = req.query.data ? validarData(req.query.data) : hoje;
  const posto = req.query.posto ? inteiro(req.query.posto, 'Posto') : null;
  const postos = await query(`SELECT p.id, p.codigo, p.nome, p.tipo, p.previsto, p.ativo, pr.nome AS praia, pr.slug, pr.regiao_id, r.nome AS regiao FROM postos p
    JOIN praias pr ON pr.id = p.praia_id JOIN regioes r ON r.id = pr.regiao_id
    WHERE p.ativo AND ${FILTRO_REGIAO(1)} AND ($2::text IS NULL OR pr.slug = $2) AND ($3::int IS NULL OR p.id = $3) ORDER BY pr.ordem, p.tipo DESC, p.codigo`, [regiao, req.query.praia || null, posto]);
  const ids = postos.map((p) => p.id);
  const versoes = await query(`SELECT e.id, e.posto_id, e.versao, to_char(e.publicada_em, 'DD/MM HH24:MI') AS publicada_em, e.justificativa, u.nome AS publicada_por
    FROM escalas e LEFT JOIN usuarios u ON u.id = e.publicada_por WHERE e.data = $1 AND e.posto_id = ANY($2::int[]) ORDER BY e.posto_id, e.versao`, [dia, ids]);
  const itens = await query(`SELECT ei.escala_id, ei.guarda_vidas_id, g.codigo, g.nome, g.vinculo, ei.funcao, to_char(ei.inicio, 'HH24:MI') AS inicio, to_char(ei.fim, 'HH24:MI') AS fim
    FROM escala_itens ei JOIN guarda_vidas g ON g.id = ei.guarda_vidas_id WHERE ei.escala_id = ANY($1::int[]) ORDER BY ei.escala_id, ei.id`, [versoes.map((v) => v.id)]);
  for (const v of versoes) v.itens = itens.filter((i) => i.escala_id === v.id);
  const lista = postos.map((p) => {
    const vs = versoes.filter((v) => v.posto_id === p.id);
    return { ...p, versoes: vs, vigente: vs[vs.length - 1] || null };
  });
  // Conflitos: a mesma pessoa em dois postos com horários que se sobrepõem (em toda a cidade, não só no filtro).
  const conflitos = await query(`WITH vig AS (
      SELECT e.posto_id, ei.guarda_vidas_id, ei.inicio, ei.fim FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id
      WHERE e.data = $1 AND e.versao = (SELECT MAX(versao) FROM escalas e2 WHERE e2.posto_id = e.posto_id AND e2.data = $1))
    SELECT DISTINCT g.codigo, g.nome, pa.nome AS posto_a, pra.nome AS praia_a, pb.nome AS posto_b, prb.nome AS praia_b
    FROM vig a JOIN vig b ON a.guarda_vidas_id = b.guarda_vidas_id AND a.posto_id < b.posto_id AND a.inicio < b.fim AND b.inicio < a.fim
    JOIN guarda_vidas g ON g.id = a.guarda_vidas_id JOIN postos pa ON pa.id = a.posto_id JOIN praias pra ON pra.id = pa.praia_id
    JOIN postos pb ON pb.id = b.posto_id JOIN praias prb ON prb.id = pb.praia_id
    WHERE ($2::text IS NULL OR pra.regiao_id = $2 OR prb.regiao_id = $2)`, [dia, regiao]);
  // Sem alocação: guarda-vidas ativos que não aparecem em nenhuma escala vigente do dia.
  const semAlocacao = await query(`SELECT g.id, g.codigo, g.nome, g.vinculo, pb.nome AS posto_base, prb.nome AS praia_base FROM guarda_vidas g
    LEFT JOIN postos pb ON pb.id = g.posto_id LEFT JOIN praias prb ON prb.id = pb.praia_id
    WHERE g.situacao = 'ativo' AND ($2::text IS NULL OR prb.regiao_id = $2)
      AND NOT EXISTS (SELECT 1 FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id WHERE ei.guarda_vidas_id = g.id AND e.data = $1
        AND e.versao = (SELECT MAX(versao) FROM escalas e2 WHERE e2.posto_id = e.posto_id AND e2.data = $1))
    ORDER BY g.codigo`, [dia, regiao]);
  res.json({ data: dia, hoje, editavel: req.usuario.perfil === 'admin' && dia >= hoje, postos: lista, conflitos, sem_alocacao: semAlocacao });
});

// ---------------------------------------------------------------------------------------------
// Terminal simulado (substitui o leitor NFC físico nesta demonstração)
// ---------------------------------------------------------------------------------------------
rotas.get('/terminais', async (req, res) => {
  const regiao = regiaoPermitida(req.usuario, req.query.regiao);
  const { data: hoje } = await agora();
  const terminais = await query(`SELECT t.id, t.codigo, t.online, to_char(t.offline_desde, 'HH24:MI') AS offline_desde, p.id AS posto_id, p.nome AS posto, pr.nome AS praia, pr.regiao_id,
      (SELECT COUNT(*)::int FROM registros r WHERE r.terminal_id = t.id AND NOT r.sincronizado) AS fila
    FROM terminais t JOIN postos p ON p.id = t.posto_id JOIN praias pr ON pr.id = p.praia_id
    WHERE p.ativo AND p.tipo = 'guarita' AND ${FILTRO_REGIAO(1)} ORDER BY pr.ordem, p.codigo`, [regiao]);
  const id = req.query.terminal ? inteiro(req.query.terminal, 'Terminal') : terminais[0]?.id;
  const t = terminais.find((x) => x.id === id);
  let pulseiras = []; let ultimas = [];
  if (t) {
    pulseiras = await query(`SELECT g.codigo, g.nome, pu.numero_chip, pu.tipo FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id
      JOIN guarda_vidas g ON g.id = ei.guarda_vidas_id LEFT JOIN pulseiras pu ON pu.guarda_vidas_id = g.id AND pu.situacao = 'ativa'
      WHERE e.posto_id = $1 AND e.data = $2 AND e.versao = (SELECT MAX(versao) FROM escalas e2 WHERE e2.posto_id = $1 AND e2.data = $2) ORDER BY ei.id`, [t.posto_id, hoje]);
    ultimas = await query(`SELECT to_char(r.hora_leitura, 'HH24:MI:SS') AS hora, r.tipo, r.situacao, r.sincronizado, r.observacoes, g.codigo, g.nome FROM registros r
      LEFT JOIN guarda_vidas g ON g.id = r.guarda_vidas_id WHERE r.terminal_id = $1 AND r.hora_leitura >= $2::date ORDER BY r.hora_leitura DESC, r.id DESC LIMIT 8`, [t.id, hoje]);
  }
  res.json({ terminais, terminal: t || null, pulseiras, ultimas });
});

async function terminalNoEscopo(u, id) {
  const [t] = await query(`SELECT t.*, p.nome AS posto, pr.nome AS praia, pr.regiao_id FROM terminais t JOIN postos p ON p.id = t.posto_id JOIN praias pr ON pr.id = p.praia_id WHERE t.id = $1`, [id]);
  if (!t) falha(404, 'Terminal não encontrado.');
  if (u.perfil === 'supervisor' && t.regiao_id !== u.regiao_id) falha(403, 'Este terminal não pertence à sua região.');
  return t;
}

// Leitura de pulseira. Num terminal real, a mesma rota recebe as leituras do aparelho (com chave do aparelho).
rotas.post('/leituras', async (req, res) => {
  const u = req.usuario; const b = req.body || {};
  const t = await terminalNoEscopo(u, inteiro(b.terminal_id, 'Terminal'));
  const tipo = opcao(b.tipo, 'Tipo de leitura', TIPOS_REGISTRO);
  const chip = String(b.chip || '').trim().toUpperCase();
  if (!/^[0-9A-F:]{8,26}$/.test(chip)) falha(400, 'Código da pulseira inválido.');
  const codigoUnico = /^[0-9a-f-]{36}$/i.test(b.codigo_unico || '') ? b.codigo_unico : crypto.randomUUID();
  const [repetido] = await query('SELECT id, situacao FROM registros WHERE codigo_unico = $1', [codigoUnico]);
  if (repetido) return res.json({ resultado: 'repetida', mensagem: 'Esta leitura já tinha sido recebida (reenvio ignorado).' });

  const { ts, hhmm } = await agora();
  const [pu] = await query(`SELECT pu.id, pu.situacao, pu.motivo, g.id AS gv_id, g.codigo, g.nome, g.situacao AS gv_situacao FROM pulseiras pu JOIN guarda_vidas g ON g.id = pu.guarda_vidas_id WHERE pu.numero_chip = $1`, [chip]);
  let situacao = 'valido'; let obs = `Leitura simulada por ${u.nome}`; let resultado = 'aceita';
  if (!pu) { situacao = 'negado'; obs = 'Pulseira não cadastrada'; resultado = 'negada'; }
  else if (pu.situacao !== 'ativa') { situacao = 'negado'; obs = `Pulseira ${pu.situacao}${pu.motivo ? ' (' + pu.motivo + ')' : ''}`; resultado = 'negada'; }
  else if (pu.gv_situacao !== 'ativo') { situacao = 'negado'; obs = `Guarda-vidas ${pu.gv_situacao}`; resultado = 'negada'; }
  else {
    // Repique: a mesma pessoa no mesmo terminal em menos de 1 minuto conta uma vez só.
    const [rep] = await query(`SELECT id FROM registros WHERE guarda_vidas_id = $1 AND terminal_id = $2 AND situacao = 'valido' AND hora_leitura > $3::timestamp - interval '1 minute'`, [pu.gv_id, t.id, ts]);
    if (rep) { situacao = 'repique'; obs = 'Leitura repetida em menos de 1 minuto'; resultado = 'repique'; }
  }
  const guardada = !t.online;
  await query(`INSERT INTO registros (codigo_unico, tipo, guarda_vidas_id, pulseira_id, terminal_id, posto_id, hora_leitura, hora_recebida, sincronizado, origem, situacao, observacoes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'nfc',$10,$11)`, [codigoUnico, situacao === 'negado' ? 'negada' : tipo, pu?.gv_id || null, pu?.id || null, t.id, t.posto_id, ts, guardada ? null : ts, !guardada, situacao, obs]);
  if (!guardada) await query('UPDATE terminais SET ultima_comunicacao = $1 WHERE id = $2', [ts, t.id]);
  if (resultado === 'negada' && pu) {
    await query(`INSERT INTO alertas (chave, tipo, posto_id, guarda_vidas_id, titulo, detalhe, criado_em) VALUES ($1,'pulseira',$2,$3,'Leitura de pulseira negada',$4,$5) ON CONFLICT (chave) DO NOTHING`,
      ['neg:' + pu.id + ':' + ts, t.posto_id, pu.gv_id, `${obs}. Lida às ${hhmm} em ${t.praia}, ${t.posto}.`, ts]);
  }
  const nomes = { aceita: 'Leitura aceita', repique: 'Leitura repetida: contada uma vez só', negada: 'Leitura negada' };
  res.status(201).json({
    resultado: guardada && resultado !== 'negada' ? 'guardada' : resultado,
    mensagem: guardada ? `${nomes[resultado]}. Terminal sem sinal: a leitura ficou guardada no aparelho e será enviada quando o sinal voltar.` : `${nomes[resultado]}${resultado === 'negada' ? ': ' + obs : ''}.`,
    gv: pu ? { codigo: pu.codigo, nome: pu.nome } : null, hora: hhmm,
  });
});

rotas.post('/terminais/:id/sinal', async (req, res) => {
  const u = req.usuario;
  const t = await terminalNoEscopo(u, inteiro(req.params.id, 'Terminal'));
  const online = req.body?.online === true;
  const { ts, data: hoje } = await agora();
  if (online === t.online) return res.json({ ok: true, mensagem: online ? 'O terminal já estava com sinal.' : 'O terminal já estava sem sinal.' });
  if (online) {
    const enviados = await query('UPDATE registros SET sincronizado = TRUE, hora_recebida = $1 WHERE terminal_id = $2 AND NOT sincronizado RETURNING id', [ts, t.id]);
    await query('UPDATE terminais SET online = TRUE, offline_desde = NULL, ultima_comunicacao = $1 WHERE id = $2', [ts, t.id]);
    const abertos = await query("SELECT id FROM alertas WHERE tipo = 'offline' AND posto_id = $1 AND situacao IN ('aberto','reconhecido')", [t.posto_id]);
    for (const a of abertos) {
      const qtd = enviados.length === 1 ? '1 leitura sincronizada' : `${enviados.length} leituras sincronizadas`;
      const nota = `Sinal restabelecido; ${qtd}.`;
      await query("UPDATE alertas SET situacao = 'resolvido', tratado_por = $1, tratado_em = $2, nota = $3 WHERE id = $4", [u.id, ts, nota, a.id]);
      await registrarTratativa(a.id, u, 'resolvido', nota);
    }
    await auditar(u, 'Restabeleceu sinal do terminal', `${t.codigo} (${t.praia}, ${t.posto})`, enviados.length === 1 ? '1 leitura sincronizada' : `${enviados.length} leituras sincronizadas`);
    return res.json({ ok: true, mensagem: enviados.length === 1 ? 'Sinal restabelecido. 1 leitura guardada no terminal foi enviada.' : `Sinal restabelecido. ${enviados.length} leituras guardadas no terminal foram enviadas.` });
  }
  await query('UPDATE terminais SET online = FALSE, offline_desde = $1 WHERE id = $2', [ts, t.id]);
  await query(`INSERT INTO alertas (chave, tipo, posto_id, titulo, detalhe, criado_em) VALUES ($1,'offline',$2,'Terminal sem sinal',$3,$4) ON CONFLICT (chave) DO NOTHING`,
    ['off:' + t.id + ':' + hoje + ':' + ts, t.posto_id, 'Sem comunicação. As leituras ficam guardadas no aparelho e são enviadas quando o sinal voltar.', ts]);
  await auditar(u, 'Simulou queda de sinal do terminal', `${t.codigo} (${t.praia}, ${t.posto})`);
  res.json({ ok: true, mensagem: 'Sinal cortado (simulação). As próximas leituras ficam guardadas no terminal.' });
});

export default rotas;
