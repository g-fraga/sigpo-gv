// Monta as páginas HTML: cada página em views/paginas/ é encaixada no molde views/molde.html,
// que tem o cabeçalho, o menu e o rodapé. Assim o menu existe em um só arquivo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';

const pastaViews = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../views');
const PRODUCAO = process.env.NODE_ENV === 'production';

// Dados de cada página: título da aba, descrição, item do menu marcado e scripts.
const PAGINAS = {
  inicio: { titulo: 'Praias de Florianópolis agora', descricao: 'Mapa dos postos de guarda-vidas, situação das praias e orientações de segurança.', menu: 'inicio', scripts: ['/vendor/leaflet/leaflet.js', '/assets/js/mapa.js', '/assets/js/inicio.js'], estilos: ['/vendor/leaflet/leaflet.css'] },
  praias: { titulo: 'Praias e postos', descricao: 'Todas as praias com posto de guarda-vidas na demonstração, por região.', menu: 'praias', scripts: ['/assets/js/praias.js'] },
  praia: { titulo: 'Praia', descricao: 'Postos de guarda-vidas e efetivo no momento.', menu: 'praias', scripts: ['/vendor/leaflet/leaflet.js', '/assets/js/mapa.js', '/assets/js/praia.js'], estilos: ['/vendor/leaflet/leaflet.css'] },
  seguranca: { titulo: 'Segurança na praia', descricao: 'Bandeiras, correntes de retorno e o que fazer em uma emergência.', menu: 'seguranca' },
  sobre: { titulo: 'Sobre o projeto', descricao: 'O que é o SIGPO-GV Web, como funciona e por que os dados são fictícios.', menu: 'sobre' },
  entrar: { titulo: 'Entrar', descricao: 'Acesso da equipe (contas de demonstração).', menu: 'entrar', scripts: ['/assets/js/entrar.js'] },
  painel: { titulo: 'Área restrita', descricao: 'Área da equipe.', menu: 'entrar', scripts: ['/assets/js/painel.js'], restrita: true },
  404: { titulo: 'Página não encontrada', descricao: 'Esta página não existe.', menu: '' },
};

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
  return ler('molde.html')
    .replace('{{titulo}}', escapar(pg.titulo))
    .replace('{{descricao}}', escapar(pg.descricao))
    .replace('{{estilos}}', estilos)
    .replace('{{scripts}}', scripts)
    .replace('{{corpo-classe}}', pg.restrita ? 'restrita' : 'publica')
    .replace('{{conteudo}}', corpo)
    .replace(`data-menu="${pg.menu}"`, `data-menu="${pg.menu}" aria-current="page"`);
}

export async function paginaPraia(slug) {
  const [praia] = await query(`SELECT pr.nome, r.nome AS regiao FROM praias pr JOIN regioes r ON r.id = pr.regiao_id WHERE pr.slug = $1`, [slug]);
  if (!praia) return null;
  return renderizar('praia', {
    titulo: praia.nome,
    descricao: `Postos de guarda-vidas da praia ${praia.nome} (região ${praia.regiao}) e efetivo no momento.`,
    variaveis: { praia: praia.nome, regiao: praia.regiao, slug },
  });
}
