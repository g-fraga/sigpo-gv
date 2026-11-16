// Guarda-vidas: minha escala (dias de trabalho, horários, posto e alterações).
P.iniciar(async () => {
  const { api, esc, tabela, selo } = P;
  const d = await api('/api/gv/escala');
  const futuros = d.dias.filter((x) => x.data >= d.hoje);
  const passados = d.dias.filter((x) => x.data < d.hoje).reverse();
  const colunas = [
    { titulo: 'Data', html: (x) => `<strong>${P.data(x.data)}</strong> <small>${P.diaSemana(x.data)}${x.data === d.hoje ? ', hoje' : ''}</small>` },
    { titulo: 'Posto', html: (x) => `${esc(x.praia)}, ${esc(x.posto)}<small>${esc(x.regiao)}</small>` },
    { titulo: 'Horário', html: (x) => `${x.inicio}–${x.fim}` },
    { titulo: 'Função', html: (x) => esc(x.funcao) },
    { titulo: 'Versão', html: (x) => (x.versao > 1 ? selo(`Alterada (versão ${x.versao})`, 'atencao') : '<small>Original</small>') },
  ];
  P.app.innerHTML = `
    <section class="bloco"><h2>Próximos dias <small>${futuros.length}</small></h2>
      <p class="bloco-nota">Escalas publicadas até agora. Novos dias aparecem quando a administração publica.</p>
      ${tabela(colunas, futuros, 'Nenhuma escala publicada para os próximos dias.')}</section>
    <section class="bloco"><h2>Alterações na escala <small>${d.alteracoes.length}</small></h2>
      ${d.alteracoes.length ? `<ol class="historico">${d.alteracoes.map((a) => `<li><strong>${P.data(a.data)}, ${esc(a.praia)}, ${esc(a.posto)}</strong>: ${esc(a.o_que_mudou)}
        <small>Versão ${a.versao}, publicada em ${a.publicada_em}. ${esc(a.justificativa || '')}</small></li>`).join('')}</ol>` : P.estado('vazio', 'Nenhuma alteração que envolva você.')}</section>
    <section class="bloco"><h2>Últimos 14 dias</h2>${tabela(colunas, passados, 'Sem escalas nos últimos dias.')}</section>`;
});
