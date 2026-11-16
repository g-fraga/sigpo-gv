// Visão geral (administração, todas as regiões) e "Minha região" (supervisão).
// Pensada para ser lida de cima para baixo: primeiro o resumo em uma frase, depois o que precisa
// de atenção e, por fim, a situação de cada posto.
P.iniciar(async (u) => {
  const { api, esc, selo, seloDe } = P;
  const admin = u.perfil === 'admin';
  const op = await P.opcoes();
  const STATUS = window.SIGPO.STATUS;

  P.app.innerHTML = `
    <form class="barra-filtros" id="filtros">
      ${admin ? `<label>Região<select name="regiao"><option value="">Toda a cidade</option>${op.regioes.filter((r) => r.id !== 'C').map((r) => `<option value="${r.id}">${esc(r.nome)}</option>`).join('')}</select></label>` : ''}
      <label>Praia<select name="praia"><option value="">Todas as praias</option>${op.praias.map((p) => `<option value="${p.slug}" data-regiao="${p.regiao_id}">${esc(p.nome)}</option>`).join('')}</select></label>
      <label class="filtro-check"><input type="checkbox" name="problemas"> Mostrar só postos com algo a resolver</label>
    </form>

    <div id="resumo">${P.estado('carregando', 'Carregando a situação dos postos...')}</div>
    <div id="regioes"></div>

    <div class="grade-visao">
      <section class="bloco" aria-labelledby="t-postos">
        <div class="bloco-topo">
          <h2 id="t-postos">Situação dos postos</h2>
          <ul class="legenda-situacao" aria-label="Legenda">
            <li><i class="cor-ok"></i>Equipe completa</li><li><i class="cor-atencao"></i>Falta gente</li><li><i class="cor-neutro"></i>Sem sinal</li>
          </ul>
        </div>
        <p class="bloco-nota">Toque em um posto para ver quem está escalado e se já chegou.</p>
        <div id="lista-postos"></div>
      </section>
      <div class="coluna-visao">
        <section class="bloco" aria-labelledby="t-atencao">
          <h2 id="t-atencao">Precisa de atenção</h2>
          <div id="atencao"></div>
        </section>
        <section class="bloco" aria-labelledby="t-mapa">
          <h2 id="t-mapa">Mapa</h2>
          <div class="mapa mapa-painel" id="mapa" role="region" aria-label="Mapa dos postos"></div>
        </section>
      </div>
    </div>`;

  const $ = (id) => document.getElementById(id);
  let mapa = null; let marcadores = null; let filtroDoMapa = null; let ultimo = null;
  const filtros = P.filtros($('filtros'), () => (ultimo && document.activeElement?.name === 'problemas' ? desenhar(ultimo) : carregar()));

  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const temProblema = (p) => p.pendentes > 0 || p.sem_sinal || p.presentes < p.previsto;

  // Frase que resume tudo, escrita para qualquer pessoa entender.
  function resumo(d) {
    const k = d.kpis;
    const comProblema = d.postos.filter(temProblema).length;
    const onde = admin && !d.regiao ? 'na cidade' : 'na região';
    const faltam = k.pendentes ? `${plural(k.pendentes, 'pessoa ainda não confirmou', 'pessoas ainda não confirmaram')} presença.` : 'Todos os escalados até agora já confirmaram presença.';
    const card = (valor, rotulo, nota, link, tom = '') => `<${link ? `a href="${link}"` : 'div'} class="cartao-numero ${tom}">
        <strong>${valor}</strong><span>${esc(rotulo)}</span>${nota ? `<small>${nota}</small>` : ''}</${link ? 'a' : 'div'}>`;
    return `
      <section class="resumo-dia">
        <p class="resumo-hora">Às ${d.relogio.hhmm} (horário da demonstração). Atualiza sozinho a cada minuto.</p>
        <p class="resumo-frase"><b>${k.presentes} de ${k.escalados}</b> guarda-vidas escalados hoje estão nos postos ${onde}. ${faltam}</p>
      </section>
      <div class="cartoes-numero">
        ${card(`${k.postos - comProblema}<em>/${k.postos}</em>`, 'postos sem problemas', comProblema ? plural(comProblema, 'posto precisa', 'postos precisam') + ' de atenção' : 'tudo certo')}
        ${card(`${k.presentes}<em>/${k.escalados}</em>`, 'guarda-vidas no posto', [k.intervalo ? plural(k.intervalo, 'em intervalo', 'em intervalo') : '', k.transito ? plural(k.transito, 'em deslocamento', 'em deslocamento') : ''].filter(Boolean).join(', '))}
        ${card(k.pendentes, 'não confirmaram presença', k.pendentes ? 'Ver quem' : '', k.pendentes ? '/painel/registros' : '', k.pendentes ? 'tom-perigo' : '')}
        ${card(k.alertas, 'alertas para tratar', k.alertas ? 'Abrir alertas' : '', k.alertas ? '/painel/alertas' : '', k.alertas ? 'tom-atencao' : '')}
      </div>`;
  }

  // Cartões por região (só na visão da cidade toda); clicar filtra pela região.
  function regioes(d) {
    if (!admin || d.regiao || d.regioes.length < 2) return '';
    return `<div class="cartoes-regiao">${d.regioes.map((r) => `<button type="button" class="cartao-regiao" data-regiao="${r.id}">
        <span>${esc(r.nome)}</span>
        <strong>${r.presentes} de ${r.escalados}</strong><small>no posto</small>
        ${r.pendentes || r.sem_sinal ? `<em>${[r.pendentes ? plural(r.pendentes, 'pendência', 'pendências') : '', r.sem_sinal ? plural(r.sem_sinal, 'terminal sem sinal', 'terminais sem sinal') : ''].filter(Boolean).join(', ')}</em>` : '<em class="ok">sem pendências</em>'}
      </button>`).join('')}</div>`;
  }

  // Lista de alertas em linguagem simples.
  const TITULO_ALERTA = { pendente: 'Não confirmou presença', offline: 'Terminal sem sinal', abaixo: 'Posto com menos gente', escala: 'Escala alterada', pulseira: 'Problema com pulseira' };
  function atencao(d) {
    if (!d.alertas.length) return P.estado('vazio', 'Nada pendente agora.');
    const itens = d.alertas.slice(0, 5).map((a) => `<li class="aviso-item aviso-${a.tipo === 'pendente' || a.tipo === 'offline' ? 'perigo' : 'atencao'}">
        <p class="aviso-titulo">${esc(TITULO_ALERTA[a.tipo] || a.titulo)} <small>${a.hora}</small></p>
        <p class="aviso-onde">${esc(a.praia)}, ${esc(a.posto)}</p>
        <p class="aviso-detalhe">${a.gv_nome ? `${esc(a.gv_nome)} (${esc(a.gv_codigo)}). ` : ''}${esc(a.detalhe || '')}</p>
      </li>`).join('');
    return `<ul class="lista-avisos">${itens}</ul><a class="botao botao-secundario botao-bloco" href="/painel/alertas">${d.alertas.length > 5 ? `Ver todos os ${d.alertas.length} alertas` : 'Tratar alertas'}</a>`;
  }

  function pessoas(p) {
    if (!p.pessoas.length) return P.estado('vazio', 'Ninguém escalado neste posto hoje.');
    return `<ul class="lista-pessoas">${p.pessoas.map((pe) => `<li>
      <span class="pessoa-nome">${esc(pe.nome)} <small>${esc(pe.codigo)}, ${esc(pe.funcao.toLowerCase())}, ${pe.inicio} às ${pe.fim}</small></span>
      <span>${seloDe('situacaoPessoa', pe.chave)}${pe.desde && pe.chave !== 'aguardando' && pe.chave !== 'pendentes' ? ` <small>desde ${pe.desde}</small>` : ''}</span></li>`).join('')}</ul>`;
  }

  function observacao(p) {
    if (p.sem_sinal) return `Sem sinal desde ${p.atualizado}`;
    const partes = [];
    if (p.pendentes) partes.push(plural(p.pendentes, 'não confirmou', 'não confirmaram'));
    if (p.intervalo) partes.push(plural(p.intervalo, 'em intervalo', 'em intervalo'));
    if (p.transito) partes.push(plural(p.transito, 'em deslocamento', 'em deslocamento'));
    return partes.join(', ');
  }

  function listaPostos(d) {
    const soProblemas = filtros().problemas;
    const lista = soProblemas ? d.postos.filter(temProblema) : d.postos;
    if (!lista.length) return P.estado('vazio', soProblemas ? 'Nenhum posto com problema agora.' : 'Nenhum posto com esses filtros.');
    const grupos = new Map();
    for (const p of lista) { if (!grupos.has(p.praia)) grupos.set(p.praia, []); grupos.get(p.praia).push(p); }
    return [...grupos].map(([praia, ps]) => `<div class="grupo-praia">
      <h3>${esc(praia)}</h3>
      ${ps.map((p) => `<details class="linha-posto" data-id="${p.id}">
        <summary>
          <span class="linha-posto-nome">${esc(p.nome)}${p.tipo === 'avancado' ? ' <small>avançado</small>' : ''}</span>
          <span class="linha-posto-equipe"><b>${p.presentes}</b> de ${p.previsto}</span>
          <span class="linha-posto-situacao">${selo(STATUS[p.status], P.tom(p.status))}</span>
          <span class="linha-posto-obs">${esc(observacao(p))}</span>
        </summary>
        ${pessoas(p)}
      </details>`).join('')}
    </div>`).join('');
  }

  function desenhar(d) {
    ultimo = d;
    $('resumo').innerHTML = resumo(d);
    $('regioes').innerHTML = regioes(d);
    const abertos = new Set([...document.querySelectorAll('.linha-posto[open]')].map((el) => el.dataset.id));
    $('lista-postos').innerHTML = listaPostos(d);
    for (const el of document.querySelectorAll('.linha-posto')) if (abertos.has(el.dataset.id)) el.open = true;
    $('atencao').innerHTML = atencao(d);

    // Mapa: na atualização automática só troca os marcadores; ao mudar o filtro, refaz o enquadramento.
    const chave = JSON.stringify({ regiao: filtros().regiao, praia: filtros().praia });
    if (!mapa) mapa = window.SIGPO.mapa.criarMapa($('mapa'));
    if (chave !== filtroDoMapa) {
      if (marcadores) Object.values(marcadores).forEach((m) => m.remove());
      marcadores = window.SIGPO.mapa.marcarPostos(mapa, d.postos, { link: false });
      if (d.postos.length) mapa.fitBounds(L.featureGroup(Object.values(marcadores)).getBounds(), { padding: [24, 24], maxZoom: 15 });
      filtroDoMapa = chave;
    } else window.SIGPO.mapa.atualizarMarcadores(marcadores, d.postos);
  }

  // Ao trocar a região, a lista de praias mostra só as daquela região.
  const selPraia = document.querySelector('[name=praia]');
  const selRegiao = document.querySelector('[name=regiao]');
  function filtrarPraias() {
    for (const o of selPraia.options) o.hidden = !!(selRegiao?.value && o.dataset.regiao && o.dataset.regiao !== selRegiao.value);
    if (selPraia.selectedOptions[0]?.hidden) selPraia.value = '';
  }
  selRegiao?.addEventListener('change', filtrarPraias);
  $('regioes').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-regiao]');
    if (!b || !selRegiao) return;
    selRegiao.value = b.dataset.regiao; filtrarPraias(); carregar();
  });

  async function carregar() {
    try { desenhar(await api('/api/painel/visao' + P.qs({ regiao: filtros().regiao, praia: filtros().praia }))); }
    catch (e) { $('resumo').innerHTML = P.estado('erro', e.message); }
  }
  await carregar();
  setInterval(carregar, 60_000);
});
