// Administração: cadastro de guarda-vidas e vínculo com o posto base.
P.iniciar(async () => {
  const { api, esc, tabela, selo, seloDe, nome } = P;
  const op = await P.opcoes();

  P.app.innerHTML = `
    <form class="barra-filtros" id="filtros">
      <label>Buscar<input type="search" name="busca" placeholder="Matrícula ou nome"></label>
      <label>Posto base<select name="regiao"><option value="">Todas as regiões</option>${op.regioes.filter((r) => r.id !== 'C').map((r) => `<option value="${r.id}">${esc(r.nome)}</option>`).join('')}<option value="sem">Sem posto base (reserva)</option></select></label>
      <label>Situação<select name="situacao"><option value="">Todas</option><option value="ativo" selected>Ativos</option><option value="afastado">Afastados</option><option value="desligado">Desligados</option></select></label>
      <span class="empurra"></span>
      <button class="botao" type="button" id="novo">Cadastrar guarda-vidas</button>
    </form>
    <div id="lista">${P.estado('carregando', 'Carregando...')}</div>`;

  const filtros = P.filtros(document.getElementById('filtros'), () => carregar());
  let lista = [];

  function formulario(g = {}) {
    return `<div class="campos">
      ${g.id ? `<p class="inteiro">Matrícula <strong>${esc(g.codigo)}</strong></p>` : '<label>Matrícula<input name="codigo" inputmode="numeric" maxlength="7" placeholder="Em branco: gera a próxima"><small>Só números, até 4 dígitos.</small></label>'}
      <label class="${g.id ? 'inteiro' : ''}">Nome completo<input name="nome" required minlength="3" maxlength="80" value="${esc(g.nome || '')}"></label>
      <label>Vínculo<select name="vinculo"><option value="GVCV" ${g.vinculo !== 'Militar' ? 'selected' : ''}>Guarda-vidas civil voluntário</option><option value="Militar" ${g.vinculo === 'Militar' ? 'selected' : ''}>Militar</option></select></label>
      <label>Situação<select name="situacao">${['ativo', 'afastado', 'desligado'].map((s) => `<option value="${s}" ${g.situacao === s ? 'selected' : ''}>${nome('situacaoGV', s)}</option>`).join('')}</select></label>
      <label class="inteiro">Posto base<select name="posto_id">${P.opcoesPostos(op.postos, g.posto_id || '', { vazio: 'Sem posto base (reserva)' })}</select>
        <small>A escala de cada dia é gerada a partir do posto base. Mudanças valem para as próximas escalas.</small></label>
    </div>`;
  }

  function desenhar() {
    document.getElementById('lista').innerHTML = `<section class="bloco"><div class="bloco-topo"><h2>Guarda-vidas <small>${lista.length}</small></h2></div>${tabela([
      { titulo: 'Matrícula', html: (g) => `<strong>${esc(g.codigo)}</strong>` },
      { titulo: 'Nome', html: (g) => `${esc(g.nome)}<small>${g.vinculo === 'Militar' ? 'Militar' : 'Civil voluntário'}</small>` },
      { titulo: 'Posto base', html: (g) => (g.posto ? `${esc(g.praia)}, ${esc(g.posto)}` : '<small>Reserva (sem posto base)</small>') },
      { titulo: 'Pulseira ativa', html: (g) => (g.pulseira ? `<small>${esc(g.pulseira)}</small>` : g.situacao === 'ativo' ? selo('Sem credencial', 'perigo') : '–') },
      { titulo: 'Hoje', html: (g) => (g.escalado_hoje ? selo('Escalado', 'info') : '<small>Fora da escala</small>') },
      { titulo: 'Situação', html: (g) => seloDe('situacaoGV', g.situacao) },
      { titulo: 'Ações', classe: 'acoes', html: (g) => `<button class="botao-pequeno" data-ver="${g.id}">Ver</button> <button class="botao-pequeno" data-editar="${g.id}">Editar</button>` },
    ], lista, 'Nenhum guarda-vidas encontrado.')}</section>`;
  }

  document.getElementById('novo').addEventListener('click', () => P.dialogo({
    titulo: 'Cadastrar guarda-vidas', corpo: formulario({ situacao: 'ativo' }), botao: 'Cadastrar',
    aoEnviar: async (v) => { const r = await api('/api/admin/guarda-vidas', { method: 'POST', body: v }); await carregar(); return r.mensagem; },
  }));

  P.app.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const id = b.dataset.ver || b.dataset.editar; if (!id) return;
    if (b.dataset.editar) {
      const g = lista.find((x) => String(x.id) === id);
      return P.dialogo({ titulo: `Editar ${g.codigo}`, corpo: formulario(g), aoEnviar: async (v) => { const r = await api('/api/admin/guarda-vidas/' + id, { method: 'PUT', body: v }); await carregar(); return r.mensagem; } });
    }
    const d = P.dialogo({ titulo: 'Guarda-vidas', corpo: P.estado('carregando', 'Carregando...'), largo: true });
    try {
      const g = await api('/api/admin/guarda-vidas/' + id);
      d.querySelector('h2').textContent = `${g.codigo} ${g.nome}`;
      d.querySelector('.janela-corpo').innerHTML = `
        <dl class="detalhe-lista">
          <dt>Vínculo</dt><dd>${g.vinculo === 'Militar' ? 'Militar' : 'Guarda-vidas civil voluntário'}</dd>
          <dt>Situação</dt><dd>${seloDe('situacaoGV', g.situacao)}</dd>
          <dt>Posto base</dt><dd>${g.posto ? `${esc(g.praia)}, ${esc(g.posto)} (${esc(g.regiao)})` : 'Reserva, sem posto base'}</dd>
        </dl>
        <h3>Pulseiras e cartões</h3>
        ${tabela([{ titulo: 'Código', html: (p) => esc(p.numero_chip) }, { titulo: 'Tipo', html: (p) => (p.tipo === 'pulseira' ? 'Pulseira' : 'Cartão reserva') },
          { titulo: 'Situação', html: (p) => seloDe('situacaoPulseira', p.situacao) }, { titulo: 'Emitida', html: (p) => p.emitida }, { titulo: 'Observação', html: (p) => esc(p.motivo || '') }], g.pulseiras, 'Nenhuma pulseira vinculada.')}
        <h3>Escalas recentes</h3>
        ${tabela([{ titulo: 'Data', html: (e) => `${P.data(e.data)} <small>${P.diaSemana(e.data)}</small>` }, { titulo: 'Posto', html: (e) => `${esc(e.praia)}, ${esc(e.posto)}` },
          { titulo: 'Função', html: (e) => esc(e.funcao) }, { titulo: 'Horário', html: (e) => `${e.inicio}–${e.fim}` }], g.escalas, 'Sem escalas.')}
        <h3>Histórico de registros</h3>
        ${tabela([{ titulo: 'Quando', html: (r) => r.quando }, { titulo: 'Tipo', html: (r) => esc(nome('tipo', r.tipo)) }, { titulo: 'Posto', html: (r) => `${esc(r.praia)}, ${esc(r.posto)}` },
          { titulo: 'Origem', html: (r) => esc(nome('origem', r.origem)) }, { titulo: 'Situação', html: (r) => seloDe('situacaoRegistro', r.situacao) + (r.sincronizado ? '' : ' ' + selo('Aguardando sincronização', 'atencao')) }], g.registros, 'Sem registros.')}`;
    } catch (e) { d.querySelector('.janela-corpo').innerHTML = P.estado('erro', e.message); }
  });

  async function carregar() {
    try { lista = (await api('/api/admin/guarda-vidas' + P.qs(filtros()))).guarda_vidas; desenhar(); }
    catch (e) { document.getElementById('lista').innerHTML = P.estado('erro', e.message); }
  }
  await carregar();
});
