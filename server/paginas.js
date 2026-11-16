// Monta as páginas HTML: cada página em views/paginas/ é encaixada no molde views/molde.html,
// que tem o cabeçalho, o menu e o rodapé. Assim o menu existe em um só arquivo.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';

const pastaViews = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../views');
const pastaPublica = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const PRODUCAO = process.env.NODE_ENV === 'production';

// Versão dos arquivos de estilo e script. Entra no endereço (site.css?v=...), então o navegador
// baixa a versão nova logo depois de uma atualização, em vez de usar a cópia antiga guardada.
let versaoCache = null;
function versaoDosArquivos() {
  if (PRODUCAO && versaoCache) return versaoCache;
  const h = crypto.createHash('sha1');
  const percorrer = (pasta) => {
    for (const nome of fs.readdirSync(pasta).sort()) {
      const c = path.join(pasta, nome);
      if (fs.statSync(c).isDirectory()) percorrer(c); else h.update(nome).update(fs.readFileSync(c));
    }
  };
  percorrer(pastaPublica);
  versaoCache = h.digest('hex').slice(0, 10);
  return versaoCache;
}

// Dados de cada página: título da aba, descrição, item do menu marcado e scripts.
const PAGINAS = {
  inicio: { titulo: 'Praias de Florianópolis agora', descricao: 'Mapa dos postos de guarda-vidas, situação das praias e orientações de segurança.', menu: 'inicio', scripts: ['/vendor/leaflet/leaflet.js', '/assets/js/mapa.js', '/assets/js/inicio.js'], estilos: ['/vendor/leaflet/leaflet.css'] },
  praias: { titulo: 'Praias e postos', descricao: 'As 42 praias de Florianópolis e a Lagoa da Conceição, com os postos de guarda-vidas.', menu: 'praias', scripts: ['/assets/js/praias.js'] },
  praia: { titulo: 'Praia', descricao: 'Postos de guarda-vidas e efetivo no momento.', menu: 'praias', scripts: ['/vendor/leaflet/leaflet.js', '/assets/js/mapa.js', '/assets/js/praia.js'], estilos: ['/vendor/leaflet/leaflet.css'] },
  seguranca: { titulo: 'Segurança na praia', descricao: 'Bandeiras, correntes de retorno e o que fazer em uma emergência.', menu: 'seguranca' },
  sobre: { titulo: 'Sobre o projeto', descricao: 'O que é o SIGPO-GV Web, como funciona e por que os dados são fictícios.', menu: 'sobre' },
  entrar: { titulo: 'Entrar', descricao: 'Acesso da equipe (contas de demonstração).', menu: 'entrar', scripts: ['/assets/js/entrar.js'] },
  403: { titulo: 'Acesso não permitido', descricao: 'Seu perfil não tem acesso a esta página.', menu: 'entrar', restrita: true, scripts: ['/assets/js/painel/base.js'] },
  posicoes: { titulo: 'Posição dos postos', descricao: 'Ajuste da posição dos postos no mapa.', menu: 'entrar', scripts: ['/vendor/leaflet/leaflet.js', '/assets/js/mapa.js', '/assets/js/painel/base.js', '/assets/js/posicoes.js'], estilos: ['/vendor/leaflet/leaflet.css'], restrita: true },
  404: { titulo: 'Página não encontrada', descricao: 'Esta página não existe.', menu: '' },
};

// Páginas da área da equipe: quem pode abrir cada uma. O servidor confere antes de entregar a página,
// e cada API confere de novo (esconder um botão não basta).
const ADM = ['admin']; const OPERACAO = ['admin', 'supervisor']; const GV = ['guarda_vidas'];
export const PAINEL = {
  admin: { titulo: 'Visão geral', perfis: ADM, js: 'visao', mapa: true },
  supervisao: { titulo: 'Minha região', perfis: ['supervisor'], js: 'visao', mapa: true },
  postos: { titulo: 'Postos', perfis: ADM, js: 'postos' },
  'guarda-vidas': { titulo: 'Guarda-vidas', perfis: ADM, js: 'guarda-vidas' },
  pulseiras: { titulo: 'Pulseiras', perfis: ADM, js: 'pulseiras' },
  escalas: { titulo: 'Escalas', perfis: OPERACAO, js: 'escalas' },
  registros: { titulo: 'Registros de presença', perfis: OPERACAO, js: 'registros' },
  alertas: { titulo: 'Alertas', perfis: OPERACAO, js: 'alertas' },
  revisoes: { titulo: 'Pedidos de revisão', perfis: OPERACAO, js: 'revisoes' },
  terminal: { titulo: 'Terminal simulado', perfis: OPERACAO, js: 'terminal' },
  auditoria: { titulo: 'Auditoria', perfis: ADM, js: 'auditoria' },
  posicoes: { perfis: ADM, pagina: 'posicoes' },
  meu: { titulo: 'Início', perfis: GV, js: 'gv-inicio' },
  'minha-escala': { titulo: 'Minha escala', perfis: GV, js: 'gv-escala' },
  'meus-registros': { titulo: 'Meus registros', perfis: GV, js: 'gv-registros' },
  'minhas-revisoes': { titulo: 'Pedidos de revisão', perfis: GV, js: 'gv-revisoes' },
};
export const INICIO_DO_PERFIL = { admin: '/painel/admin', supervisor: '/painel/supervisao', guarda_vidas: '/painel/meu' };

const cache = new Map();
function ler(arquivo) {
  if (PRODUCAO && cache.has(arquivo)) return cache.get(arquivo);
  const txt = fs.readFileSync(path.join(pastaViews, arquivo), 'utf8');
  cache.set(arquivo, txt);
  return txt;
}

export const escapar = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderizar(nome, extra = {}) {
  const pg = { ...PAGINAS[nome], ...extra };
  let corpo = ler(`paginas/${nome}.html`);
  for (const [k, v] of Object.entries(extra.variaveis || {})) corpo = corpo.replaceAll(`{{${k}}}`, escapar(v));
  const estilos = (pg.estilos || []).map((h) => `<link rel="stylesheet" href="${h}">`).join('\n  ');
  const scripts = (pg.scripts || []).map((s) => `<script src="${s}" defer></script>`).join('\n  ');
  // A área da equipe tem um molde próprio (menu lateral, sem o menu do site público).
  return ler(pg.restrita ? 'molde-painel.html' : 'molde.html')
    .replace('{{titulo}}', escapar(pg.titulo))
    .replace('{{descricao}}', escapar(pg.descricao))
    .replace('{{estilos}}', estilos)
    .replace('{{scripts}}', scripts)
    .replace('{{corpo-classe}}', pg.restrita ? 'restrita' : 'publica')
    .replace('{{conteudo}}', corpo)
    .replace(`data-menu="${pg.menu}"`, `data-menu="${pg.menu}" aria-current="page"`)
    .replace(/(["'(])(\/assets\/[^"'?)\s]+)(?=["')])/g, `$1$2?v=${versaoDosArquivos()}`);
}

export async function paginaPraia(slug) {
  const [praia] = await query(`SELECT pr.nome, r.nome AS regiao FROM praias pr JOIN regioes r ON r.id = pr.regiao_id WHERE pr.slug = $1`, [slug]);
  if (!praia) return null;
  return renderizar('praia', {
    titulo: praia.nome,
    descricao: `Postos de guarda-vidas em ${praia.nome} (${praia.regiao}) e efetivo no momento.`,
    variaveis: { praia: praia.nome, regiao: praia.regiao, slug },
  });
}
