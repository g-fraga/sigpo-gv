# SIGPO-GV Web

Portal das praias de Florianópolis com os postos de guarda-vidas e o efetivo em cada um, mais uma área restrita para a equipe (administração, supervisão e guarda-vidas).

> **Protótipo acadêmico com dados fictícios.** Trabalho da disciplina Prática de Programação Web (Análise e Desenvolvimento de Sistemas, FMP). Não tem vínculo oficial com o Corpo de Bombeiros Militar de Santa Catarina. Praias e postos seguem uma lista levantada pelo autor, com posições aproximadas no mapa; pessoas, escalas, horários e números de efetivo são inventados.

## O que já funciona

- **Início**: mapa com os 42 postos, busca de praia, números da cidade, dica do dia e as 42 praias por região (Norte, Leste, Sul e Continente). Atualiza sozinho a cada minuto.
- **Praias e postos**: lista com filtro por nome e região.
- **Página de cada praia** (`/praias/joaquina`, por exemplo): um cartão por posto, com o efetivo, o horário da última atualização e o aviso quando o terminal está sem sinal. Praias sem posto mostram orientações e o link da balneabilidade do IMA.
- **Conferir posição dos postos** (`/painel/posicoes`, conta admin): arraste o marcador até a guarita ou cole a coordenada do Google Maps.
- **Segurança**: orientações com fontes citadas.
- **Sobre**: o projeto, como funciona, dados e privacidade.
- **Área da equipe**: três painéis com permissões próprias (veja abaixo).

## Área da equipe: três painéis

Depois do login, cada perfil vai direto para o seu painel. O servidor confere o perfil em **todas** as páginas e rotas da API: esconder um botão não basta, e tentar abrir uma página ou um dado de outro perfil ou de outra região devolve "acesso não permitido".

| Perfil | Vê | Pode fazer |
|---|---|---|
| **Administração** (`admin@sigpo.demo`) | Todas as regiões | Visão geral com filtros e mapa; cadastrar, editar e desativar postos (o histórico fica); cadastrar guarda-vidas e definir o posto base; vincular, bloquear, substituir e desativar pulseiras (uma ativa por pessoa, sem código repetido); criar e alterar escalas (cada alteração é uma nova versão com justificativa), ver conflitos e quem está sem alocação; registros, alertas, revisões, terminal simulado; auditoria e "Recriar demonstração" |
| **Supervisão** (`supervisor@sigpo.demo`, região Leste) | Só a própria região | Visão da região; consultar escalas; registros de entrada e saída com ausências e inconsistências; registro manual com justificativa; corrigir registro (o original fica no histórico); tratar alertas com histórico das providências; responder pedidos de revisão; terminal simulado |
| **Guarda-vidas** (`gv0417@sigpo.demo`) | Só os próprios dados | Início com posto, escala e situação de hoje; minha escala (próximos dias, últimos 14 dias e alterações); meus registros (incluindo os que aguardam sincronização); pedir revisão e acompanhar a resposta |

Regras que valem para todos:
- Nada é apagado: correções e respostas criam registros novos e o original fica marcado.
- Toda alteração relevante vai para a auditoria com o nome de quem fez.
- Uma ausência de registro aparece como pendência para verificar, nunca como falta automática.
- O **terminal simulado** faz o papel do leitor NFC: identifica a pulseira, ignora leitura repetida em menos de 1 minuto, recusa pulseira bloqueada e, sem sinal, guarda a leitura no aparelho até a conexão voltar.
- Novas regiões e novos supervisores cabem na estrutura (tabelas `regioes` e `usuarios.regiao_id`), sem mudar o código.

### Dias da demonstração

A demonstração começa com 6 dias de histórico. A cada novo dia, o sistema **mantém cadastros e histórico** e gera o dia de hoje: escalas a partir do posto base, o cenário das 10:30 e as escalas dos próximos 3 dias. O banco só é refeito do zero quando uma nova versão do sistema é publicada ou quando a administração usa "Recriar demonstração" (Auditoria).

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

## Praias e postos (catálogo)

Os dados reais ficam em dois arquivos, que você pode abrir no LibreOffice/Excel (separados por ponto e vírgula):

- `server/catalogo/praias.csv`: as 42 praias e a Lagoa da Conceição, com região e observação.
- `server/catalogo/postos.csv`: os postos (código, praia, nome, tipo, se é sazonal, latitude, longitude, precisão e observação).

Hoje o arquivo tem **42 postos** e todos com posição **aproximada**. Para conferir:

1. Rode `npm run dev`, entre como `admin@sigpo.demo` e abra **Conferir a posição dos postos** (`/painel/posicoes`).
2. Arraste cada marcador até a guarita, ou cole a coordenada copiada do Google Maps (botão direito em cima da guarita, depois clique na coordenada).
3. Clique em **Baixar postos.csv** e substitua o arquivo `server/catalogo/postos.csv` no repositório.

As posições conferidas ficam guardadas mesmo quando a demonstração é recriada. No servidor publicado, o ajuste fica desligado (as contas de demonstração são públicas); para ligar, use a variável `AJUSTE_POSICOES=sim`.

Para incluir um posto novo, acrescente uma linha no `postos.csv` com um código novo (ex.: `N20`) e rode `npm run reset`.

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
  dados-demo.js     cria o banco: catálogo real (CSV) + pessoas e leituras fictícias
  catalogo/         praias.csv e postos.csv
  reset.js          comando npm run reset
  paginas.js        monta cada página dentro do molde (cabeçalho, menu e rodapé)
  sql/schema.sql    tabelas do banco
  regras/presenca.js  calcula quem está em cada posto a partir da escala e das leituras
  rotas/publico.js  API pública (só números, sem dados pessoais)
  rotas/auth.js     login, logout e controle de perfil
  rotas/admin.js    administração: postos, guarda-vidas, pulseiras, escalas, auditoria
  rotas/painel.js   operação (admin e supervisão): visão, registros, alertas, revisões, terminal
  rotas/gv.js       área do guarda-vidas (só os próprios dados)
  regras/validacao.js  validações e escopo de região
views/
  molde.html        cabeçalho, menu e rodapé comuns
  paginas/          conteúdo de cada página
public/
  css/site.css      estilos
  js/               scripts das páginas públicas
  js/painel/        scripts dos painéis (base.js monta o menu de cada perfil)
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

O GitHub só guarda o código; quem roda o site é o Render (plano gratuito).

**Site publicado:** https://sigpo-gv.onrender.com

O repositório tem o arquivo `render.yaml` (Blueprint): ele cria o site e o banco e liga os dois sozinho, sem copiar senha. Cada `git push` na branch `main` publica a nova versão. Os passos abaixo são o caminho manual, caso precise refazer.

1. Entre em [render.com](https://render.com) com a sua conta do GitHub.
2. **New > Postgres**: nome `sigpo-gv-banco`, plano **Free**. Depois de criado, copie a **Internal Database URL**.
3. **New > Web Service**: escolha o repositório `sigpo-gv`, na mesma região do banco.
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: **Free**
4. Em **Environment Variables**, adicione:
   - `NODE_ENV` = `production`
   - `SESSAO_SEGREDO` = clique em **Generate** (texto aleatório)
   - `DATABASE_URL` = a Internal Database URL copiada no passo 2
5. Clique em **Deploy**. O endereço fica parecido com `https://sigpo-gv.onrender.com`.

Cuidados do plano gratuito:
- O site "dorme" depois de 15 minutos sem visitas e leva cerca de 1 minuto para acordar. Abra o endereço uns minutos antes de apresentar.
- O banco gratuito do Render expira 30 dias depois de criado. Para uma apresentação, crie com até 30 dias de antecedência.
- Cada `git push` para o GitHub publica a nova versão sozinho.
- No servidor, use PostgreSQL de verdade (`DATABASE_URL`). O PGlite usa memória demais para os 512 MB do plano gratuito.
