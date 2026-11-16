-- SIGPO-GV Web: estrutura do banco de dados (PostgreSQL).
-- Cada tabela corresponde ao modelo do documento de requisitos (seção 4.3).

DROP TABLE IF EXISTS alerta_tratativas, auditoria, pedidos_revisao, movimentacoes, alertas, registros, escala_itens, escalas,
  usuarios, pulseiras, guarda_vidas, terminais, postos, praias, regioes, config CASCADE;

-- Configurações gerais, como o relógio da demonstração.
CREATE TABLE config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE regioes (
  id TEXT PRIMARY KEY,               -- N, L, S
  nome TEXT NOT NULL
);

-- Praias e postos vêm dos arquivos server/catalogo/*.csv.
CREATE TABLE praias (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,          -- nome sem acento, usado em endereços
  regiao_id TEXT NOT NULL REFERENCES regioes(id),
  ordem INT NOT NULL,                 -- ordem da lista (norte para sul)
  observacao TEXT
);

CREATE TABLE postos (
  id SERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,        -- ex.: L07
  praia_id INT NOT NULL REFERENCES praias(id),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'guarita' CHECK (tipo IN ('guarita', 'avancado')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  previsto INT NOT NULL CHECK (previsto > 0),       -- efetivo previsto
  hora_inicio TIME NOT NULL DEFAULT '08:00',
  hora_fim TIME NOT NULL DEFAULT '19:00',
  energia TEXT NOT NULL DEFAULT 'rede' CHECK (energia IN ('rede', 'bateria', 'solar', 'nenhuma')),
  sazonal BOOLEAN NOT NULL DEFAULT FALSE,           -- só funciona na alta temporada
  precisao TEXT NOT NULL DEFAULT 'aproximada' CHECK (precisao IN ('aproximada', 'conferida')),
  observacao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE terminais (
  id SERIAL PRIMARY KEY,
  posto_id INT NOT NULL UNIQUE REFERENCES postos(id),
  codigo TEXT NOT NULL UNIQUE,
  online BOOLEAN NOT NULL DEFAULT TRUE,
  offline_desde TIMESTAMP,
  ultima_comunicacao TIMESTAMP
);

CREATE TABLE guarda_vidas (
  id SERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,         -- ex.: GV 0417
  nome TEXT NOT NULL,
  vinculo TEXT NOT NULL CHECK (vinculo IN ('GVCV', 'Militar')),
  situacao TEXT NOT NULL DEFAULT 'ativo' CHECK (situacao IN ('ativo', 'afastado', 'desligado')),
  posto_id INT REFERENCES postos(id)   -- posto base (lotação); a escala de cada dia parte daqui
);

CREATE TABLE pulseiras (
  id SERIAL PRIMARY KEY,
  guarda_vidas_id INT NOT NULL REFERENCES guarda_vidas(id),
  numero_chip TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('pulseira', 'cartao_reserva')),
  situacao TEXT NOT NULL CHECK (situacao IN ('ativa', 'bloqueada', 'inativa', 'substituida')),
  emitida_em DATE NOT NULL,
  motivo TEXT
);
-- Cada pessoa só pode ter UMA credencial ativa (pulseira ou cartão reserva).
CREATE UNIQUE INDEX pulseira_ativa_unica ON pulseiras (guarda_vidas_id) WHERE situacao = 'ativa';

CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,            -- só o hash (bcrypt), nunca a senha
  perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'supervisor', 'guarda_vidas')),
  regiao_id TEXT REFERENCES regioes(id),          -- escopo do supervisor
  guarda_vidas_id INT REFERENCES guarda_vidas(id), -- conta do próprio guarda-vidas
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);

-- Cada alteração da escala gera uma nova versão; a versão atual é a de maior número.
CREATE TABLE escalas (
  id SERIAL PRIMARY KEY,
  posto_id INT NOT NULL REFERENCES postos(id),
  data DATE NOT NULL,
  versao INT NOT NULL,
  publicada_em TIMESTAMP NOT NULL,
  publicada_por INT REFERENCES usuarios(id),
  justificativa TEXT,
  UNIQUE (posto_id, data, versao)
);

CREATE TABLE escala_itens (
  id SERIAL PRIMARY KEY,
  escala_id INT NOT NULL REFERENCES escalas(id),
  guarda_vidas_id INT NOT NULL REFERENCES guarda_vidas(id),
  funcao TEXT NOT NULL,
  inicio TIME NOT NULL,
  fim TIME NOT NULL
);

-- Leituras de pulseira, registros manuais e correções. Nada é apagado.
CREATE TABLE registros (
  id SERIAL PRIMARY KEY,
  codigo_unico TEXT NOT NULL UNIQUE,   -- gerado no terminal; impede duplicidade no reenvio
  tipo TEXT NOT NULL CHECK (tipo IN ('apresentacao', 'intervalo', 'retorno', 'saida', 'negada')),
  guarda_vidas_id INT REFERENCES guarda_vidas(id),
  pulseira_id INT REFERENCES pulseiras(id),
  terminal_id INT REFERENCES terminais(id),
  posto_id INT NOT NULL REFERENCES postos(id),
  hora_leitura TIMESTAMP NOT NULL,     -- relógio do terminal
  hora_recebida TIMESTAMP,             -- relógio do servidor (vazio enquanto está guardado no terminal sem sinal)
  sincronizado BOOLEAN NOT NULL DEFAULT TRUE,
  origem TEXT NOT NULL CHECK (origem IN ('nfc', 'manual', 'correcao')),
  situacao TEXT NOT NULL DEFAULT 'valido' CHECK (situacao IN ('valido', 'repique', 'negado', 'corrigido')),
  observacoes TEXT,
  justificativa TEXT,
  autor_id INT REFERENCES usuarios(id),
  corrige_id INT REFERENCES registros(id),
  transito BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX registros_hora ON registros (hora_leitura);
CREATE INDEX registros_gv ON registros (guarda_vidas_id);

CREATE TABLE alertas (
  id SERIAL PRIMARY KEY,
  chave TEXT NOT NULL UNIQUE,          -- evita criar o mesmo alerta duas vezes
  tipo TEXT NOT NULL,
  posto_id INT REFERENCES postos(id),
  guarda_vidas_id INT REFERENCES guarda_vidas(id),
  titulo TEXT NOT NULL,
  detalhe TEXT,
  criado_em TIMESTAMP NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'aberto' CHECK (situacao IN ('aberto', 'reconhecido', 'resolvido', 'descartado')),
  tratado_por INT REFERENCES usuarios(id),
  tratado_em TIMESTAMP,
  nota TEXT
);

-- Histórico das providências tomadas em cada alerta.
CREATE TABLE alerta_tratativas (
  id SERIAL PRIMARY KEY,
  alerta_id INT NOT NULL REFERENCES alertas(id),
  usuario_id INT REFERENCES usuarios(id),
  usuario_nome TEXT NOT NULL,
  situacao TEXT NOT NULL,
  nota TEXT NOT NULL,
  criado_em TIMESTAMP NOT NULL
);

CREATE TABLE movimentacoes (
  id SERIAL PRIMARY KEY,
  data DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('transferencia', 'reforco', 'substituicao')),
  guarda_vidas_id INT NOT NULL REFERENCES guarda_vidas(id),
  substituido_id INT REFERENCES guarda_vidas(id),
  origem_id INT REFERENCES postos(id),
  destino_id INT NOT NULL REFERENCES postos(id),
  situacao TEXT NOT NULL CHECK (situacao IN ('solicitada', 'em_transito', 'concluida', 'cancelada')),
  motivo TEXT NOT NULL,
  criada_em TIMESTAMP NOT NULL,
  criada_por INT REFERENCES usuarios(id),
  saida_em TIMESTAMP,
  chegada_em TIMESTAMP
);

-- O guarda-vidas não altera registros: ele pede revisão e a supervisão analisa.
CREATE TABLE pedidos_revisao (
  id SERIAL PRIMARY KEY,
  registro_id INT REFERENCES registros(id),          -- vazio quando o pedido é de registro ausente
  guarda_vidas_id INT NOT NULL REFERENCES guarda_vidas(id),
  posto_id INT NOT NULL REFERENCES postos(id),       -- define qual supervisão analisa
  motivo TEXT NOT NULL CHECK (motivo IN ('horario', 'tipo', 'posto', 'nao_reconhece', 'ausente', 'outro')),
  texto TEXT NOT NULL,                               -- justificativa do guarda-vidas
  data_referencia DATE NOT NULL,
  hora_informada TIME,                               -- horário que o guarda-vidas diz ser o correto
  situacao TEXT NOT NULL DEFAULT 'aberto' CHECK (situacao IN ('aberto', 'aceito', 'recusado')),
  resposta TEXT,
  respondido_por INT REFERENCES usuarios(id),
  respondido_em TIMESTAMP,
  correcao_id INT REFERENCES registros(id),          -- registro criado ao aceitar
  criado_em TIMESTAMP NOT NULL
);

CREATE TABLE auditoria (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id),
  usuario_nome TEXT NOT NULL,
  acao TEXT NOT NULL,
  objeto TEXT,
  detalhe TEXT,
  criado_em TIMESTAMP NOT NULL
);

-- Posições conferidas no mapa pela tela "Ajustar posições" (só no computador de desenvolvimento).
-- Esta tabela NÃO é apagada quando a demonstração é recriada.
CREATE TABLE IF NOT EXISTS posicoes_conferidas (
  codigo TEXT PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  conferida_em TIMESTAMP NOT NULL DEFAULT now()
);
