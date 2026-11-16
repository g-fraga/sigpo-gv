// Alertas: consulta, providências e histórico das tratativas (administração e supervisão).
P.iniciar(async (u) => {
  const { api, esc, tabela, selo, seloDe, nome } = P;
  const admin = u.perfil === 'admin';
  const op = await P.opcoes();

  P.app.innerHTML = `
    <form class="barra-filtros" id="filtros">
      <label>Situação<select name="situacao"><option value="abertos">Abertos e em tratamento</option><option value="todos">Todos</option>
        ${['aberto', 'reconhecido', 'resolvido', 'descartado'].map((s) => `<option value="${s}">${nome('situacaoAlerta', s)}</option>`).join('')}</select></label>
      <label>Tipo<select name="tipo"><option value="">Todos</option>${Object.entries(P.NOMES.tipoAlerta).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      ${admin ? `<label>Região<select name="regiao"><option value="">Todas</option>${op.regioes.filter((r) => r.id !== 'C').map((r) => `<option value="${r.id}">${esc(r.nome)}</option>`).join('')}</select></label>` : ''}
      <label>Desde<input type="date" name="de" value="${P.somaDias(op.hoje, -6)}" max="${op.hoje}"></label>
    </form>
    <div id="resultado">${P.estado('carregando', 'Carregando alertas...')}</div>`;
  const filtros = P.filtros(document.getElementById('filtros'), () => carregar());
  let dados = null;
  const tomTipo = (t) => (t === 'pendente' || t === 'offline' || t === 'pulseira' ? 'perigo' : 'atencao');

  function desenhar() {
    document.getElementById('resultado').innerHTML = `<section class="bloco"><h2>Alertas <small>${dados.alertas.length}</small></h2>
      <p class="bloco-nota">Pendências e terminais sem sinal são resolvidos sozinhos quando o registro chega. Registre aqui o que foi feito em cada caso.</p>
      ${tabela([
        { titulo: 'Quando', html: (a) => `${P.data(a.data)} <strong>${a.hora}</strong>` },
        { titulo: 'Tipo', html: (a) => selo(nome('tipoAlerta', a.tipo), tomTipo(a.tipo)) },
        { titulo: 'Posto', html: (a) => `${esc(a.praia)}, ${esc(a.posto)}` },
        { titulo: 'Detalhe', html: (a) => `${a.gv_codigo ? `<strong>${esc(a.gv_codigo)}</strong> ${esc(a.gv_nome)}<br>` : ''}<small>${esc(a.detalhe || a.titulo)}</small>` },
        { titulo: 'Situação', html: (a) => `${seloDe('situacaoAlerta', a.situacao)}${a.tratativas ? `<small>${a.tratativas} ${a.tratativas === 1 ? 'providência' : 'providências'}</small>` : ''}` },
        { titulo: 'Ações', classe: 'acoes', html: (a) => `<button class="botao-pequeno" data-tratar="${a.id}">${['aberto', 'reconhecido'].includes(a.situacao) ? 'Tratar' : 'Ver'}</button>` },
      ], dados.alertas, 'Nenhum alerta com esses filtros.')}</section>`;
  }

  P.app.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-tratar]'); if (!b) return;
    let a;
    try { a = await api('/api/painel/alertas/' + b.dataset.tratar); } catch (e) { return P.mensagem('erro', e.message); }
    const encerrado = ['resolvido', 'descartado'].includes(a.situacao);
    P.dialogo({
      titulo: a.titulo, largo: true, botao: 'Registrar providência',
      corpo: `<dl class="detalhe-lista">
          <dt>Posto</dt><dd>${esc(a.praia)}, ${esc(a.posto)}</dd>
          ${a.gv_codigo ? `<dt>Guarda-vidas</dt><dd>${esc(a.gv_codigo)} ${esc(a.gv_nome)}</dd>` : ''}
          <dt>Criado em</dt><dd>${a.criado}</dd>
          <dt>Detalhe</dt><dd>${esc(a.detalhe || '')}</dd>
          <dt>Situação</dt><dd>${seloDe('situacaoAlerta', a.situacao)}</dd>
        </dl>
        <h3>Histórico das tratativas</h3>
        ${a.tratativas.length ? `<ol class="historico">${a.tratativas.map((t) => `<li><strong>${esc(nome('situacaoAlerta', t.situacao))}</strong>: ${esc(t.nota)}<small>${t.quando}, ${esc(t.usuario_nome.replace(' (fictício)', ''))}</small></li>`).join('')}</ol>` : P.estado('vazio', 'Nenhuma providência registrada ainda.')}
        <h3>${encerrado ? 'Reabrir alerta' : 'Nova providência'}</h3>
        <div class="campos">
          <label class="inteiro">Nova situação<select name="situacao">${(encerrado ? ['aberto'] : ['reconhecido', 'resolvido', 'descartado']).map((s) => `<option value="${s}">${nome('situacaoAlerta', s)}</option>`).join('')}</select></label>
          <label class="inteiro">Providência adotada<textarea name="nota" required minlength="5" placeholder="Ex.: contato por rádio com o chefe do posto; guarda-vidas a caminho"></textarea></label>
        </div>`,
      aoEnviar: async (v) => { const r = await api(`/api/painel/alertas/${a.id}/tratativa`, { method: 'POST', body: v }); await carregar(); return r.mensagem; },
    });
  });

  async function carregar() {
    try { dados = await api('/api/painel/alertas' + P.qs(filtros())); desenhar(); }
    catch (e) { document.getElementById('resultado').innerHTML = P.estado('erro', e.message); }
  }
  await carregar();
});
