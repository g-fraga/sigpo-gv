// Cria o banco do zero.
// - Praias e postos: vêm dos arquivos server/catalogo/praias.csv e postos.csv (lista informada pelo autor).
// - Pessoas, escalas, leituras e números de efetivo: fictícios, só para demonstrar o sistema.
// Cenário às 10:30: 42 postos, 139 guarda-vidas escalados, 130 confirmados e 9 pendências.
import fs from 'node:fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { exec, query } from './db.js';
import { INICIO_PADRAO, carimbo, hojeEmFlorianopolis, limparCache } from './relogio.js';

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

export async function criarDemonstracao() {
  const rnd = sorteador(20270110);
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const hex = () => int(0, 255).toString(16).toUpperCase().padStart(2, '0');
  const chip = () => ['04', hex(), hex(), hex(), hex(), hex(), hex()].join(':');
  const hoje = hojeEmFlorianopolis();
  const ts = (min) => carimbo(hoje, min);
  const diasAntes = (n) => new Date(new Date(hoje + 'T12:00:00Z').getTime() - n * 864e5).toISOString().slice(0, 10);
  const ontem18h = diasAntes(1) + ' 18:00:00';
  const emissao = diasAntes(30); // pulseiras entregues no início da temporada

  await exec(fs.readFileSync(SCHEMA, 'utf8'));
  limparCache();

  await query('INSERT INTO config (chave, valor) VALUES ($1,$2),($3,$4),($5,$6),($7,$8)',
    ['demo_data', hoje, 'demo_inicio_real', String(Date.now()), 'demo_inicio_min', String(INICIO_PADRAO), 'demo_versao', versaoDosDados()]);
  await query("INSERT INTO regioes (id, nome) VALUES ('N','Norte da Ilha'),('L','Leste da Ilha'),('S','Sul da Ilha'),('C','Continente')");

  // Catálogo de praias e postos.
  const praiaId = {};
  for (const [i, p] of lerCSV('praias.csv').entries()) {
    const [r] = await query('INSERT INTO praias (nome, slug, regiao_id, ordem, observacao) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [p.praia, p.slug, p.regiao, i + 1, p.observacao || null]);
    praiaId[p.slug] = r.id;
  }
  const conferidas = Object.fromEntries((await query('SELECT codigo, latitude, longitude FROM posicoes_conferidas')).map((c) => [c.codigo, c]));
  const POSTOS = lerCSV('postos.csv');
  const postoId = {}; const termId = {}; const tipoDe = {};
  for (const p of POSTOS) {
    if (!praiaId[p.praia]) throw new Error(`postos.csv: praia "${p.praia}" do posto ${p.codigo} não existe em praias.csv`);
    const c = conferidas[p.codigo];
    const tipo = p.tipo === 'avancado' ? 'avancado' : 'guarita';
    const [r] = await query(`INSERT INTO postos (codigo, praia_id, nome, tipo, latitude, longitude, previsto, energia, sazonal, precisao, observacao)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [p.codigo, praiaId[p.praia], p.posto, tipo, c ? c.latitude : Number(p.latitude), c ? c.longitude : Number(p.longitude),
      PREVISTO[p.codigo] || 3, tipo === 'avancado' ? 'nenhuma' : (ENERGIA[p.codigo] || 'rede'), p.sazonal === 'sim',
      c || p.precisao === 'conferida' ? 'conferida' : 'aproximada', p.observacao || null]);
    postoId[p.codigo] = r.id; tipoDe[p.codigo] = tipo;
    if (tipo !== 'avancado') {
      const [t] = await query('INSERT INTO terminais (posto_id, codigo, online, ultima_comunicacao) VALUES ($1,$2,TRUE,$3) RETURNING id', [r.id, 'T-' + p.codigo, ts(INICIO_PADRAO)]);
      termId[p.codigo] = t.id;
    }
  }

  // Guarda-vidas, cada um com sua pulseira.
  const totalEscalados = POSTOS.reduce((s, p) => s + (PREVISTO[p.codigo] || 3), 0);
  const codigos = new Set([417, 388]);
  while (codigos.size < totalEscalados + 22) codigos.add(int(101, 989));
  const lista = [...codigos].filter((c) => c !== 417 && c !== 388).sort(() => rnd() - 0.5);
  const nomesUsados = new Set();
  const novoNome = () => { let n; do { n = NOMES[int(0, NOMES.length - 1)] + ' ' + SOBRENOMES[int(0, SOBRENOMES.length - 1)]; } while (nomesUsados.has(n)); nomesUsados.add(n); return n; };
  const pulseiraDe = {};
  async function novoGV(cod, vinculo, situacao = 'ativo', nome = null) {
    const codigo = 'GV ' + String(cod).padStart(4, '0');
    const [g] = await query('INSERT INTO guarda_vidas (codigo, nome, vinculo, situacao) VALUES ($1,$2,$3,$4) RETURNING id', [codigo, nome || novoNome(), vinculo, situacao]);
    const [p] = await query("INSERT INTO pulseiras (guarda_vidas_id, numero_chip, tipo, situacao, emitida_em) VALUES ($1,$2,'pulseira',$3,$4) RETURNING id",
      [g.id, chip(), situacao === 'ativo' ? 'ativa' : 'inativa', emissao]);
    pulseiraDe[g.id] = p.id;
    return g.id;
  }

  // Contas de demonstração.
  const hash = await bcrypt.hash(SENHA_DEMO, 10);
  const [adm] = await query("INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ('Cb. R. Teixeira (fictício)','admin@sigpo.demo',$1,'admin') RETURNING id", [hash]);
  const [sup] = await query("INSERT INTO usuarios (nome, email, senha_hash, perfil, regiao_id) VALUES ('Sgt. P. Ramos (fictício)','supervisor@sigpo.demo',$1,'supervisor','L') RETURNING id", [hash]);

  // Escala do dia: em cada posto, um chefe de posto (militar) e guarda-vidas civis voluntários.
  const escalaDe = {}; let k = 0; let gv417 = null; let gv388 = null;
  for (const p of POSTOS) {
    const [e] = await query('INSERT INTO escalas (posto_id, data, versao, publicada_em, publicada_por, justificativa) VALUES ($1,$2,1,$3,$4,$5) RETURNING id',
      [postoId[p.codigo], hoje, ontem18h, adm.id, 'Escala do dia publicada']);
    escalaDe[p.codigo] = [];
    for (let i = 0; i < (PREVISTO[p.codigo] || 3); i++) {
      let id;
      if (p.codigo === 'L08' && i === 1) { id = await novoGV(417, 'GVCV', 'ativo', 'Rafael Lima'); gv417 = id; }
      else if (p.codigo === 'L08' && i === 3) { id = await novoGV(388, 'GVCV'); gv388 = id; }
      else id = await novoGV(lista[k++], i === 0 ? 'Militar' : 'GVCV');
      const inicio = p.codigo === 'L08' && i === 3 ? '10:00' : '08:00';
      await query('INSERT INTO escala_itens (escala_id, guarda_vidas_id, funcao, inicio, fim) VALUES ($1,$2,$3,$4,$5)',
        [e.id, id, i === 0 ? 'Chefe de posto' : 'Guarda-vidas', inicio, '19:00']);
      escalaDe[p.codigo].push(id);
    }
  }
  for (let i = 0; i < 20; i++) await novoGV(lista[k++], 'GVCV'); // reserva, sem escala hoje
  for (let i = 0; i < 2; i++) await novoGV(lista[k++], 'GVCV', 'afastado');
  await query("INSERT INTO usuarios (nome, email, senha_hash, perfil, guarda_vidas_id) VALUES ('Rafael Lima (fictício)','gv0417@sigpo.demo',$1,'guarda_vidas',$2)", [hash, gv417]);

  // Pulseira perdida ontem: bloqueada e cartão reserva ativado.
  const perdeu = escalaDe.N01[2];
  await query("UPDATE pulseiras SET situacao='bloqueada', motivo='Perda informada pelo guarda-vidas' WHERE id=$1", [pulseiraDe[perdeu]]);
  const [reserva] = await query("INSERT INTO pulseiras (guarda_vidas_id, numero_chip, tipo, situacao, emitida_em) VALUES ($1,$2,'cartao_reserva','ativa',$3) RETURNING id", [perdeu, chip(), hoje]);
  pulseiraDe[perdeu] = reserva.id;

  const pendentes = new Set([escalaDe.N19[2], escalaDe.N16[3], escalaDe.N17[1], escalaDe.L01[3], escalaDe.L07[4], gv388, escalaDe.S02[3], escalaDe.S07[2], escalaDe.S10[1]]);
  const atrasados = new Set([escalaDe.N04[3], escalaDe.L03[2], escalaDe.S06[2], escalaDe.S01[1]]);
  const transferido = escalaDe.N05[3];

  async function registro(tipo, gv, codigo, min, extra = {}) {
    await query(`INSERT INTO registros (codigo_unico, tipo, guarda_vidas_id, pulseira_id, terminal_id, posto_id, hora_leitura, hora_recebida, origem, situacao, observacoes, justificativa, autor_id, transito)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'valido',$10,$11,$12,$13)`,
    [crypto.randomUUID(), tipo, gv, extra.origem === 'manual' ? null : pulseiraDe[gv], termId[codigo] || null, postoId[codigo], ts(min), ts(min + (extra.atraso || 0)),
      extra.origem || 'nfc', extra.obs || null, extra.just || null, extra.autor || null, !!extra.transito]);
  }
  for (const p of POSTOS) {
    for (const gv of escalaDe[p.codigo]) {
      if (pendentes.has(gv)) continue;
      if (tipoDe[p.codigo] === 'avancado') {
        const autor = p.codigo.startsWith('L') ? sup.id : adm.id;
        await registro('apresentacao', gv, p.codigo, 486, { origem: 'manual', just: 'Posto avançado sem terminal: confirmado pelo rádio', autor, atraso: 1 });
        continue;
      }
      await registro('apresentacao', gv, p.codigo, atrasados.has(gv) ? int(492, 504) : int(460, 481));
    }
  }

  // Transferência concluída: Canasvieiras Posto Trapiche → Posto Central (10:20 a 10:28).
  const motivo = 'Reforço em Canasvieiras, Posto Central (maior movimento)';
  await registro('saida', transferido, 'N05', 622, { transito: true, obs: 'Saída para Canasvieiras, Posto Central' });
  await registro('apresentacao', transferido, 'N04', 628, { obs: 'Chegada de transferência' });
  const [eOrigem] = await query('INSERT INTO escalas (posto_id, data, versao, publicada_em, publicada_por, justificativa) VALUES ($1,$2,2,$3,$4,$5) RETURNING id', [postoId.N05, hoje, ts(620), adm.id, motivo]);
  const [eDestino] = await query('INSERT INTO escalas (posto_id, data, versao, publicada_em, publicada_por, justificativa) VALUES ($1,$2,2,$3,$4,$5) RETURNING id', [postoId.N04, hoje, ts(620), adm.id, motivo]);
  await query(`INSERT INTO escala_itens (escala_id, guarda_vidas_id, funcao, inicio, fim)
    SELECT $1, ei.guarda_vidas_id, ei.funcao, ei.inicio, ei.fim FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id
    WHERE e.posto_id = $2 AND e.data = $3 AND e.versao = 1 AND ei.guarda_vidas_id <> $4`, [eOrigem.id, postoId.N05, hoje, transferido]);
  await query(`INSERT INTO escala_itens (escala_id, guarda_vidas_id, funcao, inicio, fim)
    SELECT $1, ei.guarda_vidas_id, ei.funcao, ei.inicio, ei.fim FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id
    WHERE e.posto_id = $2 AND e.data = $3 AND e.versao = 1`, [eDestino.id, postoId.N04, hoje]);
  await query("INSERT INTO escala_itens (escala_id, guarda_vidas_id, funcao, inicio, fim) VALUES ($1,$2,'Guarda-vidas','08:00','19:00')", [eDestino.id, transferido]);
  await query(`INSERT INTO movimentacoes (data, tipo, guarda_vidas_id, origem_id, destino_id, situacao, motivo, criada_em, criada_por, saida_em, chegada_em)
    VALUES ($1,'transferencia',$2,$3,$4,'concluida',$5,$6,$7,$8,$9)`,
  [hoje, transferido, postoId.N05, postoId.N04, motivo, ts(620), adm.id, ts(622), ts(628)]);

  // Intervalos em andamento.
  await registro('intervalo', escalaDe.N15[2], 'N15', 615);
  await registro('intervalo', escalaDe.S03[3], 'S03', 622);

  // Terminal da Praia Mole (Posto Central) sem sinal desde 09:33.
  await query('UPDATE terminais SET online=FALSE, offline_desde=$1, ultima_comunicacao=$1 WHERE id=$2', [ts(573), termId.L05]);

  // Alertas já existentes.
  for (const gv of pendentes) {
    const [it] = await query(`SELECT e.posto_id, ei.inicio FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id WHERE ei.guarda_vidas_id=$1 AND e.data=$2 ORDER BY e.versao DESC LIMIT 1`, [gv, hoje]);
    const ini = String(it.inicio).slice(0, 5) === '10:00' ? 600 : 480;
    await query("INSERT INTO alertas (chave, tipo, posto_id, guarda_vidas_id, titulo, criado_em) VALUES ($1,'pendente',$2,$3,'Confirmação pendente',$4)", ['pend:' + gv + ':' + hoje, it.posto_id, gv, ts(ini + 10)]);
  }
  await query("INSERT INTO alertas (chave, tipo, posto_id, titulo, detalhe, criado_em) VALUES ($1,'offline',$2,'Terminal sem sinal','Sem comunicação desde 09:33. Os registros ficam guardados no aparelho.',$3)", ['off:' + termId.L05 + ':' + ts(573), postoId.L05, ts(593)]);
  await query("INSERT INTO alertas (chave, tipo, posto_id, titulo, detalhe, criado_em, situacao, tratado_por, tratado_em) VALUES ($1,'escala',$2,'Escala alterada',$3,$4,'reconhecido',$5,$6)",
    ['esc:' + postoId.N05 + ':2', postoId.N05, 'Versão 2: transferência para Canasvieiras, Posto Central (reforço).', ts(620), adm.id, ts(622)]);
  await query("INSERT INTO alertas (chave, tipo, posto_id, titulo, detalhe, criado_em) VALUES ($1,'abaixo',$2,'Posto abaixo do previsto','3 de 4 previstos no posto. Sugerir reforço.',$3)", ['abaixo:' + postoId.N05 + ':' + hoje, postoId.N05, ts(625)]);

  // Auditoria inicial.
  const aud = (min, nome, acao, objeto, detalhe, quem) => query('INSERT INTO auditoria (usuario_id, usuario_nome, acao, objeto, detalhe, criado_em) VALUES ($1,$2,$3,$4,$5,$6)', [quem, nome, acao, objeto, detalhe, min === null ? ontem18h : ts(min)]);
  await aud(null, 'Cb. R. Teixeira (fictício)', 'Publicou escalas', `${POSTOS.length} postos`, 'Versão 1 das escalas do dia', adm.id);
  await aud(486, 'Sgt. P. Ramos (fictício)', 'Registro manual', 'Joaquina, Posto Avançado Dunas', '2 apresentações: posto avançado sem terminal', sup.id);
  await aud(620, 'Cb. R. Teixeira (fictício)', 'Criou transferência', 'Canasvieiras: Posto Trapiche → Posto Central', motivo, adm.id);

  return { data: hoje, postos: POSTOS.length, escalados: totalEscalados };
}
