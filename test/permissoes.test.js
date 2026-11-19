// Testes automáticos: sobem o servidor com um banco novo de demonstração e conferem
// as permissões dos três perfis e algumas validações de formulário.
// Uso: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORTA = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORTA}`;
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'sigpo-teste-'));
let servidor;

before(async () => {
  servidor = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORTA), PASTA_DADOS: pasta, NODE_ENV: 'test', DATABASE_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Espera o servidor avisar que está no ar (na primeira vez ele cria o banco).
  await new Promise((ok, erro) => {
    const limite = setTimeout(() => erro(new Error('O servidor não subiu em 90 segundos.')), 90_000);
    servidor.stdout.on('data', (d) => { if (String(d).includes('SIGPO-GV Web em')) { clearTimeout(limite); ok(); } });
    servidor.on('exit', (c) => erro(new Error('O servidor parou com código ' + c)));
  });
}, { timeout: 100_000 });

after(() => {
  servidor?.kill();
  fs.rmSync(pasta, { recursive: true, force: true });
});

// Faz login e devolve uma função para chamar o site com o cookie da sessão.
async function entrar(email) {
  const r = await fetch(BASE + '/api/auth/entrar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha: 'demo1234' }),
  });
  assert.equal(r.status, 200, `login de ${email}`);
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return (caminho, opcoes = {}) => fetch(BASE + caminho, {
    redirect: 'manual', ...opcoes, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(opcoes.headers || {}) },
  });
}
const json = (r) => r.json();

test('site público abre e não expõe nomes de pessoas', async () => {
  const r = await fetch(BASE + '/api/publico/situacao');
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(d.postos.length > 0);
  for (const p of d.postos) assert.equal(p.pessoas, undefined, 'a API pública não pode trazer a lista de pessoas');
});

test('senha errada é recusada', async () => {
  const r = await fetch(BASE + '/api/auth/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@sigpo.demo', senha: 'errada' }) });
  assert.equal(r.status, 401);
});

test('sem login, as rotas internas respondem 401', async () => {
  for (const p of ['/api/painel/visao', '/api/admin/guarda-vidas', '/api/gv/inicio']) {
    assert.equal((await fetch(BASE + p)).status, 401, p);
  }
});

test('cada perfil é levado ao seu painel', async () => {
  const esperado = { 'admin@sigpo.demo': '/painel/admin', 'supervisor@sigpo.demo': '/painel/supervisao', 'gv0417@sigpo.demo': '/painel/meu' };
  for (const [email, destino] of Object.entries(esperado)) {
    const r = await (await entrar(email))('/painel');
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), destino);
  }
});

test('administração vê todas as regiões', async () => {
  const adm = await entrar('admin@sigpo.demo');
  const d = await json(await adm('/api/painel/visao'));
  assert.ok(new Set(d.postos.map((p) => p.regiao_id)).size >= 3);
});

test('supervisão vê só a própria região, mesmo pedindo outra', async () => {
  const sup = await entrar('supervisor@sigpo.demo');
  const d = await json(await sup('/api/painel/visao?regiao=N'));
  assert.deepEqual([...new Set(d.postos.map((p) => p.regiao_id))], ['L']);
});

test('supervisão não acessa rotas e páginas da administração', async () => {
  const sup = await entrar('supervisor@sigpo.demo');
  for (const p of ['/api/admin/guarda-vidas', '/api/admin/pulseiras', '/api/admin/postos', '/api/admin/auditoria']) {
    assert.equal((await sup(p)).status, 403, p);
  }
  assert.equal((await sup('/painel/guarda-vidas')).status, 403);
});

test('supervisão não faz registro manual em posto de outra região', async () => {
  const adm = await entrar('admin@sigpo.demo');
  const sup = await entrar('supervisor@sigpo.demo');
  const d = await json(await adm('/api/painel/visao'));
  const posto = d.postos.find((p) => p.regiao_id === 'N' && p.pessoas.length);
  const r = await sup('/api/painel/registros/manual', { method: 'POST', body: JSON.stringify({ posto_id: posto.id, guarda_vidas_id: posto.pessoas[0].id, tipo: 'apresentacao', hora: '09:00', justificativa: 'tentativa em outra região' }) });
  assert.ok([403, 404].includes(r.status), `status ${r.status}`);
});

test('registro manual exige justificativa e funciona na própria região', async () => {
  const sup = await entrar('supervisor@sigpo.demo');
  const d = await json(await sup('/api/painel/visao'));
  const posto = d.postos.find((p) => p.pessoas.some((x) => x.chave === 'pendentes')) || d.postos[0];
  const pessoa = posto.pessoas.find((x) => x.chave === 'pendentes') || posto.pessoas[0];
  const corpo = { posto_id: posto.id, guarda_vidas_id: pessoa.id, tipo: 'apresentacao', hora: '09:00' };
  const curta = await sup('/api/painel/registros/manual', { method: 'POST', body: JSON.stringify({ ...corpo, justificativa: 'curta' }) });
  assert.equal(curta.status, 400);
  const ok = await sup('/api/painel/registros/manual', { method: 'POST', body: JSON.stringify({ ...corpo, justificativa: 'Confirmado pelo rádio com o chefe de posto' }) });
  assert.ok([200, 201].includes(ok.status), `status ${ok.status}`);
});

test('guarda-vidas vê só os próprios dados', async () => {
  const gv = await entrar('gv0417@sigpo.demo');
  assert.equal((await gv('/api/gv/inicio')).status, 200);
  for (const p of ['/api/painel/visao', '/api/painel/registros', '/api/admin/postos']) {
    assert.equal((await gv(p)).status, 403, p);
  }
  assert.equal((await gv('/painel/registros')).status, 403);
});

test('guarda-vidas não pede revisão de registro de outra pessoa', async () => {
  const sup = await entrar('supervisor@sigpo.demo');
  const gv = await entrar('gv0417@sigpo.demo');
  const lista = await json(await sup('/api/painel/registros'));
  const registros = lista.registros || lista.itens || lista;
  const alheio = registros.find((r) => r.gv_codigo && r.gv_codigo !== 'GV 0417');
  const r = await gv('/api/gv/revisoes', { method: 'POST', body: JSON.stringify({ motivo: 'horario', registro_id: alheio.id, justificativa: 'tentando revisar o registro de outra pessoa' }) });
  assert.ok(r.status >= 400, `status ${r.status}`);
});
