// Administração: cadastro de postos.
P.iniciar(async () => {
  const { api, esc, tabela, selo } = P;
  let dados = null;

  P.app.innerHTML = `
    <form class="barra-filtros" id="filtros">
      <label>Buscar<input type="search" name="busca" placeholder="Praia, posto ou código"></label>
      <label>Região<select name="regiao"><option value="">Todas</option><option value="N">Norte da Ilha</option><option value="L">Leste da Ilha</option><option value="S">Sul da Ilha</option><option value="C">Continente</option></select></label>
      <label>Situação<select name="situacao"><option value="ativos">Ativos</option><option value="inativos">Desativados</option><option value="">Todos</option></select></label>
      <span class="empurra"></span>
      <a class="botao botao-secundario" href="/painel/posicoes">Conferir posições no mapa</a>
      <button class="botao" type="button" id="novo">Cadastrar posto</button>
    </form>
    <div id="lista">${P.estado('carregando', 'Carregando postos...')}</div>`;

  const filtros = P.filtros(document.getElementById('filtros'), () => desenhar());

  function desenhar() {
    const f = filtros();
    const termo = f.busca.toLowerCase();
    const lista = dados.postos.filter((p) => (!f.regiao || p.regiao_id === f.regiao)
      && (f.situacao === 'ativos' ? p.ativo : f.situacao === 'inativos' ? !p.ativo : true)
      && (!termo || `${p.praia_nome} ${p.posto} ${p.codigo}`.toLowerCase().includes(termo)));
    document.getElementById('lista').innerHTML = `<section class="bloco"><div class="bloco-topo"><h2>Postos <small>${lista.length}</small></h2></div>${tabela([
      { titulo: 'Código', html: (p) => `<strong>${esc(p.codigo)}</strong>` },
      { titulo: 'Posto', html: (p) => `<strong>${esc(p.praia_nome)}</strong> ${esc(p.posto)}<small>${esc(p.regiao)}</small>` },
      { titulo: 'Tipo', html: (p) => `${p.tipo === 'avancado' ? 'Avançado (sem terminal)' : 'Guarita com terminal'}${p.sazonal ? '<small>Só na temporada</small>' : ''}` },
      { titulo: 'Previsto', html: (p) => p.previsto, classe: 'num' },
      { titulo: 'Posto base de', html: (p) => `${p.lotados} pessoa${p.lotados === 1 ? '' : 's'}`, classe: 'num' },
      { titulo: 'Horário', html: (p) => `${p.hora_inicio}–${p.hora_fim}` },
      { titulo: 'Localização', html: (p) => `${p.precisao === 'conferida' ? selo('Conferida', 'ok') : selo('Aproximada', 'atencao')}<small>${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}</small>` },
      { titulo: 'Situação', html: (p) => (p.ativo ? selo('Ativo', 'ok') : selo('Desativado', 'neutro')) },
      { titulo: 'Ações', classe: 'acoes', html: (p) => `<button class="botao-pequeno" data-ver="${p.id}">Ver</button>
        <button class="botao-pequeno" data-editar="${p.id}">Editar</button>
        <button class="botao-pequeno ${p.ativo ? 'perigo' : ''}" data-ativo="${p.id}">${p.ativo ? 'Desativar' : 'Reativar'}</button>` },
    ], lista)}</section>`;
  }

  function formulario(p = {}) {
    const praias = dados.praias;
    return `<div class="campos">
      ${p.id ? `<p class="inteiro"><strong>${esc(p.praia_nome)}</strong>, código ${esc(p.codigo)}</p>` : `<label class="inteiro">Praia
        <select name="praia_id" required><option value="">Escolha a praia</option>${['N', 'L', 'S', 'C'].map((r) => `<optgroup label="${esc(praias.find((x) => x.regiao_id === r)?.regiao || r)}">${praias.filter((x) => x.regiao_id === r).map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join('')}</optgroup>`).join('')}</select></label>`}
      <label class="inteiro">Nome do posto<input name="nome" required maxlength="60" value="${esc(p.posto || '')}" placeholder="Ex.: Posto 04"></label>
      <label>Tipo<select name="tipo"><option value="guarita" ${p.tipo !== 'avancado' ? 'selected' : ''}>Guarita com terminal</option><option value="avancado" ${p.tipo === 'avancado' ? 'selected' : ''}>Avançado (sem terminal)</option></select></label>
      <label>Efetivo previsto<input name="previsto" type="number" min="1" max="20" required value="${p.previsto || 3}"></label>
      <label>Início<input name="hora_inicio" type="time" required value="${p.hora_inicio || '08:00'}"></label>
      <label>Fim<input name="hora_fim" type="time" required value="${p.hora_fim || '19:00'}"></label>
      <label>Energia do terminal<select name="energia">${['rede', 'bateria', 'solar'].map((e) => `<option value="${e}" ${p.energia === e ? 'selected' : ''}>${{ rede: 'Rede elétrica', bateria: 'Bateria', solar: 'Solar' }[e]}</option>`).join('')}</select></label>
      <label class="marcar"><input type="checkbox" name="sazonal" ${p.sazonal ? 'checked' : ''}> Funciona só na alta temporada</label>
      <label class="inteiro">Coordenadas (latitude, longitude)<input name="coordenadas" required value="${p.latitude != null ? p.latitude.toFixed(5) + ', ' + p.longitude.toFixed(5) : ''}" placeholder="-27.62900, -48.44900">
        <small>Cole do Google Maps: botão direito sobre a guarita e clique na coordenada.</small></label>
      <label class="inteiro">Observação<input name="observacao" maxlength="200" value="${esc(p.observacao || '')}" placeholder="Ex.: próximo ao trapiche"></label>
    </div>`;
  }

  function corpoDoPosto(v) {
    const partes = String(v.coordenadas).replace(/[()]/g, '').split(/[;,\s]+/).filter(Boolean);
    if (partes.length !== 2) throw new Error('Coordenadas: use o formato -27.62900, -48.44900.');
    return { ...v, latitude: Number(partes[0]), longitude: Number(partes[1]), previsto: Number(v.previsto) };
  }

  document.getElementById('novo').addEventListener('click', () => P.dialogo({
    titulo: 'Cadastrar posto', corpo: formulario(), botao: 'Cadastrar',
    aoEnviar: async (v) => { if (!v.praia_id) throw new Error('Escolha a praia.'); const r = await api('/api/admin/postos', { method: 'POST', body: corpoDoPosto(v) }); await carregar(); return r.mensagem; },
  }));

  P.app.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const p = dados?.postos.find((x) => String(x.id) === (b.dataset.ver || b.dataset.editar || b.dataset.ativo));
    if (!p) return;
    if (b.dataset.editar) P.dialogo({
      titulo: `Editar ${p.praia_nome}, ${p.posto}`, corpo: formulario(p),
      aoEnviar: async (v) => { const r = await api('/api/admin/postos/' + p.id, { method: 'PUT', body: corpoDoPosto(v) }); await carregar(); return r.mensagem; },
    });
    if (b.dataset.ativo) P.dialogo({
      titulo: `${p.ativo ? 'Desativar' : 'Reativar'} ${p.praia_nome}, ${p.posto}`, botao: p.ativo ? 'Desativar posto' : 'Reativar posto',
      corpo: `${p.ativo ? `<p class="aviso">O posto sai do mapa público e das novas escalas. Escalas, registros e alertas antigos continuam no histórico.${p.lotados ? ` <strong>${p.lotados} guarda-vidas têm este posto como base</strong>: troque o posto base deles em Guarda-vidas.` : ''}</p>` : ''}
        <div class="campos"><label class="inteiro">Justificativa<textarea name="justificativa" required minlength="10" placeholder="Por que o posto está sendo ${p.ativo ? 'desativado' : 'reativado'}?"></textarea></label></div>`,
      aoEnviar: async (v) => { const r = await api(`/api/admin/postos/${p.id}/ativo`, { method: 'POST', body: { ativo: !p.ativo, justificativa: v.justificativa } }); await carregar(); return r.mensagem; },
    });
    if (b.dataset.ver) {
      const d = P.dialogo({ titulo: `${p.praia_nome}, ${p.posto}`, corpo: P.estado('carregando', 'Carregando...'), largo: true });
      try {
        const x = await api('/api/admin/postos/' + p.id);
        d.querySelector('.janela-corpo').innerHTML = `
          <dl class="detalhe-lista">
            <dt>Código</dt><dd>${esc(x.codigo)}${x.terminal ? `, terminal ${esc(x.terminal)}` : ', sem terminal'}</dd>
            <dt>Região</dt><dd>${esc(x.regiao)}</dd>
            <dt>Coordenadas</dt><dd>${x.latitude.toFixed(5)}, ${x.longitude.toFixed(5)} (${x.precisao === 'conferida' ? 'conferida' : 'aproximada'})
              <a href="https://www.openstreetmap.org/?mlat=${x.latitude}&mlon=${x.longitude}#map=18/${x.latitude}/${x.longitude}" target="_blank" rel="noopener">abrir no mapa</a></dd>
            <dt>Horário</dt><dd>${x.hora_inicio}–${x.hora_fim}${x.sazonal ? ', só na temporada' : ''}</dd>
            <dt>Registros no histórico</dt><dd>${x.registros}</dd>
          </dl>
          <h3>Escalados hoje</h3>
          ${tabela([{ titulo: 'Guarda-vidas', html: (g) => `<strong>${esc(g.codigo)}</strong> ${esc(g.nome)}` }, { titulo: 'Função', html: (g) => esc(g.funcao) }, { titulo: 'Horário', html: (g) => `${g.inicio}–${g.fim}` }], x.escalados, 'Ninguém escalado hoje.')}
          <h3>Têm este posto como base</h3>
          ${tabela([{ titulo: 'Guarda-vidas', html: (g) => `<strong>${esc(g.codigo)}</strong> ${esc(g.nome)}` }, { titulo: 'Vínculo', html: (g) => esc(g.vinculo) }, { titulo: 'Situação', html: (g) => P.seloDe('situacaoGV', g.situacao) }], x.lotados, 'Nenhum guarda-vidas tem este posto como base.')}`;
      } catch (e) { d.querySelector('.janela-corpo').innerHTML = P.estado('erro', e.message); }
    }
  });

  async function carregar() {
    try { dados = await api('/api/admin/postos'); desenhar(); }
    catch (e) { document.getElementById('lista').innerHTML = P.estado('erro', e.message); }
  }
  await carregar();
});
