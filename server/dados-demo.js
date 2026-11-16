// Cria o banco do zero com os dados fictícios da demonstração.
// As praias existem; postos, pessoas, códigos e números são inventados.
// O cenário reproduz o painel da apresentação: 32 postos, 128 escalados, 119 confirmados e 9 pendências às 10:30.
import fs from 'node:fs';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { exec, query } from './db.js';
import { INICIO_PADRAO, carimbo, hojeEmFlorianopolis, limparCache } from './relogio.js';

const SCHEMA = new URL('./sql/schema.sql', import.meta.url);
export const SENHA_DEMO = 'demo1234';

// slug, nome, região, latitude, longitude, direção da faixa de areia ('ns' norte-sul, 'lo' leste-oeste)
// Coordenadas aproximadas, só para a demonstração.
const PRAIAS = [
  ['jurere', 'Jurerê', 'N', -27.4392, -48.4997, 'lo'],
  ['daniela', 'Daniela', 'N', -27.4490, -48.5270, 'lo'],
  ['canasvieiras', 'Canasvieiras', 'N', -27.4270, -48.4620, 'lo'],
  ['ponta-das-canas', 'Ponta das Canas', 'N', -27.3940, -48.4300, 'lo'],
  ['brava', 'Brava', 'N', -27.3985, -48.4160, 'ns'],
  ['ingleses', 'Ingleses', 'N', -27.4330, -48.3940, 'ns'],
  ['santinho', 'Santinho', 'N', -27.4640, -48.3760, 'ns'],
  ['mocambique', 'Moçambique', 'L', -27.5150, -48.3990, 'ns'],
  ['barra-da-lagoa', 'Barra da Lagoa', 'L', -27.5750, -48.4220, 'ns'],
  ['mole', 'Mole', 'L', -27.6020, -48.4330, 'ns'],
  ['joaquina', 'Joaquina', 'L', -27.6295, -48.4490, 'ns'],
  ['lagoa-da-conceicao', 'Lagoa da Conceição', 'L', -27.6000, -48.4740, 'ns'],
  ['campeche', 'Campeche', 'S', -27.6830, -48.4800, 'ns'],
  ['morro-das-pedras', 'Morro das Pedras', 'S', -27.7140, -48.5040, 'ns'],
  ['armacao', 'Armação', 'S', -27.7470, -48.5050, 'ns'],
  ['matadeiro', 'Matadeiro', 'S', -27.7540, -48.4995, 'ns'],
  ['lagoinha-do-leste', 'Lagoinha do Leste', 'S', -27.7715, -48.4860, 'ns'],
  ['pantano-do-sul', 'Pântano do Sul', 'S', -27.7820, -48.5080, 'lo'],
  ['acores', 'Açores', 'S', -27.7860, -48.5225, 'lo'],
  ['solidao', 'Solidão', 'S', -27.7985, -48.5310, 'lo'],
];

// chave, praia, nome, previsto, energia, tipo
const POSTOS = [
  ['N01', 'jurere', 'Posto 01', 5, 'rede', 'guarita'], ['N02', 'jurere', 'Posto 02', 4, 'rede', 'guarita'],
  ['N03', 'daniela', 'Posto 01', 3, 'rede', 'guarita'], ['N04', 'canasvieiras', 'Posto 01', 5, 'rede', 'guarita'],
  ['N05', 'canasvieiras', 'Posto 02', 5, 'rede', 'guarita'], ['N06', 'canasvieiras', 'Posto 03', 5, 'rede', 'guarita'],
  ['N07', 'ponta-das-canas', 'Posto 01', 3, 'rede', 'guarita'], ['N08', 'brava', 'Posto 01', 5, 'rede', 'guarita'],
  ['N09', 'ingleses', 'Posto 01', 4, 'rede', 'guarita'], ['N10', 'ingleses', 'Posto 02', 5, 'rede', 'guarita'],
  ['N11', 'santinho', 'Posto 01', 5, 'bateria', 'guarita'], ['L01', 'mocambique', 'Posto 01', 5, 'bateria', 'guarita'],
  ['L02', 'mocambique', 'Posto 02', 3, 'bateria', 'guarita'], ['L03', 'barra-da-lagoa', 'Posto 01', 3, 'rede', 'guarita'],
  ['L04', 'barra-da-lagoa', 'Posto 02', 5, 'rede', 'guarita'], ['L05', 'mole', 'Posto 01', 3, 'rede', 'guarita'],
  ['L06', 'joaquina', 'Posto 01', 6, 'rede', 'guarita'], ['L07', 'joaquina', 'Posto 02', 4, 'rede', 'guarita'],
  ['L08', 'joaquina', 'Avançado Dunas', 2, 'nenhuma', 'avancado'], ['L09', 'lagoa-da-conceicao', 'Posto 01', 4, 'rede', 'guarita'],
  ['L10', 'joaquina', 'Posto 03', 4, 'rede', 'guarita'], ['S01', 'campeche', 'Posto 01', 5, 'rede', 'guarita'],
  ['S02', 'campeche', 'Posto 02', 5, 'rede', 'guarita'], ['S03', 'campeche', 'Posto 03', 4, 'rede', 'guarita'],
  ['S04', 'campeche', 'Posto 04', 4, 'rede', 'guarita'], ['S05', 'morro-das-pedras', 'Posto 01', 5, 'rede', 'guarita'],
  ['S06', 'armacao', 'Posto 01', 3, 'rede', 'guarita'], ['S07', 'matadeiro', 'Posto 01', 3, 'bateria', 'guarita'],
  ['S08', 'lagoinha-do-leste', 'Posto 01', 3, 'solar', 'guarita'], ['S09', 'pantano-do-sul', 'Posto 01', 3, 'rede', 'guarita'],
  ['S10', 'acores', 'Posto 01', 3, 'rede', 'guarita'], ['S11', 'solidao', 'Posto 01', 2, 'bateria', 'guarita'],
];

const NOMES = ['Ana', 'Bruno', 'Camila', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas',
  'Mariana', 'Nicolas', 'Olívia', 'Pedro', 'Rafaela', 'Samuel', 'Tainá', 'Vitor', 'Yasmin', 'Arthur', 'Beatriz', 'Caio', 'Débora',
  'Enzo', 'Fernanda', 'Guilherme', 'Helena', 'Igor', 'Júlia', 'Kauã', 'Larissa', 'Mateus', 'Natália', 'Otávio', 'Paula', 'Renan',
  'Sofia', 'Thiago', 'Valentina', 'William', 'Alice', 'Bernardo', 'Clara', 'Davi', 'Elisa', 'Fábio', 'Giovana', 'Heitor', 'Lívia', 'Miguel'];
const SOBRENOMES = ['Silva', 'Souza', 'Oliveira', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo',
  'Fernandes', 'Carvalho', 'Gomes', 'Martins', 'Rocha', 'Ribeiro', 'Alves', 'Monteiro', 'Mendes', 'Barros', 'Freitas', 'Barbosa',
  'Pinto', 'Moura', 'Dias', 'Castro', 'Campos', 'Cardoso', 'Teixeira', 'Vieira', 'Machado', 'Schmitt', 'Becker', 'Koch', 'Werner'];

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

  await query('INSERT INTO config (chave, valor) VALUES ($1,$2),($3,$4),($5,$6)',
    ['demo_data', hoje, 'demo_inicio_real', String(Date.now()), 'demo_inicio_min', String(INICIO_PADRAO)]);
  await query("INSERT INTO regioes (id, nome) VALUES ('N','Norte'),('L','Leste'),('S','Sul')");

  const praiaId = {}; const praiaInfo = {};
  for (const [slug, nome, reg, lat, lng, dir] of PRAIAS) {
    const [r] = await query('INSERT INTO praias (nome, slug, regiao_id, latitude, longitude) VALUES ($1,$2,$3,$4,$5) RETURNING id', [nome, slug, reg, lat, lng]);
    praiaId[slug] = r.id; praiaInfo[slug] = { lat, lng, dir, usados: 0, total: POSTOS.filter((p) => p[1] === slug && p[5] !== 'avancado').length };
  }

  const postoId = {}; const termId = {};
  for (const [chave, slug, nome, previsto, energia, tipo] of POSTOS) {
    const pi = praiaInfo[slug];
    let lat = pi.lat, lng = pi.lng;
    if (tipo === 'avancado') { lat += 0.006; lng -= 0.004; }
    else {
      const desloc = (pi.usados - (pi.total - 1) / 2) * 0.006; pi.usados++;
      if (pi.dir === 'ns') lat += desloc; else lng += desloc;
    }
    const [r] = await query('INSERT INTO postos (praia_id, nome, tipo, latitude, longitude, previsto, energia) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [praiaId[slug], nome, tipo, lat, lng, previsto, energia]);
    postoId[chave] = r.id;
    if (tipo !== 'avancado') {
      const [t] = await query('INSERT INTO terminais (posto_id, codigo, online, ultima_comunicacao) VALUES ($1,$2,TRUE,$3) RETURNING id', [r.id, 'T-' + chave, ts(INICIO_PADRAO)]);
      termId[chave] = t.id;
    }
  }

  // Guarda-vidas, cada um com sua pulseira.
  const codigos = new Set([417, 388]);
  while (codigos.size < 152) codigos.add(int(101, 989));
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
  for (const [chave, , , previsto] of POSTOS) {
    const [e] = await query('INSERT INTO escalas (posto_id, data, versao, publicada_em, publicada_por, justificativa) VALUES ($1,$2,1,$3,$4,$5) RETURNING id',
      [postoId[chave], hoje, ontem18h, adm.id, 'Escala do dia publicada']);
    escalaDe[chave] = [];
    for (let i = 0; i < previsto; i++) {
      let id;
      if (chave === 'L07' && i === 1) { id = await novoGV(417, 'GVCV', 'ativo', 'Rafael Lima'); gv417 = id; }
      else if (chave === 'L07' && i === 3) { id = await novoGV(388, 'GVCV'); gv388 = id; }
      else id = await novoGV(lista[k++], i === 0 ? 'Militar' : 'GVCV');
      const inicio = chave === 'L07' && i === 3 ? '10:00' : '08:00';
      await query('INSERT INTO escala_itens (escala_id, guarda_vidas_id, funcao, inicio, fim) VALUES ($1,$2,$3,$4,$5)',
        [e.id, id, i === 0 ? 'Chefe de posto' : 'Guarda-vidas', inicio, '19:00']);
      escalaDe[chave].push(id);
    }
  }
  for (let i = 0; i < 22; i++) await novoGV(lista[k++], 'GVCV'); // reserva, sem escala hoje
  for (let i = 0; i < 2; i++) await novoGV(lista[k++], 'GVCV', 'afastado');
  await query("INSERT INTO usuarios (nome, email, senha_hash, perfil, guarda_vidas_id) VALUES ('Rafael Lima (fictício)','gv0417@sigpo.demo',$1,'guarda_vidas',$2)", [hash, gv417]);

  // Pulseira perdida ontem: bloqueada e cartão reserva ativado.
  const perdeu = escalaDe.N02[2];
  await query("UPDATE pulseiras SET situacao='bloqueada', motivo='Perda informada pelo guarda-vidas' WHERE id=$1", [pulseiraDe[perdeu]]);
  const [reserva] = await query("INSERT INTO pulseiras (guarda_vidas_id, numero_chip, tipo, situacao, emitida_em) VALUES ($1,$2,'cartao_reserva','ativa',$3) RETURNING id", [perdeu, chip(), hoje]);
  pulseiraDe[perdeu] = reserva.id;

  const pendentes = new Set([escalaDe.N03[2], escalaDe.N10[3], escalaDe.N11[4], escalaDe.L02[1], escalaDe.L06[5], gv388, escalaDe.S02[3], escalaDe.S06[2], escalaDe.S09[1]]);
  const atrasados = new Set([escalaDe.N05[3], escalaDe.L04[2], escalaDe.S05[4], escalaDe.S03[1]]);
  const transferido = escalaDe.N06[4];

  async function registro(tipo, gv, chave, min, extra = {}) {
    await query(`INSERT INTO registros (codigo_unico, tipo, guarda_vidas_id, pulseira_id, terminal_id, posto_id, hora_leitura, hora_recebida, origem, situacao, observacoes, justificativa, autor_id, transito)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'valido',$10,$11,$12,$13)`,
      [crypto.randomUUID(), tipo, gv, extra.origem === 'manual' ? null : pulseiraDe[gv], termId[chave] || null, postoId[chave], ts(min), ts(min + (extra.atraso || 0)),
        extra.origem || 'nfc', extra.obs || null, extra.just || null, extra.autor || null, !!extra.transito]);
  }
  for (const [chave, , , , , tipo] of POSTOS) {
    for (const gv of escalaDe[chave]) {
      if (pendentes.has(gv)) continue;
      if (tipo === 'avancado') { await registro('apresentacao', gv, chave, 486, { origem: 'manual', just: 'Posto avançado sem terminal: confirmado pelo rádio', autor: sup.id, atraso: 1 }); continue; }
      await registro('apresentacao', gv, chave, atrasados.has(gv) ? int(492, 504) : int(460, 481));
    }
  }

  // Transferência concluída: Canasvieiras Posto 03 → Posto 01 (10:20 a 10:28).
  await registro('saida', transferido, 'N06', 622, { transito: true, obs: 'Saída para Canasvieiras P01' });
  await registro('apresentacao', transferido, 'N04', 628, { obs: 'Chegada de transferência' });
  const [e6] = await query("INSERT INTO escalas (posto_id, data, versao, publicada_em, publicada_por, justificativa) VALUES ($1,$2,2,$3,$4,'Reforço em Canasvieiras P01 (maior movimento)') RETURNING id", [postoId.N06, hoje, ts(620), adm.id]);
  const [e4] = await query("INSERT INTO escalas (posto_id, data, versao, publicada_em, publicada_por, justificativa) VALUES ($1,$2,2,$3,$4,'Reforço em Canasvieiras P01 (maior movimento)') RETURNING id", [postoId.N04, hoje, ts(620), adm.id]);
  await query(`INSERT INTO escala_itens (escala_id, guarda_vidas_id, funcao, inicio, fim)
    SELECT $1, ei.guarda_vidas_id, ei.funcao, ei.inicio, ei.fim FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id
    WHERE e.posto_id = $2 AND e.data = $3 AND e.versao = 1 AND ei.guarda_vidas_id <> $4`, [e6.id, postoId.N06, hoje, transferido]);
  await query(`INSERT INTO escala_itens (escala_id, guarda_vidas_id, funcao, inicio, fim)
    SELECT $1, ei.guarda_vidas_id, ei.funcao, ei.inicio, ei.fim FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id
    WHERE e.posto_id = $2 AND e.data = $3 AND e.versao = 1`, [e4.id, postoId.N04, hoje]);
  await query("INSERT INTO escala_itens (escala_id, guarda_vidas_id, funcao, inicio, fim) VALUES ($1,$2,'Guarda-vidas','08:00','19:00')", [e4.id, transferido]);
  await query(`INSERT INTO movimentacoes (data, tipo, guarda_vidas_id, origem_id, destino_id, situacao, motivo, criada_em, criada_por, saida_em, chegada_em)
    VALUES ($1,'transferencia',$2,$3,$4,'concluida','Reforço em Canasvieiras P01 (maior movimento)',$5,$6,$7,$8)`,
    [hoje, transferido, postoId.N06, postoId.N04, ts(620), adm.id, ts(622), ts(628)]);

  // Intervalos em andamento.
  await registro('intervalo', escalaDe.N09[2], 'N09', 615);
  await registro('intervalo', escalaDe.S01[3], 'S01', 622);

  // Terminal da Mole sem sinal desde 09:33.
  await query('UPDATE terminais SET online=FALSE, offline_desde=$1, ultima_comunicacao=$1 WHERE id=$2', [ts(573), termId.L05]);

  // Alertas já existentes.
  for (const gv of pendentes) {
    const [it] = await query(`SELECT e.posto_id, ei.inicio FROM escala_itens ei JOIN escalas e ON e.id = ei.escala_id WHERE ei.guarda_vidas_id=$1 AND e.data=$2 ORDER BY e.versao DESC LIMIT 1`, [gv, hoje]);
    const ini = String(it.inicio).slice(0, 5) === '10:00' ? 600 : 480;
    await query("INSERT INTO alertas (chave, tipo, posto_id, guarda_vidas_id, titulo, criado_em) VALUES ($1,'pendente',$2,$3,'Confirmação pendente',$4)", ['pend:' + gv + ':' + hoje, it.posto_id, gv, ts(ini + 10)]);
  }
  await query("INSERT INTO alertas (chave, tipo, posto_id, titulo, detalhe, criado_em) VALUES ($1,'offline',$2,'Terminal sem sinal','Sem comunicação desde 09:33. Os registros ficam guardados no aparelho.',$3)", ['off:' + termId.L05 + ':' + ts(573), postoId.L05, ts(593)]);
  await query("INSERT INTO alertas (chave, tipo, posto_id, titulo, detalhe, criado_em, situacao, tratado_por, tratado_em) VALUES ($1,'escala',$2,'Escala alterada','Versão 2: transferência para Canasvieiras P01 (reforço).',$3,'reconhecido',$4,$5)", ['esc:' + postoId.N06 + ':2', postoId.N06, ts(620), adm.id, ts(622)]);
  await query("INSERT INTO alertas (chave, tipo, posto_id, titulo, detalhe, criado_em) VALUES ($1,'abaixo',$2,'Posto abaixo do previsto','4 de 5 previstos no posto. Sugerir reforço.',$3)", ['abaixo:' + postoId.N06 + ':' + hoje, postoId.N06, ts(625)]);

  // Auditoria inicial.
  const aud = (min, nome, acao, objeto, detalhe, quem) => query('INSERT INTO auditoria (usuario_id, usuario_nome, acao, objeto, detalhe, criado_em) VALUES ($1,$2,$3,$4,$5,$6)', [quem, nome, acao, objeto, detalhe, min === null ? ontem18h : ts(min)]);
  await aud(null, 'Cb. R. Teixeira (fictício)', 'Publicou escalas', '32 postos', 'Versão 1 das escalas do dia', adm.id);
  await aud(486, 'Sgt. P. Ramos (fictício)', 'Registro manual', 'Joaquina · Avançado Dunas', '2 apresentações: posto avançado sem terminal', sup.id);
  await aud(620, 'Cb. R. Teixeira (fictício)', 'Criou transferência', 'Canasvieiras P03 → P01', 'Reforço em Canasvieiras P01 (maior movimento)', adm.id);

  return { data: hoje, postos: POSTOS.length };
}
