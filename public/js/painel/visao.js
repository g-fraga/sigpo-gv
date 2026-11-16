// Visão geral (administração, todas as regiões) e visão da região (supervisão).
P.iniciar(async (u) => {
  const { api, esc, tabela, selo, seloDe, nome } = P;
  const admin = u.perfil === 'admin';
  const op = await P.opcoes();

  P.app.innerHTML = `
    <form class="barra-filtros" id="filtros">
      ${admin ? `<label>Região<select name="regiao"><option value="">Todas</option>${op.regioes.filter((r) => r.id !== 'C').map((r) => `<option value="${r.id}">${esc(r.nome)}</option>`).join('')}</select></label>` : ''}
      <label>Praia<select name="praia"><option value="">Todas</option>${op.praias.map((p) => `<option value="${p.slug}" data-regiao="${p.regiao_id}">${esc(p.nome)}</option>`).join('')}</select></label>
      <p class="filtro-nota" id="atualizado"></p>
    </form>
    <div id="numeros">${P.estado('carregando', 'Carregando a situação dos postos...')}</div>
    <div id="regioes"></div>
    <div class="grade-painel">
      <section class="bloco">
        <h2>Postos <small id="n-postos"></small></h2>
        <p class="bloco-nota">Abra um posto para ver quem está escalado e a situação de cada pessoa.</p>
        <div id="lista-postos"></div>
      </section>
      <aside>
        <section class="bloco"><h2>Mapa</h2><div class="mapa mapa-painel" id="mapa" role="region" aria-label="Mapa dos postos"></div></section>
        <section class="bloco"><h2>Alertas abertos <small id="n-alertas"></small></h2><div id="alertas"></div></section>
        <section class="bloco"><h2>Últimos registros</h2><div id="registros"></div></section>
        <section class="bloco"><h2>Movimentações de hoje</h2><div id="movimentacoes"></div></section>
      </aside>
    </div>`;

  const $ = (id) => document.getElementById(id);
  let mapa = null; let marcadores = null; let filtroDoMapa = null;
  const filtros = P.filtros(document.getElementById('filtros'), () => carregar());

  const numero = (valor, rotulo, extra = '', link = '') => `<div class="numero-card">${link ? `<a href="${link}">` : ''}
    <strong>${valor}</strong><span>${esc(rotulo)}</span>${extra ? `<small>${extra}</small>` : ''}${link ? '</a>' : ''}</div>`;

  function pessoas(p) {
    if (!p.pessoas.length) return P.estado('vazio', 'Ninguém escalado neste posto hoje.');
    return `<ul class="lista-pessoas">${p.pessoas.map((pe) => `<li>
      <span><strong>${esc(pe.codigo)}</strong> ${esc(pe.nome)}<small>${esc(pe.funcao)}, ${pe.inicio}–${pe.fim}</small></span>
      <span>${seloDe('situacaoPessoa', pe.chave)} <small>${pe.desde ? 'desde ' + pe.desde : ''}</small></span></li>`).join('')}</ul>`;
  }

  function desenhar(d) {
    const k = d.kpis;
    document.getElementById('atualizado').textContent = `Situação às ${d.relogio.hhmm} (horário da demonstração). Atualiza a cada minuto.`;
    const linhasPostos = d.postos.map((p) => `
      <details class="posto-linha posto-linha-${p.status}" data-id="${p.id}">
        <summary>
          <span class="posto-linha-nome"><strong>${esc(p.praia)}</strong> ${esc(p.nome)}${p.tipo === 'avancado' ? ' <small>(avançado)</small>' : ''}</span>
          <span>${selo(window.SIGPO.STATUS[p.status], P.tom(p.status))}</span>
          <span class="posto-linha-num" title="Previsto: ${p.previsto}"><b>${p.presentes}</b>/${p.escalados} <small>no posto</small></span>
          <span class="posto-linha-hora">${p.pendentes ? `<b class="pend">${p.pendentes} pendente${p.pendentes > 1 ? 's' : ''}</b>` : ''}${p.sem_sinal ? `<b class="pend">sem sinal desde ${p.atualizado}</b>` : ''}${!p.pendentes && !p.sem_sinal && p.intervalo ? `${p.intervalo} em intervalo` : ''}</span>
        </summary>
        ${pessoas(p)}
      </details>`).join('');

    const abertos = new Set([...document.querySelectorAll('.posto-linha[open]')].map((d) => d.dataset.id));
    $('numeros').innerHTML = `<div class="numeros-painel">
        ${numero(k.postos, 'postos ativos', k.postos_com_pendencia ? `${k.postos_com_pendencia} com pendência ou sem sinal` : 'sem pendências')}
        ${numero(k.escalados, 'escalados hoje', `${k.gv_cadastrados} guarda-vidas ${admin && !d.regiao ? 'cadastrados' : 'com posto base na região'}`)}
        ${numero(k.presentes, 'no posto agora', `${k.intervalo} em intervalo, ${k.transito} em deslocamento`)}
        ${numero(k.pendentes, 'confirmações pendentes', 'ver inconsistências', '/painel/registros')}
        ${numero(k.alertas, 'alertas abertos', 'tratar alertas', '/painel/alertas')}
        ${numero(k.revisoes, 'pedidos de revisão', 'aguardando análise', '/painel/revisoes')}
      </div>`;
    $('regioes').innerHTML = admin && !d.regiao && d.regioes.length > 1 ? `<section class="bloco"><h2>Por região</h2>${tabela([
      { titulo: 'Região', html: (r) => `<strong>${esc(r.nome)}</strong>` },
      { titulo: 'Postos', html: (r) => r.postos, classe: 'num' },
      { titulo: 'Escalados', html: (r) => r.escalados, classe: 'num' },
      { titulo: 'No posto', html: (r) => r.presentes, classe: 'num' },
      { titulo: 'Pendências', html: (r) => (r.pendentes ? selo(r.pendentes, 'perigo') : '0'), classe: 'num' },
      { titulo: 'Terminais sem sinal', html: (r) => r.sem_sinal, classe: 'num' },
    ], d.regioes)}</section>` : '';
    $('n-postos').textContent = d.postos.length;
    $('lista-postos').innerHTML = d.postos.length ? linhasPostos : P.estado('vazio', 'Nenhum posto com esses filtros.');
    for (const det of document.querySelectorAll('.posto-linha')) if (abertos.has(det.dataset.id)) det.open = true;
    $('n-alertas').textContent = d.alertas.length;
    $('alertas').innerHTML = d.alertas.length ? `<ul class="lista-alertas">${d.alertas.slice(0, 6).map((a) => `<li>
        <span>${P.selo(nome('tipoAlerta', a.tipo), a.tipo === 'pendente' || a.tipo === 'offline' ? 'perigo' : 'atencao')} <small>${a.hora}</small></span>
        <strong>${esc(a.praia)}, ${esc(a.posto)}</strong>
        <span>${esc(a.gv_codigo ? a.gv_codigo + ' ' + a.gv_nome + '. ' : '')}${esc(a.detalhe || a.titulo)}</span></li>`).join('')}</ul>
        <a class="link-mais" href="/painel/alertas">Tratar alertas</a>` : P.estado('vazio', 'Nenhum alerta aberto.');
    $('registros').innerHTML = d.registros.length ? `<ul class="lista-simples">${d.registros.map((r) => `<li><span class="hora">${r.hora}</span>
        <span><strong>${esc(r.gv_codigo || '')}</strong> ${esc(nome('tipo', r.tipo))} <small>${esc(r.praia)}, ${esc(r.posto)}${r.origem !== 'nfc' ? ' (' + esc(nome('origem', r.origem)) + ')' : ''}${r.sincronizado ? '' : ', aguardando sincronização'}</small></span></li>`).join('')}</ul>
        <a class="link-mais" href="/painel/registros">Ver todos os registros</a>` : P.estado('vazio', 'Nenhum registro hoje.');
    $('movimentacoes').innerHTML = d.movimentacoes.length ? `<ul class="lista-simples">${d.movimentacoes.map((m) => `<li><span class="hora">${m.saida || ''}</span>
        <span><strong>${esc(m.gv_codigo)}</strong> ${esc(m.origem_praia ? m.origem_praia + ', ' + m.origem : '')} para ${esc(m.destino_praia)}, ${esc(m.destino)}
        <small>${esc(m.motivo)}${m.chegada ? '. Chegou às ' + m.chegada : ''}</small></span></li>`).join('')}</ul>` : P.estado('vazio', 'Nenhuma movimentação hoje.');

    // Mapa: na atualização automática só troca os marcadores; ao mudar o filtro, refaz o enquadramento.
    const chave = JSON.stringify(filtros());
    if (!mapa) mapa = window.SIGPO.mapa.criarMapa($('mapa'));
    if (chave !== filtroDoMapa) {
      if (marcadores) Object.values(marcadores).forEach((m) => m.remove());
      marcadores = window.SIGPO.mapa.marcarPostos(mapa, d.postos, { link: false });
      if (d.postos.length) mapa.fitBounds(L.featureGroup(Object.values(marcadores)).getBounds(), { padding: [24, 24], maxZoom: 15 });
      filtroDoMapa = chave;
    } else window.SIGPO.mapa.atualizarMarcadores(marcadores, d.postos);
  }

  // Ao trocar a região, a lista de praias mostra só as daquela região.
  if (admin) {
    const selRegiao = document.querySelector('[name=regiao]'); const selPraia = document.querySelector('[name=praia]');
    selRegiao.addEventListener('change', () => {
      for (const o of selPraia.options) o.hidden = !!(selRegiao.value && o.dataset.regiao && o.dataset.regiao !== selRegiao.value);
      if (selPraia.selectedOptions[0]?.hidden) selPraia.value = '';
    });
  }

  async function carregar() {
    try { desenhar(await api('/api/painel/visao' + P.qs(filtros()))); }
    catch (e) { $('numeros').innerHTML = P.estado('erro', e.message); }
  }
  await carregar();
  setInterval(carregar, 60_000);
});
