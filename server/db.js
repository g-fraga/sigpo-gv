// Conexão com o banco de dados.
// - Com a variável DATABASE_URL definida (no Render, por exemplo), usa um PostgreSQL de verdade.
// - Sem ela (no seu computador), usa o PGlite: um PostgreSQL embutido que guarda os dados na pasta "dados/".
// O resto do sistema só usa as funções query() e exec() daqui, então não precisa saber qual dos dois está ativo.
import fs from 'node:fs';
import path from 'node:path';

let banco = null;

export async function conectar() {
  if (banco) return banco;
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'nao' ? false : { rejectUnauthorized: false },
    });
    banco = {
      tipo: 'PostgreSQL',
      query: async (sql, params = []) => (await pool.query(sql, params)).rows,
      exec: async (sql) => { await pool.query(sql); },
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const pasta = path.resolve(process.env.PASTA_DADOS || 'dados');
    fs.mkdirSync(pasta, { recursive: true });
    const db = new PGlite(pasta);
    await db.waitReady;
    banco = {
      tipo: 'PGlite (PostgreSQL embutido, pasta ' + path.relative(process.cwd(), pasta) + ')',
      query: async (sql, params = []) => (await db.query(sql, params)).rows,
      exec: async (sql) => { await db.exec(sql); },
    };
  }
  return banco;
}

// Executa uma consulta com parâmetros ($1, $2...). Nunca monte SQL juntando texto do usuário:
// os parâmetros evitam injeção de SQL.
export async function query(sql, params = []) {
  const b = await conectar();
  return b.query(sql, params);
}

export async function exec(sql) {
  const b = await conectar();
  return b.exec(sql);
}

export function tipoBanco() {
  return banco ? banco.tipo : 'não conectado';
}
