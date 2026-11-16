// Guarda-vidas: meus registros e movimentações. Não é possível alterar registros: só pedir revisão.
P.iniciar(async () => {
  const { api, esc, tabela, selo, seloDe, nome } = P;
  const { relogio } = P.usuario;
  P.app.innerHTML = `
    <form class="barra-filtros" id="filtros">
      <label>De<input type="date" name="de" value="${P.somaDias(relogio.data, -6)}" max="${relogio.data}"></label>
      <label>Até<input type="date" name="ate" value="${relogio.data}" max="${relogio.data}"></label>
    </form>
    <div id="resultado">${P.estado('carregando', 'Carregando...')}</div>`;
  const filtros = P.filtros(document.getElementById('filtros'), () => carregar());

  async function carregar() {
    try {
      const d = await api('/api/gv/registros' + P.qs(filtros()));
      const fila = d.registros.filter((r) => !r.sincronizado).length;
      document.getElementById('resultado').innerHTML = `
        ${fila ? `<p class="aviso">${fila} leitura(s) sua(s) estão guardadas em terminal sem sinal. Elas entram no sistema quando a conexão voltar; não é preciso fazer nada.</p>` : ''}
        <section class="bloco"><h2>Meus registros <small>${d.registros.length}</small></h2>
          <p class="bloco-nota">Se algum registro estiver errado, peça revisão. A supervisão analisa e você acompanha a resposta.</p>
          ${tabela([
            { titulo: 'Data e hora', html: (r) => `${P.data(r.data)} <strong>${r.hora}</strong>` },
            { titulo: 'Tipo', html: (r) => esc(nome('tipo', r.tipo)) },
            { titulo: 'Posto', html: (r) => `${esc(r.praia)}, ${esc(r.posto)}` },
            { titulo: 'Origem', html: (r) => esc(nome('origem', r.origem)) },
            { titulo: 'Situação', html: (r) => `${seloDe('situacaoRegistro', r.situacao)}${r.sincronizado ? '' : ' ' + selo('Aguardando sincronização', 'atencao')}${r.em_revisao ? ' ' + selo('Em revisão', 'info') : ''}
              ${r.sincronizado && r.recebida && r.origem === 'nfc' ? '' : r.recebida ? `<small>Recebido ${r.recebida}</small>` : ''}${r.justificativa ? `<small>${esc(r.justificativa)}</small>` : ''}` },
            { titulo: 'Ações', classe: 'acoes', html: (r) => (r.situacao === 'valido' && !r.em_revisao ? `<a class="botao-pequeno" href="/painel/minhas-revisoes?registro=${r.id}">Pedir revisão</a>` : '') },
          ], d.registros, 'Nenhum registro no período.')}
        </section>
        <section class="bloco"><h2>Movimentações</h2>${tabela([
          { titulo: 'Data', html: (m) => P.data(m.data) },
          { titulo: 'De', html: (m) => (m.origem ? `${esc(m.origem_praia)}, ${esc(m.origem)}` : '–') },
          { titulo: 'Para', html: (m) => `${esc(m.destino_praia)}, ${esc(m.destino)}` },
          { titulo: 'Saída e chegada', html: (m) => `${m.saida || '–'} / ${m.chegada || '–'}` },
          { titulo: 'Motivo', html: (m) => `<small>${esc(m.motivo)}</small>` },
        ], d.movimentacoes, 'Nenhuma movimentação.')}</section>`;
    } catch (e) { document.getElementById('resultado').innerHTML = P.estado('erro', e.message); }
  }
  await carregar();
});
