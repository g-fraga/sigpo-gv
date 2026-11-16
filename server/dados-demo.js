// Dados do banco.
// - Praias e postos: vêm dos arquivos server/catalogo/praias.csv e postos.csv (lista informada pelo autor).
// - Pessoas, escalas, leituras e números de efetivo: fictícios, só para demonstrar o sistema.
// criarDemonstracao() monta tudo do zero (com 6 dias de histórico); gerarDia() faz a virada do dia
// sem apagar cadastros nem histórico. Cenário às 10:30: 139 escalados, 130 confirmados e 9 pendências.
import fs from 'node:fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { exec, query } from './db.js';
import { INICIO_PADRAO, carimbo, hojeEmFlorianopolis, horaParaMin, limparCache } from './relogio.js';

const SCHEMA = new URL('./sql/schema.sql', import.meta.url);
const CATALOGO = new URL('./catalogo/', import.meta.url);
export const SENHA_DEMO = 'demo1234';

// Lê um CSV separado por ponto e vírgula e devolve uma lista de objetos (a 1ª linha é o cabeçalho).
export function lerCSV(nome) {
  const linhas = fs.readFileSync(new URL(nome, CATALOGO), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const cab = linhas.shift().split(';');
  return linhas.map((l) => {
    const v = l.split(';');
    return Object.fromEntries(cab.map((c, i) => [c, (v[i] ?? '').trim()]));
  });
}

// Efetivo previsto por posto: número FICTÍCIO da demonstração (não é dado oficial).
const PREVISTO = {
  N01: 4, N02: 4, N03: 4, N04: 5, N05: 4, N06: 3, N07: 3, N08: 3, N09: 3, N10: 2, N11: 3, N12: 4, N13: 3, N14: 3, N15: 5, N16: 4, N17: 3, N18: 4, N19: 3,
  L01: 4, L02: 3, L03: 4, L04: 3, L05: 4, L06: 3, L07: 5, L08: 4, L09: 2, L10: 2,
  S01: 3, S02: 4, S03: 5, S04: 3, S05: 3, S06: 3, S07: 3, S08: 3, S09: 2, S10: 3, S11: 2, S12: 2, S13: 2,
};
const ENERGIA = { N10: 'bateria', L02: 'bateria', L10: 'bateria', S11: 'bateria' };

const NOMES = ['Ana', 'Bruno', 'Camila', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas',
  'Mariana', 'Nicolas', 'Olívia', 'Pedro', 'Rafaela', 'Samuel', 'Tainá', 'Vitor', 'Yasmin', 'Arthur', 'Beatriz', 'Caio', 'Débora',
  'Enzo', 'Fernanda', 'Guilherme', 'Helena', 'Igor', 'Júlia', 'Kauã', 'Larissa', 'Mateus', 'Natália', 'Otávio', 'Paula', 'Renan',
  'Sofia', 'Thiago', 'Valentina', 'William', 'Alice', 'Bernardo', 'Clara', 'Davi', 'Elisa', 'Fábio', 'Giovana', 'Heitor', 'Lívia', 'Miguel'];
const SOBRENOMES = ['Silva', 'Souza', 'Oliveira', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo',
  'Fernandes', 'Carvalho', 'Gomes', 'Martins', 'Rocha', 'Ribeiro', 'Alves', 'Monteiro', 'Mendes', 'Barros', 'Freitas', 'Barbosa',
  'Pinto', 'Moura', 'Dias', 'Castro', 'Campos', 'Cardoso', 'Teixeira', 'Vieira', 'Machado', 'Schmitt', 'Becker', 'Koch', 'Werner'];

// "Impressão digital" dos arquivos que definem o banco. Se algum deles mudar (nova versão publicada),
// o servidor percebe que o banco está desatualizado e recria a demonstração sozinho.
export function versaoDosDados() {
  const h = crypto.createHash('sha1');
  for (const arq of [SCHEMA, new URL('praias.csv', CATALOGO), new URL('postos.csv', CATALOGO), new URL(import.meta.url)]) h.update(fs.readFileSync(arq));
  return h.digest('hex').slice(0, 12);
}

// Gerador de números aleatórios com semente fixa: os dados saem iguais toda vez.
function sorteador(semente) {
  let a = semente;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Funções auxiliares
// ---------------------------------------------------------------------------------------------
const somaDias = (data, n) => new Date(new Date(data + 'T12:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const semente = (txt) => [...txt].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

async function definirConfig(chave, valor) {
  await query('INSERT INTO config (chave, valor) VALUES ($1,$2) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor', [chave, String(valor)]);
}

// Insere muitas linhas de uma vez (bem mais rápido que uma consulta por linha).
async function inserirVarios(tabela, colunas, linhas) {
  for (let i = 0; i < linhas.length; i += 200) {
    const params = [];
    const valores = linhas.slice(i, i + 200).map((l) => '(' + l.map((v) => { params.push(v); return '$' + params.length; }).join(',') + ')').join(',');
    await query(`INSERT INTO ${tabela} (${colunas.join(',')}) VALUES ${valores}`, params);
  }
}

const COLUNAS_REGISTRO = ['codigo_unico', 'tipo', 'guarda_vidas_id', 'pulseira_id', 'terminal_id', 'posto_id', 'hora_leitura', 'hora_recebida', 'origem', 'situacao', 'observacoes', 'justificativa', 'autor_id', 'transito'];

// Monta a escala versão 1 de um dia a partir do posto base de cada guarda-vidas ativo.
// Postos que já têm escala nesse dia são mantidos como estão.
export async function escalasDaLotacao(data, publicadaEm, autorId, justificativa = 'Escala do dia gerada a partir do posto base') {
  const postos = await query('SELECT id FROM postos WHERE ativo AND id NOT IN (SELECT posto_id FROM escalas WHERE data = $1) ORDER BY id', [data]);
  if (!postos.length) return 0;
  const lotados = await query(`SELECT id, posto_id, codigo, vinculo FROM guarda_vidas
    WHERE situacao = 'ativo' AND posto_id IS NOT NULL ORDER BY posto_id, (vinculo = 'Militar') DESC, id`);
  const itens = [];
  for (const p of postos) {
    const equipe = lotados.filter((g) => g.posto_id === p.id);
    const [e] = await query('INSERT INTO escalas (posto_id, data, versao, publicada_em, publicada_por, justificativa) VALUES ($1,$2,1,$3,$4,$5) RETURNING id',
      [p.id, data, publicadaEm, autorId, justificativa]);
    equipe.forEach((g, i) => itens.push([e.id, g.id, i === 0 && g.vinculo === 'Militar' ? 'Chefe de posto' : 'Guarda-vidas', g.codigo === 'GV 0388' ? '10:00' : '08:00', '19:00']));
  }
  if (itens.length) await inserirVarios('escala_itens', ['escala_id', 'guarda_vidas_id', 'funcao', 'inicio', 'fim'], itens);
  return postos.length;
}

// Escala vigente (maior versão) de cada posto em um dia, com as pessoas na ordem da escala.
async function escalaVigente(data) {
  return query(`SELECT p.codigo, p.tipo, e.posto_id, ei.guarda_vidas_id, to_char(ei.inicio, 'HH24:MI') AS inicio, g.codigo AS gv
    FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id JOIN postos p ON p.id = e.posto_id JOIN guarda_vidas g ON g.id = ei.guarda_vidas_id
    WHERE e.data = $1 AND e.versao = (SELECT MAX(versao) FROM escalas e2 WHERE e2.posto_id = e.posto_id AND e2.data = $1)
    ORDER BY e.posto_id, ei.id`, [data]);
}

async function idsDeApoio() {
  const usuarios = await query("SELECT id, email FROM usuarios WHERE email IN ('admin@sigpo.demo','supervisor@sigpo.demo')");
  const adm = usuarios.find((u) => u.email === 'admin@sigpo.demo')?.id || null;
  const sup = usuarios.find((u) => u.email === 'supervisor@sigpo.demo')?.id || adm;
  const terminais = Object.fromEntries((await query('SELECT p.codigo, t.id FROM terminais t JOIN postos p ON p.id = t.posto_id')).map((t) => [t.codigo, t.id]));
  const pulseiras = Object.fromEntries((await query("SELECT guarda_vidas_id, id FROM pulseiras WHERE situacao = 'ativa'")).map((p) => [p.guarda_vidas_id, p.id]));
  return { adm, sup, terminais, pulseiras };
}

// Dias anteriores: todos se apresentaram de manhã e saíram no fim da tarde (histórico simples).
async function registrosDeDiaPassado(data, apoio) {
  const rnd = sorteador(semente('passado' + data));
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const linhas = [];
  for (const it of await escalaVigente(data)) {
    const ini = horaParaMin(it.inicio);
    const ent = ini + int(-20, 1); const sai = 19 * 60 + int(0, 12);
    if (it.tipo === 'avancado') {
      const autor = it.codigo.startsWith('L') ? apoio.sup : apoio.adm;
      for (const [tipo, m] of [['apresentacao', ini + 6], ['saida', 19 * 60 + 5]]) {
        linhas.push([crypto.randomUUID(), tipo, it.guarda_vidas_id, null, null, it.posto_id, carimbo(data, m), carimbo(data, m + 1), 'manual', 'valido', null, 'Posto avançado sem terminal: confirmado pelo rádio', autor, false]);
      }
      continue;
    }
    for (const [tipo, m] of [['apresentacao', ent], ['saida', sai]]) {
      linhas.push([crypto.randomUUID(), tipo, it.guarda_vidas_id, apoio.pulseiras[it.guarda_vidas_id] || null, apoio.terminais[it.codigo] || null, it.posto_id, carimbo(data, m), carimbo(data, m), 'nfc', 'valido', null, null, null, false]);
    }
  }
  await inserirVarios('registros', COLUNAS_REGISTRO, linhas);
}

// ---------------------------------------------------------------------------------------------
// Virada do dia: cria o dia de hoje sem apagar cadastros nem histórico.
// ---------------------------------------------------------------------------------------------
export async function gerarDia(hoje = hojeEmFlorianopolis()) {
  const apoio = await idsDeApoio();
  const ts = (min) => carimbo(hoje, min);
  const rnd = sorteador(semente('hoje' + hoje));
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

  // Alertas que ficaram abertos em dias anteriores são encerrados pelo sistema.
  const velhos = await query("UPDATE alertas SET situacao = 'descartado', tratado_em = $1, nota = 'Encerrado na virada do dia' WHERE situacao IN ('aberto','reconhecido') AND criado_em < $2::date RETURNING id", [ts(0), hoje]);
  if (velhos.length) await inserirVarios('alerta_tratativas', ['alerta_id', 'usuario_nome', 'situacao', 'nota', 'criado_em'], velhos.map((a) => [a.id, 'Sistema', 'descartado', 'Encerrado na virada do dia', ts(0)]));

  // Relógio da demonstração recomeça às 10:30.
  await definirConfig('demo_data', hoje);
  await definirConfig('demo_inicio_real', Date.now());
  await definirConfig('demo_inicio_min', INICIO_PADRAO);
  limparCache();

  // Escalas: hoje e os próximos 3 dias (publicadas na véspera às 18:00).
  for (let d = 0; d <= 3; d++) await escalasDaLotacao(somaDias(hoje, d), somaDias(hoje, d - 1) + ' 18:00:00', apoio.adm);

  // Se o dia já tem registros (servidor reiniciado no mesmo dia), não repete o cenário.
  const [{ n }] = await query('SELECT COUNT(*)::int AS n FROM registros WHERE hora_leitura >= $1::date AND hora_leitura < $1::date + 1', [hoje]);
  if (n > 0) return;

  // Terminais: todos com sinal, menos o da Praia Mole (Posto Central), sem sinal desde 09:33.
  await query('UPDATE terminais SET online = TRUE, offline_desde = NULL, ultima_comunicacao = $1', [ts(INICIO_PADRAO)]);
  if (apoio.terminais.L05) await query('UPDATE terminais SET online = FALSE, offline_desde = $1, ultima_comunicacao = $1 WHERE id = $2', [ts(573), apoio.terminais.L05]);

  // Quem está escalado hoje, por posto, na ordem da escala.
  const vigente = await escalaVigente(hoje);
  const escalaDe = {}; const postoId = {}; const tipoDe = {};
  for (const it of vigente) {
    (escalaDe[it.codigo] ||= []).push(it.guarda_vidas_id);
    postoId[it.codigo] = it.posto_id; tipoDe[it.codigo] = it.tipo;
  }
  const pega = (cod, i) => escalaDe[cod]?.[i];
  const porCodigo = Object.fromEntries((await query("SELECT codigo, id FROM guarda_vidas WHERE codigo IN ('GV 0417','GV 0388')")).map((g) => [g.codigo, g.id]));
  const gv417 = porCodigo['GV 0417']; const gv388 = porCodigo['GV 0388'];

  const pendentes = new Set([pega('N19', 2), pega('N16', 3), pega('N17', 1), pega('L01', 3), pega('L07', 4), gv388, pega('S02', 3), pega('S07', 2), pega('S10', 1)].filter(Boolean));
  const atrasados = new Set([pega('N04', 3), pega('L03', 2), pega('S06', 2), pega('S01', 1)].filter(Boolean));
  const transferido = pega('N05', 3);

  const linhas = [];
  const registro = (tipo, gv, codigo, min, extra = {}) => linhas.push([crypto.randomUUID(), tipo, gv, extra.origem === 'manual' ? null : (apoio.pulseiras[gv] || null),
    apoio.terminais[codigo] || null, postoId[codigo], ts(min), ts(min + (extra.atraso || 0)), extra.origem || 'nfc', 'valido', extra.obs || null, extra.just || null, extra.autor || null, !!extra.transito]);

  for (const it of vigente) {
    const gv = it.guarda_vidas_id;
    if (pendentes.has(gv)) continue;
    if (it.tipo === 'avancado') { registro('apresentacao', gv, it.codigo, 486, { origem: 'manual', just: 'Posto avançado sem terminal: confirmado pelo rádio', autor: it.codigo.startsWith('L') ? apoio.sup : apoio.adm, atraso: 1 }); continue; }
    const min = gv === gv417 ? 486 : atrasados.has(gv) ? int(492, 504) : int(460, 481);
    registro('apresentacao', gv, it.codigo, min);
  }

  // Transferência: Canasvieiras Posto Trapiche → Posto Central (10:20 a 10:28).
  const motivo = 'Reforço em Canasvieiras, Posto Central (maior movimento)';
  if (transferido && postoId.N05 && postoId.N04) {
    registro('saida', transferido, 'N05', 622, { transito: true, obs: 'Saída para Canasvieiras, Posto Central' });
    registro('apresentacao', transferido, 'N04', 628, { obs: 'Chegada de transferência' });
    const [eO] = await query('INSERT INTO escalas (posto_id, data, versao, publicada_em, publicada_por, justificativa) VALUES ($1,$2,2,$3,$4,$5) RETURNING id', [postoId.N05, hoje, ts(620), apoio.adm, motivo]);
    const [eD] = await query('INSERT INTO escalas (posto_id, data, versao, publicada_em, publicada_por, justificativa) VALUES ($1,$2,2,$3,$4,$5) RETURNING id', [postoId.N04, hoje, ts(620), apoio.adm, motivo]);
    await query(`INSERT INTO escala_itens (escala_id, guarda_vidas_id, funcao, inicio, fim)
      SELECT $1, ei.guarda_vidas_id, ei.funcao, ei.inicio, ei.fim FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id
      WHERE e.posto_id = $2 AND e.data = $3 AND e.versao = 1 AND ei.guarda_vidas_id <> $4 ORDER BY ei.id`, [eO.id, postoId.N05, hoje, transferido]);
    await query(`INSERT INTO escala_itens (escala_id, guarda_vidas_id, funcao, inicio, fim)
      SELECT $1, ei.guarda_vidas_id, ei.funcao, ei.inicio, ei.fim FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id
      WHERE e.posto_id = $2 AND e.data = $3 AND e.versao = 1 ORDER BY ei.id`, [eD.id, postoId.N04, hoje]);
    await query("INSERT INTO escala_itens (escala_id, guarda_vidas_id, funcao, inicio, fim) VALUES ($1,$2,'Guarda-vidas','08:00','19:00')", [eD.id, transferido]);
    await query(`INSERT INTO movimentacoes (data, tipo, guarda_vidas_id, origem_id, destino_id, situacao, motivo, criada_em, criada_por, saida_em, chegada_em)
      VALUES ($1,'transferencia',$2,$3,$4,'concluida',$5,$6,$7,$8,$9)`, [hoje, transferido, postoId.N05, postoId.N04, motivo, ts(620), apoio.adm, ts(622), ts(628)]);
    await query("INSERT INTO alertas (chave, tipo, posto_id, titulo, detalhe, criado_em, situacao, tratado_por, tratado_em, nota) VALUES ($1,'escala',$2,'Escala alterada',$3,$4,'reconhecido',$5,$6,'Transferência acompanhada pela administração')",
      ['esc:' + postoId.N05 + ':' + hoje + ':2', postoId.N05, 'Versão 2: transferência para Canasvieiras, Posto Central (reforço).', ts(620), apoio.adm, ts(622)]);
    await query("INSERT INTO alertas (chave, tipo, posto_id, titulo, detalhe, criado_em) VALUES ($1,'abaixo',$2,'Posto abaixo do previsto','Um guarda-vidas a menos depois da transferência. Avaliar reforço.',$3)", ['abaixo:' + postoId.N05 + ':' + hoje, postoId.N05, ts(625)]);
  }

  // Intervalos em andamento.
  if (pega('N15', 2)) registro('intervalo', pega('N15', 2), 'N15', 615);
  if (pega('S03', 3)) registro('intervalo', pega('S03', 3), 'S03', 622);
  await inserirVarios('registros', COLUNAS_REGISTRO, linhas);

  // Alertas de pendência e do terminal sem sinal.
  for (const gv of pendentes) {
    const it = vigente.find((v) => v.guarda_vidas_id === gv);
    if (!it) continue;
    await query("INSERT INTO alertas (chave, tipo, posto_id, guarda_vidas_id, titulo, detalhe, criado_em) VALUES ($1,'pendente',$2,$3,'Confirmação pendente',$4,$5) ON CONFLICT (chave) DO NOTHING",
      ['pend:' + gv + ':' + hoje, it.posto_id, gv, `Escalado para ${it.inicio}, sem apresentação registrada.`, ts(horaParaMin(it.inicio) + 10)]);
  }
  if (apoio.terminais.L05) {
    await query("INSERT INTO alertas (chave, tipo, posto_id, titulo, detalhe, criado_em) VALUES ($1,'offline',$2,'Terminal sem sinal','Sem comunicação desde 09:33. As leituras ficam guardadas no aparelho e são enviadas quando o sinal voltar.',$3) ON CONFLICT (chave) DO NOTHING",
      ['off:' + apoio.terminais.L05 + ':' + hoje, postoId.L05, ts(593)]);
  }

  // Pedido de revisão do GV 0417 (fictício), para a supervisão ter o que analisar.
  const [reg417] = gv417 ? await query("SELECT id, posto_id FROM registros WHERE guarda_vidas_id = $1 AND tipo = 'apresentacao' AND hora_leitura >= $2::date ORDER BY hora_leitura DESC LIMIT 1", [gv417, hoje]) : [];
  if (reg417) {
    await query(`INSERT INTO pedidos_revisao (registro_id, guarda_vidas_id, posto_id, motivo, texto, data_referencia, hora_informada, criado_em)
      VALUES ($1,$2,$3,'horario',$4,$5,'07:52',$6)`, [reg417.id, gv417, reg417.posto_id,
      'Cheguei ao posto às 07:52, mas a leitura só foi aceita na segunda tentativa, às 08:06. O chefe do posto pode confirmar.', hoje, ts(540)]);
  }

  // Auditoria do dia.
  const aud = (min, quem, nome, acao, objeto, detalhe) => query('INSERT INTO auditoria (usuario_id, usuario_nome, acao, objeto, detalhe, criado_em) VALUES ($1,$2,$3,$4,$5,$6)', [quem, nome, acao, objeto, detalhe, min === null ? somaDias(hoje, -1) + ' 18:00:00' : ts(min)]);
  await aud(null, apoio.adm, 'Cb. R. Teixeira (fictício)', 'Publicou escalas', 'Postos ativos', 'Escala do dia gerada a partir do posto base');
  await aud(486, apoio.sup, 'Sgt. P. Ramos (fictício)', 'Registro manual', 'Joaquina, Posto Avançado Dunas', 'Apresentações confirmadas pelo rádio (posto sem terminal)');
  if (transferido) await aud(620, apoio.adm, 'Cb. R. Teixeira (fictício)', 'Criou transferência', 'Canasvieiras: Posto Trapiche → Posto Central', motivo);
}

// ---------------------------------------------------------------------------------------------
// Criação completa: apaga tudo e monta a demonstração do zero.
// ---------------------------------------------------------------------------------------------
export async function criarDemonstracao() {
  const rnd = sorteador(20270110);
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const hex = () => int(0, 255).toString(16).toUpperCase().padStart(2, '0');
  const chip = () => ['04', hex(), hex(), hex(), hex(), hex(), hex()].join(':');
  const hoje = hojeEmFlorianopolis();
  const emissao = somaDias(hoje, -30); // pulseiras entregues no início da temporada

  await exec(fs.readFileSync(SCHEMA, 'utf8'));
  limparCache();
  await definirConfig('demo_versao', versaoDosDados());
  await query("INSERT INTO regioes (id, nome) VALUES ('N','Norte da Ilha'),('L','Leste da Ilha'),('S','Sul da Ilha'),('C','Continente')");

  // Catálogo de praias e postos (arquivos CSV).
  const praiaId = {};
  for (const [i, p] of lerCSV('praias.csv').entries()) {
    const [r] = await query('INSERT INTO praias (nome, slug, regiao_id, ordem, observacao) VALUES ($1,$2,$3,$4,$5) RETURNING id', [p.praia, p.slug, p.regiao, i + 1, p.observacao || null]);
    praiaId[p.slug] = r.id;
  }
  const conferidas = Object.fromEntries((await query('SELECT codigo, latitude, longitude FROM posicoes_conferidas')).map((c) => [c.codigo, c]));
  const POSTOS = lerCSV('postos.csv');
  const postoId = {};
  for (const p of POSTOS) {
    if (!praiaId[p.praia]) throw new Error(`postos.csv: praia "${p.praia}" do posto ${p.codigo} não existe em praias.csv`);
    const c = conferidas[p.codigo];
    const tipo = p.tipo === 'avancado' ? 'avancado' : 'guarita';
    const [r] = await query(`INSERT INTO postos (codigo, praia_id, nome, tipo, latitude, longitude, previsto, energia, sazonal, precisao, observacao)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [p.codigo, praiaId[p.praia], p.posto, tipo, c ? c.latitude : Number(p.latitude), c ? c.longitude : Number(p.longitude),
      PREVISTO[p.codigo] || 3, tipo === 'avancado' ? 'nenhuma' : (ENERGIA[p.codigo] || 'rede'), p.sazonal === 'sim',
      c || p.precisao === 'conferida' ? 'conferida' : 'aproximada', p.observacao || null]);
    postoId[p.codigo] = r.id;
    if (tipo !== 'avancado') await query('INSERT INTO terminais (posto_id, codigo, online) VALUES ($1,$2,TRUE)', [r.id, 'T-' + p.codigo]);
  }

  // Guarda-vidas: cada um com posto base e pulseira. Os 20 da reserva ficam sem posto base.
  const totalLotados = POSTOS.reduce((s, p) => s + (PREVISTO[p.codigo] || 3), 0);
  const codigos = new Set([417, 388]);
  while (codigos.size < totalLotados + 22) codigos.add(int(101, 989));
  const lista = [...codigos].filter((c) => c !== 417 && c !== 388).sort(() => rnd() - 0.5);
  const nomesUsados = new Set();
  const novoNome = () => { let n; do { n = NOMES[int(0, NOMES.length - 1)] + ' ' + SOBRENOMES[int(0, SOBRENOMES.length - 1)]; } while (nomesUsados.has(n)); nomesUsados.add(n); return n; };
  const gvs = []; const lotacao = {};
  let k = 0;
  for (const p of POSTOS) {
    lotacao[p.codigo] = [];
    for (let i = 0; i < (PREVISTO[p.codigo] || 3); i++) {
      let cod = null; let nome = null;
      if (p.codigo === 'L08' && i === 1) { cod = 417; nome = 'Rafael Lima'; } else if (p.codigo === 'L08' && i === 3) cod = 388; else cod = lista[k++];
      gvs.push({ cod, nome: nome || novoNome(), vinculo: i === 0 ? 'Militar' : 'GVCV', situacao: 'ativo', posto: postoId[p.codigo] });
    }
  }
  for (let i = 0; i < 20; i++) gvs.push({ cod: lista[k++], nome: novoNome(), vinculo: 'GVCV', situacao: 'ativo', posto: null });
  for (let i = 0; i < 2; i++) gvs.push({ cod: lista[k++], nome: novoNome(), vinculo: 'GVCV', situacao: 'afastado', posto: null });
  const idDe = {};
  for (const g of gvs) {
    const codigo = 'GV ' + String(g.cod).padStart(4, '0');
    const [r] = await query('INSERT INTO guarda_vidas (codigo, nome, vinculo, situacao, posto_id) VALUES ($1,$2,$3,$4,$5) RETURNING id', [codigo, g.nome, g.vinculo, g.situacao, g.posto]);
    idDe[codigo] = r.id; g.id = r.id;
  }
  await inserirVarios('pulseiras', ['guarda_vidas_id', 'numero_chip', 'tipo', 'situacao', 'emitida_em'],
    gvs.map((g) => [g.id, chip(), 'pulseira', g.situacao === 'ativo' ? 'ativa' : 'inativa', emissao]));

  // Pulseira perdida ontem por um guarda-vidas de Jurerê: bloqueada e cartão reserva ativo.
  const [perdeu] = await query("SELECT id FROM guarda_vidas WHERE posto_id = $1 ORDER BY (vinculo = 'Militar') DESC, id OFFSET 2 LIMIT 1", [postoId.N01]);
  if (perdeu) {
    await query("UPDATE pulseiras SET situacao = 'bloqueada', motivo = 'Perda informada pelo guarda-vidas' WHERE guarda_vidas_id = $1", [perdeu.id]);
    await query("INSERT INTO pulseiras (guarda_vidas_id, numero_chip, tipo, situacao, emitida_em, motivo) VALUES ($1,$2,'cartao_reserva','ativa',$3,'Substitui a pulseira perdida')", [perdeu.id, chip(), somaDias(hoje, -1)]);
  }

  // Contas de demonstração.
  const hash = await bcrypt.hash(SENHA_DEMO, 10);
  await query("INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ('Cb. R. Teixeira (fictício)','admin@sigpo.demo',$1,'admin')", [hash]);
  await query("INSERT INTO usuarios (nome, email, senha_hash, perfil, regiao_id) VALUES ('Sgt. P. Ramos (fictício)','supervisor@sigpo.demo',$1,'supervisor','L')", [hash]);
  await query("INSERT INTO usuarios (nome, email, senha_hash, perfil, guarda_vidas_id) VALUES ('Rafael Lima (fictício)','gv0417@sigpo.demo',$1,'guarda_vidas',$2)", [hash, idDe['GV 0417']]);

  // Histórico: os 6 dias anteriores, com escala e registros de entrada e saída.
  const apoio = await idsDeApoio();
  for (let d = 6; d >= 1; d--) {
    const dia = somaDias(hoje, -d);
    await escalasDaLotacao(dia, somaDias(dia, -1) + ' 18:00:00', apoio.adm);
    await registrosDeDiaPassado(dia, apoio);
  }

  // Hoje (com o cenário da demonstração) e os próximos 3 dias.
  await gerarDia(hoje);
  return { data: hoje, postos: POSTOS.length, escalados: totalLotados };
}
