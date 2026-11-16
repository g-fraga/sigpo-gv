// Administração: pulseiras NFC (e cartões reserva). Cada pessoa tem uma credencial ativa por vez.
P.iniciar(async () => {
  const { api, esc, tabela, selo, seloDe } = P;
  P.app.innerHTML = `
    <p class="aviso aviso-info">Cada guarda-vidas tem uma credencial ativa por vez: a pulseira ou, se ela se perder, um cartão reserva. Credenciais bloqueadas ou substituídas ficam no histórico e são recusadas pelos terminais.</p>
    <div id="sem"></div>
    <form class="barra-filtros" id="filtros">
      <label>Buscar<input type="search" name="busca" placeholder="Código, matrícula ou nome"></label>
      <label>Situação<select name="situacao"><option value="">Todas</option><option value="ativa">Ativas</option><option value="bloqueada">Bloqueadas</option><option value="substituida">Substituídas</option><option value="inativa">Inativas</option></select></label>
      <span class="empurra"></span>
      <button class="botao" type="button" id="novo">Vincular pulseira</button>
    </form>
    <div id="lista">${P.estado('carregando', 'Carregando...')}</div>`;
  const filtros = P.filtros(document.getElementById('filtros'), () => carregar());
  let dados = null;

  const campoChip = (rotulo = 'Código da pulseira') => `<label class="inteiro">${rotulo}<input name="numero_chip" required placeholder="04:A1:B2:C3:D4:E5:F6" autocomplete="off">
    <small>É o número gravado no chip. Num posto real, ele é lido aproximando a pulseira do leitor.</small></label>`;
  const campoTipo = '<label class="inteiro">Tipo<select name="tipo"><option value="pulseira">Pulseira</option><option value="cartao_reserva">Cartão reserva</option></select></label>';

  function vincular(gvId = '') {
    P.dialogo({
      titulo: 'Vincular pulseira', botao: 'Vincular',
      corpo: `<div class="campos"><label class="inteiro">Guarda-vidas (sem credencial ativa)<select name="guarda_vidas_id" required><option value="">Escolha</option>
        ${dados.sem_credencial.map((g) => `<option value="${g.id}" ${String(g.id) === String(gvId) ? 'selected' : ''}>${esc(g.codigo)} ${esc(g.nome)}</option>`).join('')}</select></label>${campoChip()}${campoTipo}</div>`,
      aoEnviar: async (v) => { if (!v.guarda_vidas_id) throw new Error('Escolha o guarda-vidas.'); const r = await api('/api/admin/pulseiras', { method: 'POST', body: v }); await carregar(); return r.mensagem; },
    });
  }

  function desenhar() {
    const sem = dados.sem_credencial;
    document.getElementById('sem').innerHTML = sem.length ? `<section class="bloco"><h2>Sem credencial ativa <small>${sem.length}</small></h2>
      <p class="bloco-nota">Estes guarda-vidas ativos não conseguem registrar presença nos terminais.</p>
      <ul class="lista-simples">${sem.map((g) => `<li><span></span><span><strong>${esc(g.codigo)}</strong> ${esc(g.nome)} <button class="botao-pequeno" data-vincular="${g.id}">Vincular</button></span></li>`).join('')}</ul></section>` : '';
    document.getElementById('lista').innerHTML = `<section class="bloco"><h2>Credenciais <small>${dados.pulseiras.length}</small></h2>${tabela([
      { titulo: 'Código', html: (p) => `<strong>${esc(p.numero_chip)}</strong><small>${p.tipo === 'pulseira' ? 'Pulseira' : 'Cartão reserva'}</small>` },
      { titulo: 'Guarda-vidas', html: (p) => `${esc(p.codigo)} ${esc(p.nome)}${p.gv_situacao !== 'ativo' ? `<small>${esc(P.nome('situacaoGV', p.gv_situacao))}</small>` : ''}` },
      { titulo: 'Situação', html: (p) => seloDe('situacaoPulseira', p.situacao) },
      { titulo: 'Emitida', html: (p) => p.emitida },
      { titulo: 'Observação', html: (p) => `<small>${esc(p.motivo || '')}</small>` },
      { titulo: 'Ações', classe: 'acoes', html: (p) => (p.situacao === 'ativa' ? `<button class="botao-pequeno perigo" data-bloquear="${p.id}">Bloquear</button> <button class="botao-pequeno" data-substituir="${p.id}">Substituir</button> <button class="botao-pequeno" data-desativar="${p.id}">Desativar</button>`
        : p.situacao === 'bloqueada' && p.gv_situacao === 'ativo' ? `<button class="botao-pequeno" data-substituir="${p.id}">Substituir</button>` : '') },
    ], dados.pulseiras)}</section>`;
  }

  P.app.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'novo') return vincular();
    if (b.dataset.vincular) return vincular(b.dataset.vincular);
    const p = dados.pulseiras.find((x) => String(x.id) === (b.dataset.bloquear || b.dataset.substituir || b.dataset.desativar));
    if (!p) return;
    const quem = `${p.codigo} ${p.nome}`;
    if (b.dataset.bloquear) P.dialogo({
      titulo: 'Bloquear credencial', botao: 'Bloquear',
      corpo: `<p>${esc(p.numero_chip)} de <strong>${esc(quem)}</strong>. Depois de bloqueada, a pulseira é recusada nos terminais.</p>
        <div class="campos"><label class="inteiro">Motivo<select name="motivo"><option value="perda">Perda</option><option value="roubo">Roubo ou furto</option><option value="defeito">Defeito</option><option value="outro">Outro</option></select></label>
        <label class="inteiro">Detalhe (opcional)<input name="detalhe" maxlength="200"></label></div>`,
      aoEnviar: async (v) => { const r = await api(`/api/admin/pulseiras/${p.id}/bloquear`, { method: 'POST', body: v }); await carregar(); return r.mensagem; },
    });
    if (b.dataset.substituir) P.dialogo({
      titulo: 'Substituir credencial', botao: 'Substituir',
      corpo: `<p>A credencial ${esc(p.numero_chip)} de <strong>${esc(quem)}</strong> será trocada pela nova.</p><div class="campos">${campoChip('Código da nova pulseira')}${campoTipo}
        <label class="inteiro">Motivo<input name="motivo" required minlength="5" maxlength="200" placeholder="Ex.: pulseira perdida no mar"></label></div>`,
      aoEnviar: async (v) => { const r = await api(`/api/admin/pulseiras/${p.id}/substituir`, { method: 'POST', body: v }); await carregar(); return r.mensagem; },
    });
    if (b.dataset.desativar) P.dialogo({
      titulo: 'Desativar credencial', botao: 'Desativar',
      corpo: `<p>${esc(p.numero_chip)} de <strong>${esc(quem)}</strong>. A pessoa fica sem credencial ativa até receber outra.</p>
        <div class="campos"><label class="inteiro">Motivo<input name="motivo" required minlength="5" maxlength="200" placeholder="Ex.: fim da temporada"></label></div>`,
      aoEnviar: async (v) => { const r = await api(`/api/admin/pulseiras/${p.id}/desativar`, { method: 'POST', body: v }); await carregar(); return r.mensagem; },
    });
  });

  async function carregar() {
    try { dados = await api('/api/admin/pulseiras' + P.qs(filtros())); desenhar(); }
    catch (e) { document.getElementById('lista').innerHTML = P.estado('erro', e.message); }
  }
  await carregar();
});
