// Regras de presença: transformam escala + registros em "quem está em cada posto agora".
// Uma leitura de pulseira prova o momento em que o guarda-vidas passou pelo terminal, não que ele
// continua lá. Por isso a situação é sempre "a última informação recebida", com o horário dela.
import { query } from '../db.js';
import { agora, horaParaMin, minParaHora } from '../relogio.js';

export const TOLERANCIA_MIN = 10; // minutos após o início do turno antes de virar pendência

// Monta a situação de todos os postos (ou só de uma região) no horário atual da demonstração.
export async function situacaoDosPostos({ regiao = null } = {}) {
  const relogio = await agora();
  const { data, minutos } = relogio;
  const limite = relogio.ts;

  const postos = await query(`
    SELECT p.id, p.codigo, p.nome, p.tipo, p.latitude, p.longitude, p.previsto, p.energia, p.sazonal, p.precisao, p.observacao,
           to_char(p.hora_inicio, 'HH24:MI') AS hora_inicio, to_char(p.hora_fim, 'HH24:MI') AS hora_fim,
           pr.nome AS praia, pr.slug, pr.regiao_id, r.nome AS regiao,
           t.id AS terminal_id, t.codigo AS terminal, t.online,
           to_char(t.offline_desde, 'HH24:MI') AS offline_desde
    FROM postos p
    JOIN praias pr ON pr.id = p.praia_id
    JOIN regioes r ON r.id = pr.regiao_id
    LEFT JOIN terminais t ON t.posto_id = p.id
    WHERE p.ativo AND ($1::text IS NULL OR pr.regiao_id = $1)
    ORDER BY pr.ordem, p.tipo DESC, p.codigo`, [regiao]);

  // Versão mais recente da escala de cada posto no dia.
  const itens = await query(`
    SELECT e.posto_id, e.versao, ei.guarda_vidas_id, ei.funcao,
           to_char(ei.inicio, 'HH24:MI') AS inicio, to_char(ei.fim, 'HH24:MI') AS fim,
           g.codigo, g.nome
    FROM escala_itens ei
    JOIN escalas e ON e.id = ei.escala_id
    JOIN guarda_vidas g ON g.id = ei.guarda_vidas_id
    WHERE e.data = $1 AND e.versao = (SELECT MAX(versao) FROM escalas e2 WHERE e2.posto_id = e.posto_id AND e2.data = $1)
    ORDER BY e.posto_id, ei.funcao DESC, g.codigo`, [data]);

  // Registros válidos do dia até o "agora" da demonstração, do mais antigo ao mais recente.
  const registros = await query(`
    SELECT r.guarda_vidas_id, r.posto_id, r.tipo, r.transito, r.origem,
           to_char(r.hora_leitura, 'HH24:MI') AS hora
    FROM registros r
    WHERE r.situacao = 'valido' AND r.hora_leitura >= $1::date AND r.hora_leitura <= $2::timestamp
    ORDER BY r.hora_leitura, r.id`, [data, limite]);

  const ultimo = new Map(); // guarda-vidas → último registro
  const ultimoNoPosto = new Map(); // posto → horário do último registro recebido
  for (const r of registros) {
    ultimo.set(r.guarda_vidas_id, r);
    ultimoNoPosto.set(r.posto_id, r.hora);
  }

  const porPosto = new Map(postos.map((p) => [p.id, []]));
  for (const it of itens) if (porPosto.has(it.posto_id)) porPosto.get(it.posto_id).push(it);

  return {
    relogio: { data, hhmm: relogio.hhmm },
    postos: postos.map((p) => montarPosto(p, porPosto.get(p.id), ultimo, ultimoNoPosto.get(p.id), minutos)),
  };
}

function montarPosto(p, escalados, ultimo, horaUltimoRegistro, minutos) {
  const contagem = { escalados: escalados.length, presentes: 0, intervalo: 0, transito: 0, pendentes: 0, aguardando: 0, sairam: 0 };
  const pessoas = escalados.map((it) => {
    const situacao = situacaoDaPessoa(it, p.id, ultimo.get(it.guarda_vidas_id), minutos);
    contagem[situacao.chave] = (contagem[situacao.chave] || 0) + 1;
    return { id: it.guarda_vidas_id, codigo: it.codigo, nome: it.nome, funcao: it.funcao, inicio: it.inicio, fim: it.fim, ...situacao };
  });

  const abertura = horaParaMin(p.hora_inicio), fechamento = horaParaMin(p.hora_fim);
  const emHorario = minutos >= abertura && minutos < fechamento;

  // De quando é a informação mostrada?
  // - terminal online: o terminal "conversa" com o servidor o tempo todo, então vale o horário atual;
  // - terminal sem sinal: vale o horário em que ele parou de responder;
  // - posto avançado sem terminal: vale o último registro manual.
  let atualizado = null; let semSinal = false;
  if (p.terminal_id && p.online) atualizado = minParaHora(minutos);
  else if (p.terminal_id) { atualizado = p.offline_desde; semSinal = true; }
  else atualizado = horaUltimoRegistro || null;

  let status = 'fechado';
  if (emHorario) {
    if (semSinal) status = 'sem_atualizacao';
    else if (contagem.presentes === 0) status = 'sem_efetivo';
    else if (contagem.presentes < p.previsto) status = 'reduzido';
    else status = 'completo';
  }

  return {
    id: p.id, codigo: p.codigo, nome: p.nome, tipo: p.tipo, sazonal: p.sazonal, precisao: p.precisao, observacao: p.observacao, praia: p.praia, slug: p.slug, regiao_id: p.regiao_id, regiao: p.regiao,
    latitude: p.latitude, longitude: p.longitude, previsto: p.previsto, energia: p.energia,
    hora_inicio: p.hora_inicio, hora_fim: p.hora_fim, terminal: p.terminal, online: p.terminal_id ? p.online : null,
    em_horario: emHorario, status, atualizado, sem_sinal: semSinal, ...contagem, pessoas,
  };
}

function situacaoDaPessoa(item, postoId, reg, minutos) {
  if (!reg) {
    const inicio = horaParaMin(item.inicio);
    if (minutos >= inicio + TOLERANCIA_MIN) return { chave: 'pendentes', rotulo: 'Confirmação pendente', desde: item.inicio };
    return { chave: 'aguardando', rotulo: 'Turno ainda não começou', desde: item.inicio };
  }
  const desde = reg.hora;
  if (reg.tipo === 'intervalo') return { chave: 'intervalo', rotulo: 'Em intervalo', desde };
  if (reg.tipo === 'saida') {
    if (reg.transito) return { chave: 'transito', rotulo: 'Em deslocamento', desde };
    return { chave: 'sairam', rotulo: 'Encerrou o turno', desde };
  }
  if (reg.posto_id !== postoId) return { chave: 'transito', rotulo: 'Registrado em outro posto', desde };
  return { chave: 'presentes', rotulo: reg.origem === 'manual' ? 'Confirmado (registro manual)' : 'Confirmado no posto', desde };
}

// Versão pública: lista do que pode sair (nunca nomes, códigos de pessoas ou pendências internas).
const CAMPOS_PUBLICOS = ['id', 'nome', 'tipo', 'sazonal', 'precisao', 'observacao', 'praia', 'slug', 'regiao_id', 'regiao', 'latitude', 'longitude', 'previsto',
  'presentes', 'hora_inicio', 'hora_fim', 'em_horario', 'status', 'atualizado', 'sem_sinal'];
export function paraPublico(posto) {
  return Object.fromEntries(CAMPOS_PUBLICOS.map((c) => [c, posto[c]]));
}
