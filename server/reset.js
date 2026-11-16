// Recria o banco com os dados de demonstração.  Uso: npm run reset
import { criarDemonstracao, SENHA_DEMO } from './dados-demo.js';
import { tipoBanco } from './db.js';

const r = await criarDemonstracao();
console.log(`Banco recriado (${tipoBanco()}).`);
console.log(`Dia da demonstração: ${r.data}, ${r.postos} postos. O relógio começa em 10:30.`);
console.log(`Contas: admin@sigpo.demo, supervisor@sigpo.demo, gv0417@sigpo.demo (senha: ${SENHA_DEMO})`);
process.exit(0);
