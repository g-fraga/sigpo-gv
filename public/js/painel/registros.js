// Registros de entrada e saída, inconsistências, registro manual e correção (administração e supervisão).
P.iniciar(async (u) => {
  const { api, esc, tabela, selo, seloDe, nome } = P;
  const admin = u.perfil === 'admin';
  const op = await P.opcoes();
  const TIPOS = ['apresentacao', 'intervalo', 'retorno', 'saida'];

  P.app.innerHTML = `
    <form class="barra-filtros" id="filtros">
      <label>De<input type="date" name="de" value="${op.hoje}" max="${op.hoje}"></label>
      <label>Até<input type="date" name="ate" value="${op.hoje}" max="${op.hoje}"></label>
      ${admin ? `<label>Região<select name="regiao"><option value="">Todas</option>${op.regioes.filter((r) => r.id !== 'C').map((r) => `<option value="${r.id}">${esc(r.nome)}</option>`).join('')}</select></label>` : ''}
      <label>Posto<select name="posto">${P.opcoesPostos(op.postos, '', { soAtivos: false })}</select></label>
      <label>Profissional<input type="search" name="gv" placeholder="Matrícula ou nome"></label>
      <label>Tipo<select name="tipo"><option value="">Todos</option>${[...TIPOS, 'negada'].map((t) => `<option value="${t}">${nome('tipo', t)}</option>`).join('')}</select></label>
      <label>Origem<select name="origem"><option value="">Todas</option><option value="nfc">Pulseira</option><option value="manual">Manual</option><option value="correcao">Correção</option></select></label>
      <span class="empurra"></span>
      <button class="botao" type="button" id="manual">Novo registro manual</button>
    </form>
    <div id="resultado">${P.estado('carregando', 'Carregando registros...')}</div>`;

  const filtros = P.filtros(document.getElementById('filtros'), () => carregar());
  let dados = null;

  function marcas(r) {
    const m = [];
    if (!r.sincronizado) m.push(selo('Aguardando sincronização', 'atencao'));
    else if (r.atraso_min > 5) m.push(selo(`Recebido ${r.recebida} (terminal sem sinal)`, 'info'));
    if (r.situacao === 'valido' && r.gv_id && !r.na_escala && r.tipo !== 'negada') m.push(selo('Fora da escala', 'atencao'));
    if (r.transito) m.push(selo('Saída para deslocamento', 'info'));
    if (r.corrige_id) m.push(selo(`Corrige o registro nº ${r.corrige_id}`, 'info'));
    return m.join(' ');
  }

  function desenhar() {
    const d = dados;
    const umDia = d.de === d.ate;
    document.getElementById('resultado').innerHTML = `
      ${umDia ? `<section class="bloco"><h2>Ausências e inconsistências <small>${d.inconsistencias.length}</small></h2>
        <p class="bloco-nota">${d.de === d.hoje ? `Situação de hoje até ${d.agora}. ` : ''}Uma ausência de registro não é falta: confirme com o posto antes de qualquer providência.</p>
        ${d.inconsistencias.length ? tabela([
          { titulo: 'O que foi encontrado', html: (i) => selo(i.titulo, i.tipo === 'sem_apresentacao' || i.tipo === 'negada' ? 'perigo' : 'atencao') },
          { titulo: 'Guarda-vidas', html: (i) => esc(i.gv) },
          { titulo: 'Posto', html: (i) => esc(i.posto) },
          { titulo: 'Detalhe', html: (i) => `<small>${esc(i.detalhe)}</small>` },
        ], d.inconsistencias) : P.estado('vazio', 'Nada fora do esperado neste dia.')}</section>` : '<p class="aviso aviso-info">Escolha um único dia para ver ausências e inconsistências.</p>'}
      <section class="bloco"><h2>Registros <small>${d.registros.length}${d.registros.length === 400 ? ' (mostrando os 400 mais recentes)' : ''}</small></h2>
        ${tabela([
          { titulo: 'Data e hora', html: (r) => `${P.data(r.data)} <strong>${r.hora.slice(0, 5)}</strong>` },
          { titulo: 'Guarda-vidas', html: (r) => (r.gv_codigo ? `<strong>${esc(r.gv_codigo)}</strong> ${esc(r.gv_nome)}` : '<small>Pulseira desconhecida</small>') },
          { titulo: 'Posto', html: (r) => `${esc(r.praia)}, ${esc(r.posto)}` },
          { titulo: 'Tipo', html: (r) => esc(nome('tipo', r.tipo)) },
          { titulo: 'Origem', html: (r) => `${esc(nome('origem', r.origem))}${r.autor ? `<small>por ${esc(r.autor.replace(' (fictício)', ''))}</small>` : ''}` },
          { titulo: 'Situação', html: (r) => `${seloDe('situacaoRegistro', r.situacao)} ${marcas(r)}${r.justificativa ? `<small>${esc(r.justificativa)}</small>` : ''}${r.observacoes && r.situacao !== 'valido' ? `<small>${esc(r.observacoes)}</small>` : ''}` },
          { titulo: 'Ações', classe: 'acoes', html: (r) => (r.situacao === 'valido' && r.gv_id ? `<button class="botao-pequeno" data-corrigir="${r.id}">Corrigir</button>` : '') },
        ], d.registros, 'Nenhum registro com esses filtros.')}
      </section>
      <section class="bloco"><h2>Movimentações <small>${d.movimentacoes.length}</small></h2>
        ${tabela([
          { titulo: 'Data', html: (m) => P.data(m.data) },
          { titulo: 'Guarda-vidas', html: (m) => `<strong>${esc(m.gv_codigo)}</strong> ${esc(m.gv_nome)}` },
          { titulo: 'De', html: (m) => (m.origem ? `${esc(m.origem_praia)}, ${esc(m.origem)}` : '–') },
          { titulo: 'Para', html: (m) => `${esc(m.destino_praia)}, ${esc(m.destino)}` },
          { titulo: 'Saída e chegada', html: (m) => `${m.saida || '–'} / ${m.chegada || '–'}` },
          { titulo: 'Motivo', html: (m) => `<small>${esc(m.motivo)}</small>` },
        ], d.movimentacoes, 'Nenhuma movimentação no período.')}
      </section>`;
  }

  // Registro manual: para postos sem terminal, terminal com defeito ou leitura que não funcionou.
  document.getElementById('manual').addEventListener('click', () => P.dialogo({
    titulo: 'Novo registro manual', botao: 'Salvar registro',
    corpo: `<p class="bloco-nota">Use quando não for possível registrar pela pulseira. Fica identificado com o seu nome, a data e a hora do lançamento.</p>
      <div class="campos">
        <label class="inteiro">Posto<select name="posto_id" required>${P.opcoesPostos(op.postos, '', { vazio: 'Escolha o posto' })}</select></label>
        <label class="inteiro">Guarda-vidas<select name="guarda_vidas_id" required><option value="">Escolha</option>${op.guarda_vidas.map((g) => `<option value="${g.id}">${esc(g.codigo)} ${esc(g.nome)}</option>`).join('')}</select></label>
        <label>Tipo<select name="tipo">${TIPOS.map((t) => `<option value="${t}">${nome('tipo', t)}</option>`).join('')}</select></label>
        <label>Data<input type="date" name="data" value="${op.hoje}" max="${op.hoje}" min="${P.somaDias(op.hoje, -7)}" required></label>
        <label>Horário<input type="time" name="hora" required value="${op.agora}"></label>
        <label class="inteiro">Justificativa<textarea name="justificativa" required minlength="10" placeholder="Ex.: posto avançado sem terminal; apresentação confirmada pelo rádio"></textarea></label>
        <label class="inteiro">Observações (opcional)<input name="observacoes" maxlength="500"></label>
      </div>`,
    aoEnviar: async (v) => {
      if (!v.posto_id || !v.guarda_vidas_id) throw new Error('Escolha o posto e o guarda-vidas.');
      if (v.justificativa.length < 10) throw new Error('Justificativa: escreva pelo menos 10 caracteres.');
      const r = await api('/api/painel/registros/manual', { method: 'POST', body: v }); await carregar(); return r.mensagem;
    },
  }));

  P.app.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-corrigir]'); if (!b) return;
    const r = dados.registros.find((x) => String(x.id) === b.dataset.corrigir);
    P.dialogo({
      titulo: `Corrigir registro nº ${r.id}`, botao: 'Salvar correção',
      corpo: `<p>${esc(r.gv_codigo)} ${esc(r.gv_nome)}: ${esc(nome('tipo', r.tipo))} às ${r.hora.slice(0, 5)} de ${P.data(r.data)} em ${esc(r.praia)}, ${esc(r.posto)}.</p>
        <p class="aviso aviso-info">O registro original não é apagado: ele fica marcado como corrigido e a correção entra como um novo registro.</p>
        <div class="campos">
          <label>Tipo correto<select name="tipo">${TIPOS.map((t) => `<option value="${t}" ${t === r.tipo ? 'selected' : ''}>${nome('tipo', t)}</option>`).join('')}</select></label>
          <label>Horário correto<input type="time" name="hora" value="${r.hora.slice(0, 5)}" required></label>
          <label class="inteiro">Justificativa<textarea name="justificativa" required minlength="10"></textarea></label>
        </div>`,
      aoEnviar: async (v) => { const x = await api(`/api/painel/registros/${r.id}/correcao`, { method: 'POST', body: v }); await carregar(); return x.mensagem; },
    });
  });

  async function carregar() {
    try { dados = await api('/api/painel/registros' + P.qs(filtros())); desenhar(); }
    catch (e) { document.getElementById('resultado').innerHTML = P.estado('erro', e.message); }
  }
  await carregar();
});
