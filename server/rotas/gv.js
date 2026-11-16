// Rotas do guarda-vidas: só os próprios dados. O id vem da sessão, nunca do navegador.
import { Router } from 'express';
import { query } from '../db.js';
import { agora } from '../relogio.js';
import { situacaoDosPostos } from '../regras/presenca.js';
import { exigirPerfil, auditar } from './auth.js';
import { MOTIVOS_REVISAO } from './painel.js';
import { falha, inteiro, texto, opcao, data as validarData, hora as validarHora, somaDias } from '../regras/validacao.js';

const rotas = Router();
rotas.use(exigirPerfil('guarda_vidas'));
rotas.use((req, res, next) => {
  if (!req.usuario.guarda_vidas_id) falha(403, 'Esta conta não está vinculada a um guarda-vidas.');
  req.gv = req.usuario.guarda_vidas_id;
  next();
});

const NOMES_SITUACAO = { presentes: 'Confirmado no posto', intervalo: 'Em intervalo', transito: 'Em deslocamento', pendentes: 'Confirmação pendente', aguardando: 'Turno ainda não começou', sairam: 'Turno encerrado' };

async function escalaDoDia(gv, dia) {
  const [e] = await query(`SELECT e.posto_id, e.versao, p.nome AS posto, pr.nome AS praia, r.nome AS regiao, ei.funcao, to_char(ei.inicio, 'HH24:MI') AS inicio, to_char(ei.fim, 'HH24:MI') AS fim
    FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id JOIN postos p ON p.id = e.posto_id JOIN praias pr ON pr.id = p.praia_id JOIN regioes r ON r.id = pr.regiao_id
    WHERE ei.guarda_vidas_id = $1 AND e.data = $2 AND e.versao = (SELECT MAX(versao) FROM escalas e2 WHERE e2.posto_id = e.posto_id AND e2.data = $2)`, [gv, dia]);
  return e || null;
}

rotas.get('/inicio', async (req, res) => {
  const relogio = await agora();
  const [eu] = await query(`SELECT g.codigo, g.nome, g.vinculo, g.situacao, p.nome AS posto, pr.nome AS praia, r.nome AS regiao,
      (SELECT numero_chip FROM pulseiras WHERE guarda_vidas_id = g.id AND situacao = 'ativa' LIMIT 1) AS pulseira
    FROM guarda_vidas g LEFT JOIN postos p ON p.id = g.posto_id LEFT JOIN praias pr ON pr.id = p.praia_id LEFT JOIN regioes r ON r.id = pr.regiao_id WHERE g.id = $1`, [req.gv]);
  const hoje = await escalaDoDia(req.gv, relogio.data);
  let presenca = null; let terminal = null;
  if (hoje) {
    const { postos } = await situacaoDosPostos();
    const p = postos.find((x) => x.id === hoje.posto_id);
    const pe = p?.pessoas.find((x) => x.id === req.gv);
    if (pe) presenca = { situacao: pe.chave, texto: NOMES_SITUACAO[pe.chave], desde: pe.desde };
    if (p?.sem_sinal) terminal = `O terminal do seu posto está sem sinal desde ${p.atualizado}. Leituras feitas depois disso aparecem quando o sinal voltar.`;
  }
  const recentes = await query(`SELECT to_char(r.hora_leitura, 'DD/MM HH24:MI') AS quando, r.tipo, r.origem, r.situacao, r.sincronizado, p.nome AS posto, pr.nome AS praia
    FROM registros r JOIN postos p ON p.id = r.posto_id JOIN praias pr ON pr.id = p.praia_id
    WHERE r.guarda_vidas_id = $1 AND r.hora_leitura <= $2::timestamp ORDER BY r.hora_leitura DESC, r.id DESC LIMIT 5`, [req.gv, relogio.ts]);
  // Avisos: respostas de revisão recentes, pedidos abertos, mudança de escala hoje e leituras guardadas no terminal.
  const avisos = [];
  const respostas = await query(`SELECT id, situacao, to_char(respondido_em, 'DD/MM HH24:MI') AS quando FROM pedidos_revisao
    WHERE guarda_vidas_id = $1 AND situacao <> 'aberto' AND respondido_em >= $2::date - 7 ORDER BY respondido_em DESC`, [req.gv, relogio.data]);
  for (const r of respostas) avisos.push({ tipo: 'revisao', texto: `Seu pedido de revisão nº ${r.id} foi ${r.situacao} em ${r.quando}.`, link: '/painel/minhas-revisoes' });
  const [{ n: abertos }] = await query("SELECT COUNT(*)::int AS n FROM pedidos_revisao WHERE guarda_vidas_id = $1 AND situacao = 'aberto'", [req.gv]);
  if (abertos) avisos.push({ tipo: 'pendente', texto: abertos === 1 ? '1 pedido de revisão aguardando análise da supervisão.' : `${abertos} pedidos de revisão aguardando análise da supervisão.`, link: '/painel/minhas-revisoes' });
  if (hoje && hoje.versao > 1) avisos.push({ tipo: 'escala', texto: `A escala do seu posto foi alterada hoje (versão ${hoje.versao}).`, link: '/painel/minha-escala' });
  const [{ n: fila }] = await query('SELECT COUNT(*)::int AS n FROM registros WHERE guarda_vidas_id = $1 AND NOT sincronizado', [req.gv]);
  if (fila) avisos.push({ tipo: 'sinc', texto: fila === 1 ? '1 leitura sua está guardada em terminal sem sinal, aguardando sincronização.' : `${fila} leituras suas estão guardadas em terminal sem sinal, aguardando sincronização.`, link: '/painel/meus-registros' });
  if (terminal) avisos.push({ tipo: 'terminal', texto: terminal });
  res.json({ relogio, eu, hoje, presenca, recentes, avisos });
});

rotas.get('/escala', async (req, res) => {
  const { data: hoje } = await agora();
  const de = somaDias(hoje, -14); const ate = somaDias(hoje, 30);
  const dias = await query(`SELECT to_char(e.data, 'YYYY-MM-DD') AS data, e.versao, p.nome AS posto, pr.nome AS praia, r.nome AS regiao, ei.funcao,
      to_char(ei.inicio, 'HH24:MI') AS inicio, to_char(ei.fim, 'HH24:MI') AS fim
    FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id JOIN postos p ON p.id = e.posto_id JOIN praias pr ON pr.id = p.praia_id JOIN regioes r ON r.id = pr.regiao_id
    WHERE ei.guarda_vidas_id = $1 AND e.data BETWEEN $2 AND $3 AND e.versao = (SELECT MAX(versao) FROM escalas e2 WHERE e2.posto_id = e.posto_id AND e2.data = e.data)
    ORDER BY e.data`, [req.gv, de, ate]);
  // Alterações: versões (a partir da 2ª) em que a pessoa entrou, saiu ou teve horário mudado.
  const versoes = await query(`SELECT e.id, e.posto_id, to_char(e.data, 'YYYY-MM-DD') AS data, e.versao, e.justificativa, to_char(e.publicada_em, 'DD/MM HH24:MI') AS publicada_em,
      p.nome AS posto, pr.nome AS praia,
      (SELECT to_char(inicio, 'HH24:MI') || '–' || to_char(fim, 'HH24:MI') FROM escala_itens WHERE escala_id = e.id AND guarda_vidas_id = $1) AS horario
    FROM escalas e JOIN postos p ON p.id = e.posto_id JOIN praias pr ON pr.id = p.praia_id
    WHERE e.data BETWEEN $2 AND $3 AND e.posto_id IN (SELECT e3.posto_id FROM escalas e3 JOIN escala_itens i3 ON i3.escala_id = e3.id WHERE i3.guarda_vidas_id = $1 AND e3.data = e.data)
    ORDER BY e.data, e.posto_id, e.versao`, [req.gv, de, ate]);
  const alteracoes = [];
  for (let i = 1; i < versoes.length; i++) {
    const a = versoes[i - 1]; const b = versoes[i];
    if (a.posto_id !== b.posto_id || a.data !== b.data || a.horario === b.horario) continue;
    const o = !a.horario ? 'Você foi incluído' : !b.horario ? 'Você saiu desta escala' : `Horário mudou de ${a.horario} para ${b.horario}`;
    alteracoes.push({ data: b.data, posto: b.posto, praia: b.praia, versao: b.versao, publicada_em: b.publicada_em, justificativa: b.justificativa, o_que_mudou: o });
  }
  res.json({ hoje, dias, alteracoes });
});

rotas.get('/registros', async (req, res) => {
  const relogio = await agora();
  const de = req.query.de ? validarData(req.query.de) : somaDias(relogio.data, -6);
  const ate = req.query.ate ? validarData(req.query.ate) : relogio.data;
  if (ate < de) falha(400, 'A data final deve ser igual ou posterior à inicial.');
  const registros = await query(`SELECT r.id, to_char(r.hora_leitura, 'YYYY-MM-DD') AS data, to_char(r.hora_leitura, 'HH24:MI') AS hora, to_char(r.hora_recebida, 'DD/MM HH24:MI') AS recebida,
      r.sincronizado, r.tipo, r.origem, r.situacao, r.justificativa, r.corrige_id, p.nome AS posto, pr.nome AS praia,
      EXISTS (SELECT 1 FROM pedidos_revisao pe WHERE pe.registro_id = r.id AND pe.situacao = 'aberto') AS em_revisao
    FROM registros r JOIN postos p ON p.id = r.posto_id JOIN praias pr ON pr.id = p.praia_id
    WHERE r.guarda_vidas_id = $1 AND r.hora_leitura >= $2::date AND r.hora_leitura < $3::date + 1 AND r.hora_leitura <= $4::timestamp
    ORDER BY r.hora_leitura DESC, r.id DESC`, [req.gv, de, ate, relogio.ts]);
  const movimentacoes = await query(`SELECT to_char(m.data, 'YYYY-MM-DD') AS data, m.tipo, m.situacao, m.motivo, to_char(m.saida_em, 'HH24:MI') AS saida, to_char(m.chegada_em, 'HH24:MI') AS chegada,
      po.nome AS origem, pro.nome AS origem_praia, pd.nome AS destino, prd.nome AS destino_praia
    FROM movimentacoes m LEFT JOIN postos po ON po.id = m.origem_id LEFT JOIN praias pro ON pro.id = po.praia_id JOIN postos pd ON pd.id = m.destino_id JOIN praias prd ON prd.id = pd.praia_id
    WHERE m.guarda_vidas_id = $1 ORDER BY m.data DESC, m.criada_em DESC LIMIT 30`, [req.gv]);
  res.json({ de, ate, registros, movimentacoes });
});

rotas.get('/revisoes', async (req, res) => {
  const pedidos = await query(`SELECT pe.id, pe.motivo, pe.texto, pe.situacao, pe.resposta, to_char(pe.data_referencia, 'DD/MM/YYYY') AS data_referencia, to_char(pe.hora_informada, 'HH24:MI') AS hora_informada,
      to_char(pe.criado_em, 'DD/MM HH24:MI') AS criado, to_char(pe.respondido_em, 'DD/MM HH24:MI') AS respondido, u.nome AS respondido_por,
      r.tipo AS registro_tipo, to_char(r.hora_leitura, 'HH24:MI') AS registro_hora, p.nome AS posto, pr.nome AS praia
    FROM pedidos_revisao pe JOIN postos p ON p.id = pe.posto_id JOIN praias pr ON pr.id = p.praia_id LEFT JOIN registros r ON r.id = pe.registro_id LEFT JOIN usuarios u ON u.id = pe.respondido_por
    WHERE pe.guarda_vidas_id = $1 ORDER BY pe.criado_em DESC`, [req.gv]);
  res.json({ motivos: MOTIVOS_REVISAO, pedidos: pedidos.map((p) => ({ ...p, motivo_texto: MOTIVOS_REVISAO[p.motivo] })) });
});

rotas.post('/revisoes', async (req, res) => {
  const b = req.body || {};
  const relogio = await agora();
  const motivo = opcao(b.motivo, 'Motivo', Object.keys(MOTIVOS_REVISAO));
  const justificativa = texto(b.justificativa, 'Justificativa', { min: 15, max: 600 });
  let registroId = null; let postoId; let dia; let horaInformada = b.hora ? validarHora(b.hora, 'Horário correto') : null;
  if (motivo === 'ausente') {
    dia = validarData(b.data, 'Data');
    if (dia > relogio.data || dia < somaDias(relogio.data, -30)) falha(400, 'Informe uma data dos últimos 30 dias.');
    if (!horaInformada) falha(400, 'Informe o horário em que você aproximou a pulseira.');
    const esc = await escalaDoDia(req.gv, dia);
    const [base] = await query('SELECT posto_id FROM guarda_vidas WHERE id = $1', [req.gv]);
    postoId = esc?.posto_id || base?.posto_id;
    if (!postoId) falha(400, 'Não encontramos escala sua nesse dia. Procure a supervisão.');
  } else {
    registroId = inteiro(b.registro_id, 'Registro');
    // O registro precisa ser da própria pessoa: o id do guarda-vidas vem da sessão.
    const [r] = await query("SELECT id, posto_id, situacao, to_char(hora_leitura, 'YYYY-MM-DD') AS dia FROM registros WHERE id = $1 AND guarda_vidas_id = $2", [registroId, req.gv]);
    if (!r) falha(404, 'Registro não encontrado entre os seus.');
    if (r.situacao !== 'valido') falha(400, 'Este registro já foi corrigido ou não foi aceito; não é possível pedir revisão dele.');
    if (r.dia < somaDias(relogio.data, -30)) falha(400, 'Só é possível pedir revisão de registros dos últimos 30 dias.');
    const [aberto] = await query("SELECT id FROM pedidos_revisao WHERE registro_id = $1 AND situacao = 'aberto'", [registroId]);
    if (aberto) falha(409, `Já existe um pedido aberto para este registro (nº ${aberto.id}).`);
    if (motivo === 'horario' && !horaInformada) falha(400, 'Informe o horário correto.');
    postoId = r.posto_id; dia = r.dia;
  }
  const [pe] = await query(`INSERT INTO pedidos_revisao (registro_id, guarda_vidas_id, posto_id, motivo, texto, data_referencia, hora_informada, criado_em)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [registroId, req.gv, postoId, motivo, justificativa, dia, horaInformada, relogio.ts]);
  await auditar(req.usuario, 'Pediu revisão de registro', `Pedido nº ${pe.id}`, `${MOTIVOS_REVISAO[motivo]}. ${justificativa}`);
  res.status(201).json({ ok: true, id: pe.id, mensagem: `Pedido nº ${pe.id} enviado. A supervisão vai analisar e você acompanha a resposta aqui.` });
});

export default rotas;
