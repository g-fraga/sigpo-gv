# SIGPO-GV Web

Portal das praias de Florianópolis com os postos de guarda-vidas e o efetivo em cada um, mais uma área restrita para a equipe (administração, supervisão e guarda-vidas).

> **Protótipo acadêmico com dados fictícios.** Trabalho da disciplina Prática de Programação Web (Análise e Desenvolvimento de Sistemas, FMP). Não tem vínculo oficial com o Corpo de Bombeiros Militar de Santa Catarina. As praias existem; postos, pessoas, horários e números são inventados.

## O que já funciona

- **Início**: mapa com os 32 postos, busca de praia, números da cidade, dica do dia e lista de praias por região. Atualiza sozinho a cada minuto.
- **Praias e postos**: lista com filtro por nome e região.
- **Página de cada praia** (`/praias/joaquina`, por exemplo): um cartão por posto, com o efetivo, o horário da última atualização e o aviso quando o terminal está sem sinal.
- **Segurança**: orientações com fontes citadas.
- **Sobre**: o projeto, como funciona, dados e privacidade.
- **Área da equipe**: login com as contas de demonstração (as telas internas vêm nas próximas etapas).

## Como rodar no seu computador (Ubuntu)

Você precisa de **Node.js 20 ou mais novo** e do **Git**.

```bash
# 1. Node.js pelo nvm (só na primeira vez)
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install --lts
node -v     # deve mostrar v22 ou v24

# 2. Baixar o projeto
git clone https://github.com/g-fraga/sigpo-gv.git
cd sigpo-gv

# 3. Instalar as dependências e iniciar
npm install
npm run dev
```

Abra **http://localhost:3000**. Na primeira vez, o servidor cria o banco sozinho na pasta `dados/`.

### Contas de demonstração

| Perfil | E-mail | Senha |
|---|---|---|
| Administração | admin@sigpo.demo | demo1234 |
| Supervisão (região Leste) | supervisor@sigpo.demo | demo1234 |
| Guarda-vidas (GV 0417) | gv0417@sigpo.demo | demo1234 |

### Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Inicia o servidor e reinicia sozinho quando você salva um arquivo. |
| `npm start` | Inicia o servidor (modo de publicação). |
| `npm run reset` | Apaga e recria o banco com os dados de demonstração. |

## O relógio da demonstração

O site simula um dia de temporada. Quando o banco é criado, o relógio do sistema marca **10:30** e anda junto com o tempo real. Assim, mesmo apresentando à noite, os postos aparecem em operação. Todo dia o banco é recriado automaticamente, e `npm run reset` volta o relógio para 10:30 na hora que você quiser.

## Tecnologias

| Parte | Tecnologia | Por quê |
|---|---|---|
| Páginas | HTML, CSS e JavaScript puro | Mostra a base da web sem esconder nada atrás de framework. |
| Servidor | Node.js + Express 5 | Rotas da API e das páginas em JavaScript, a mesma linguagem do navegador. |
| Banco | PostgreSQL (PGlite no computador, PostgreSQL no servidor) | Banco relacional de verdade. O PGlite roda dentro do Node, sem instalar nada. |
| Login | cookie-session + bcryptjs | Sessão em cookie assinado; senha guardada só como hash. |
| Mapa | Leaflet + OpenStreetMap | Mapa livre, sem chave de API. |
| Fontes | Barlow e Barlow Condensed (servidas pelo próprio site) | Sem depender de serviço externo. |

## Estrutura de pastas

```
server/
  index.js          servidor: segurança, sessão, rotas e recriação diária da demonstração
  db.js             conexão com o banco (PGlite ou PostgreSQL)
  relogio.js        relógio da demonstração
  dados-demo.js     cria os dados fictícios
  reset.js          comando npm run reset
  paginas.js        monta cada página dentro do molde (cabeçalho, menu e rodapé)
  sql/schema.sql    tabelas do banco
  regras/presenca.js  calcula quem está em cada posto a partir da escala e das leituras
  rotas/publico.js  API pública (só números, sem dados pessoais)
  rotas/auth.js     login, logout e controle de perfil
views/
  molde.html        cabeçalho, menu e rodapé comuns
  paginas/          conteúdo de cada página
public/
  css/site.css      estilos
  js/               scripts de cada página
  img/              ícone
```

## API pública

| Método e rota | Retorna |
|---|---|
| `GET /api/publico/situacao` | Relógio, totais da cidade, praias e postos com o efetivo atual. |
| `GET /api/publico/praias/:slug` | Uma praia e seus postos. |
| `POST /api/auth/entrar` | Faz login (`{ email, senha }`). |
| `POST /api/auth/sair` | Encerra a sessão. |
| `GET /api/auth/eu` | Usuário logado. |

## Publicação (Render)

Instruções completas entram na etapa de publicação. Em resumo: um *Web Service* com `npm install` como build e `npm start` como início, as variáveis `NODE_ENV=production`, `SESSAO_SEGREDO` (texto aleatório longo) e `DATABASE_URL` (endereço de um PostgreSQL).
