// Servidor do SIGPO-GV Web.  Uso: npm run dev (desenvolvimento) ou npm start (publicação).
import express from 'express';
import cookieSession from 'cookie-session';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conectar, query, tipoBanco } from './db.js';
import { criarDemonstracao, versaoDosDados } from './dados-demo.js';
import { hojeEmFlorianopolis, limparCache } from './relogio.js';
import { renderizar, paginaPraia } from './paginas.js';
import rotasPublicas from './rotas/publico.js';
import rotasAuth, { usuarioDaSessao } from './rotas/auth.js';
import rotasAdmin, { ajusteLigado } from './rotas/admin.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.env.PORT) || 3000;
const PRODUCAO = process.env.NODE_ENV === 'production';

const app = express();
app.set('trust proxy', 1); // no Render, o site fica atrás de um proxy HTTPS
app.disable('x-powered-by');

// Cabeçalhos de segurança: o navegador só carrega scripts do próprio site e mapas do OpenStreetMap.
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://*.tile.openstreetmap.org; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  });
  next();
});

app.use(express.json({ limit: '20kb' }));
app.use(cookieSession({
  name: 'sigpo',
  keys: [process.env.SESSAO_SEGREDO || crypto.randomBytes(32).toString('hex')],
  httpOnly: true,
  sameSite: 'lax',
  secure: PRODUCAO,
  maxAge: 8 * 60 * 60 * 1000, // 8 horas
}));

// A demonstração "renasce" todo dia: se a data guardada não é a de hoje, os dados são recriados.
let verificadoEm = 0; let recriando = null;
async function garantirDemonstracao() {
  if (Date.now() - verificadoEm < 60_000) return;
  if (recriando) return recriando;
  recriando = (async () => {
    let c = {};
    try {
      const linhas = await query("SELECT chave, valor FROM config WHERE chave IN ('demo_data', 'demo_versao')");
      c = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
    } catch { /* banco vazio */ }
    const hoje = hojeEmFlorianopolis();
    if (c.demo_data !== hoje || c.demo_versao !== versaoDosDados()) {
      const motivo = !c.demo_data ? 'banco vazio' : c.demo_data !== hoje ? `novo dia (${hoje})` : 'nova versão dos dados';
      console.log(`Criando a demonstração (${motivo})...`);
      await criarDemonstracao();
    }
    limparCache();
    verificadoEm = Date.now();
  })().finally(() => { recriando = null; });
  return recriando;
}
app.use(async (req, res, next) => {
  if (req.path.startsWith('/assets') || req.path.startsWith('/vendor')) return next();
  await garantirDemonstracao();
  next();
});

// Arquivos estáticos (CSS, JS, imagens, fontes, Leaflet).
const umDia = PRODUCAO ? '1d' : 0;
app.use('/assets', express.static(path.join(raiz, 'public'), { maxAge: umDia }));
app.use('/vendor/leaflet', express.static(path.join(raiz, 'node_modules/leaflet/dist'), { maxAge: umDia }));
app.use('/vendor/fontes/barlow', express.static(path.join(raiz, 'node_modules/@fontsource/barlow/files'), { maxAge: umDia }));
app.use('/vendor/fontes/barlow-condensed', express.static(path.join(raiz, 'node_modules/@fontsource/barlow-condensed/files'), { maxAge: umDia }));

// API
app.use('/api/publico', rotasPublicas);
app.use('/api/auth', rotasAuth);
app.use('/api/admin', rotasAdmin);
app.get('/api/status', (req, res) => res.json({ ok: true, banco: tipoBanco() }));
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// Páginas
app.get('/', (req, res) => res.send(renderizar('inicio')));
app.get('/praias', (req, res) => res.send(renderizar('praias')));
app.get('/praias/:slug', async (req, res) => {
  const html = await paginaPraia(req.params.slug);
  if (!html) return res.status(404).send(renderizar('404'));
  res.send(html);
});
app.get('/seguranca', (req, res) => res.send(renderizar('seguranca')));
app.get('/sobre', (req, res) => res.send(renderizar('sobre')));
app.get('/entrar', async (req, res) => {
  if (await usuarioDaSessao(req)) return res.redirect('/painel');
  res.send(renderizar('entrar'));
});
app.get('/painel', async (req, res) => {
  if (!(await usuarioDaSessao(req))) return res.redirect('/entrar');
  res.send(renderizar('painel'));
});
app.get('/painel/posicoes', async (req, res) => {
  const u = await usuarioDaSessao(req);
  if (!u) return res.redirect('/entrar');
  if (u.perfil !== 'admin') return res.status(403).send(renderizar('404'));
  res.send(renderizar('posicoes'));
});
app.use((req, res) => res.status(404).send(renderizar('404')));

// Erros inesperados: registra no console e responde sem expor detalhes internos.
app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api')) return res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
  res.status(500).send('Erro interno. Tente novamente.');
});

await conectar();
await garantirDemonstracao();
app.listen(PORTA, () => {
  console.log(`SIGPO-GV Web em http://localhost:${PORTA}  (banco: ${tipoBanco()})`);
  if (ajusteLigado()) console.log('Ajuste de posições dos postos ligado: entre como admin e abra /painel/posicoes');
});
