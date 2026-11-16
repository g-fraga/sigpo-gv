// Escalas: a administração cria e altera (cada alteração vira uma nova versão); a supervisão só consulta a sua região.
P.iniciar(async (u) => {
  const { api, esc, tabela, selo } = P;
  const admin = u.perfil === 'admin';
  const op = await P.opcoes();

  P.app.innerHTML = `
    <form class="barra-filtros" id="filtros">
      <label>Data<input type="date" name="data" value="${op.hoje}" required></label>
      ${admin ? `<label>Região<select name="regiao"><option value="">Todas</option>${op.regioes.filter((r) => r.id !== 'C').map((r) => `<option value="${r.id}">${esc(r.nome)}</option>`).join('')}</select></label>` : ''}
      <label>Praia<select name="praia"><option value="">Todas</option>${op.praias.map((p) => `<option value="${p.slug}">${esc(p.nome)}</option>`).join('')}</select></label>
      <label>Posto<select name="posto">${P.opcoesPostos(op.postos)}</select></label>
      <span class="empurra"></span>
      ${admin ? '<button class="botao botao-secundario" type="button" id="gerar">Gerar a partir do posto base</button>' : ''}
    </form>
    <div id="resultado">${P.estado('carregando', 'Carregando escalas...')}</div>`;

  const filtros = P.filtros(document.getElementById('filtros'), () => carregar());
  let dados = null;
  let pessoas = null; // lista de guarda-vidas para o editor (carregada quando necessário)

  // Compara duas versões e diz quem entrou, saiu ou mudou de horário.
  function diferenca(antes, depois) {
    const a = new Map(antes.itens.map((i) => [i.guarda_vidas_id, i])); const d = new Map(depois.itens.map((i) => [i.guarda_vidas_id, i]));
    const mud = [];
    for (const [id, i] of d) if (!a.has(id)) mud.push(`entrou ${i.codigo}`); else if (a.get(id).inicio !== i.inicio || a.get(id).fim !== i.fim) mud.push(`${i.codigo} passou para ${i.inicio}–${i.fim}`);
    for (const [id, i] of a) if (!d.has(id)) mud.push(`saiu ${i.codigo}`);
    return mud.join(', ') || 'sem mudança de pessoas';
  }

  function cartao(p) {
    const v = p.vigente;
    const faltam = v ? p.previsto - v.itens.length : p.previsto;
    return `<section class="bloco escala-posto">
      <div class="bloco-topo">
        <h2>${esc(p.praia)}, ${esc(p.nome)} <small>${esc(p.codigo)}</small></h2>
        <span>${v ? `${v.itens.length} de ${p.previsto} previstos ${faltam > 0 ? selo(`faltam ${faltam}`, 'atencao') : ''}` : selo('Sem escala neste dia', 'perigo')}
          ${dados.editavel ? ` <button class="botao-pequeno" data-editar="${p.id}">${v ? 'Alterar escala' : 'Criar escala'}</button>` : ''}</span>
      </div>
      ${v ? `<p class="bloco-nota">Versão ${v.versao}, publicada em ${v.publicada_em}${v.publicada_por ? ' por ' + esc(v.publicada_por.replace(' (fictício)', '')) : ''}. ${esc(v.justificativa || '')}</p>
        ${tabela([
          { titulo: 'Guarda-vidas', html: (i) => `<strong>${esc(i.codigo)}</strong> ${esc(i.nome)}` },
          { titulo: 'Função', html: (i) => esc(i.funcao) },
          { titulo: 'Horário', html: (i) => `${i.inicio}–${i.fim}` },
        ], v.itens, 'Escala sem pessoas.')}
        ${p.versoes.length > 1 ? `<details class="historico-versoes"><summary>Histórico de alterações (${p.versoes.length} versões)</summary><ol class="historico">
          ${p.versoes.slice().reverse().map((x, i, arr) => `<li><strong>Versão ${x.versao}</strong>, ${x.publicada_em}${x.publicada_por ? ', ' + esc(x.publicada_por.replace(' (fictício)', '')) : ''}
            <small>${esc(x.justificativa || '')}${arr[i + 1] ? '. Mudança: ' + esc(diferenca(arr[i + 1], x)) : ''}</small></li>`).join('')}</ol></details>` : ''}` : ''}
    </section>`;
  }

  function desenhar() {
    const d = dados;
    document.getElementById('resultado').innerHTML = `
      ${!d.editavel && admin ? '<p class="aviso aviso-info">Escalas de dias anteriores fazem parte do histórico e não podem ser alteradas.</p>' : ''}
      ${!admin ? '<p class="aviso aviso-info">Consulta da escala da sua região. Alterações são feitas pela administração.</p>' : ''}
      <div class="grade-painel">
        <div>${d.postos.length ? d.postos.map(cartao).join('') : P.estado('vazio', 'Nenhum posto com esses filtros.')}</div>
        <aside>
          <section class="bloco"><h2>Conflitos <small>${d.conflitos.length}</small></h2>
            ${d.conflitos.length ? `<ul class="lista-alertas">${d.conflitos.map((c) => `<li><strong>${esc(c.codigo)} ${esc(c.nome)}</strong><span>Escalado em ${esc(c.praia_a)}, ${esc(c.posto_a)} e em ${esc(c.praia_b)}, ${esc(c.posto_b)} no mesmo horário.</span></li>`).join('')}</ul>`
              : P.estado('vazio', 'Nenhuma pessoa escalada em dois postos ao mesmo tempo.')}</section>
          <section class="bloco"><h2>Sem alocação <small>${d.sem_alocacao.length}</small></h2>
            <p class="bloco-nota">Guarda-vidas ativos que não estão em nenhuma escala deste dia${admin ? '' : ' (com posto base na sua região)'}.</p>
            ${d.sem_alocacao.length ? `<ul class="lista-simples">${d.sem_alocacao.map((g) => `<li><span></span><span><strong>${esc(g.codigo)}</strong> ${esc(g.nome)}<small>${g.posto_base ? 'Posto base: ' + esc(g.praia_base) + ', ' + esc(g.posto_base) : 'Reserva, sem posto base'}</small></span></li>`).join('')}</ul>`
              : P.estado('vazio', 'Todos estão alocados.')}</section>
        </aside>
      </div>`;
  }

  // Editor de escala: linhas com pessoa, função e horário.
  function linhaEditor(i = {}) {
    return `<tr>
      <td><select name="gv" required><option value="">Escolha</option>${pessoas.map((g) => `<option value="${g.id}" ${g.id === i.guarda_vidas_id ? 'selected' : ''}>${esc(g.codigo)} ${esc(g.nome)}</option>`).join('')}</select></td>
      <td><select name="funcao"><option ${i.funcao === 'Chefe de posto' ? 'selected' : ''}>Chefe de posto</option><option ${i.funcao !== 'Chefe de posto' ? 'selected' : ''}>Guarda-vidas</option></select></td>
      <td><input type="time" name="inicio" value="${i.inicio || '08:00'}" required></td>
      <td><input type="time" name="fim" value="${i.fim || '19:00'}" required></td>
      <td><button type="button" class="botao-pequeno perigo" data-remover aria-label="Remover linha">Remover</button></td></tr>`;
  }

  async function editar(postoId) {
    const p = dados.postos.find((x) => String(x.id) === String(postoId));
    pessoas ||= (await api('/api/admin/guarda-vidas?situacao=ativo')).guarda_vidas;
    const v = p.vigente;
    P.dialogo({
      titulo: `${v ? 'Alterar' : 'Criar'} escala: ${p.praia}, ${p.nome}`, largo: true, botao: v ? `Salvar versão ${v.versao + 1}` : 'Criar escala',
      corpo: `<p class="bloco-nota">Dia ${P.data(dados.data)}. Efetivo previsto: ${p.previsto}. ${v ? 'A versão atual fica guardada no histórico.' : ''}</p>
        <div class="tabela-rolagem"><table class="tabela tabela-editor"><thead><tr><th>Guarda-vidas</th><th>Função</th><th>Início</th><th>Fim</th><th></th></tr></thead>
        <tbody id="linhas">${(v ? v.itens : []).map(linhaEditor).join('')}</tbody></table></div>
        <p><button type="button" class="botao-pequeno" id="mais">Adicionar pessoa</button></p>
        <div class="campos"><label class="inteiro">Justificativa${v ? '' : ' (opcional)'}<textarea name="justificativa" ${v ? 'required minlength="10"' : ''} placeholder="${v ? 'Ex.: reforço por causa do movimento na praia' : ''}"></textarea></label></div>`,
      aoAbrir: (form) => {
        form.querySelector('#mais').onclick = () => form.querySelector('#linhas').insertAdjacentHTML('beforeend', linhaEditor());
        form.addEventListener('click', (e) => { if (e.target.matches('[data-remover]')) e.target.closest('tr').remove(); });
      },
      aoEnviar: async (vals, form) => {
        const itens = [...form.querySelectorAll('#linhas tr')].map((tr) => ({
          guarda_vidas_id: Number(tr.querySelector('[name=gv]').value), funcao: tr.querySelector('[name=funcao]').value,
          inicio: tr.querySelector('[name=inicio]').value, fim: tr.querySelector('[name=fim]').value,
        }));
        if (itens.some((i) => !i.guarda_vidas_id)) throw new Error('Escolha a pessoa em todas as linhas (ou remova a linha vazia).');
        const r = await api('/api/admin/escalas', { method: 'PUT', body: { posto_id: p.id, data: dados.data, itens, justificativa: vals.justificativa } });
        await carregar(); return r.mensagem;
      },
    });
  }

  P.app.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.editar) editar(b.dataset.editar);
    if (b.id === 'gerar') P.dialogo({
      titulo: 'Gerar escalas a partir do posto base', botao: 'Gerar',
      corpo: `<p>Cria a versão 1 da escala de ${P.data(filtros().data)} para os postos ativos que ainda não têm escala nesse dia, com as pessoas que têm cada posto como base. Postos que já têm escala não mudam.</p>`,
      aoEnviar: async () => { const r = await api('/api/admin/escalas/gerar', { method: 'POST', body: { data: filtros().data } }); await carregar(); return r.mensagem; },
    });
  });

  async function carregar() {
    try { dados = await api('/api/painel/escalas' + P.qs(filtros())); desenhar(); }
    catch (e) { document.getElementById('resultado').innerHTML = P.estado('erro', e.message); }
  }
  await carregar();
});
