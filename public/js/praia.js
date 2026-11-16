// Página de uma praia: um cartão por posto e o mapa da praia.
(() => {
  const { api, esc, selo, frasePosto } = window.SIGPO;
  const { criarMapa, marcarPostos, atualizarMarcadores } = window.SIGPO.mapa;
  const slug = document.getElementById('praia').dataset.slug;
  let mapa = null; let marcadores = null;

  function cartao(p) {
    let nota = '';
    if (p.tipo === 'avancado') nota = 'Posto avançado, sem terminal de pulseira: o efetivo é confirmado pela supervisão por rádio.';
    if (p.sem_sinal) nota = `O terminal deste posto está sem sinal desde ${p.atualizado}. O número mostrado é o último recebido; os registros ficam guardados no aparelho e chegam quando o sinal voltar.`;
    const extras = [p.observacao, p.sazonal ? 'Funciona só na alta temporada.' : '', p.precisao !== 'conferida' ? 'Posição no mapa aproximada.' : '']
      .filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('');
    return `<article class="posto posto-${p.status}" id="posto-${p.id}">
      <div class="posto-topo"><h2>${esc(p.nome)}</h2>${selo(p.status)}</div>
      <p class="posto-efetivo"><b>${p.em_horario ? p.presentes : 0}</b><span>de ${p.previsto} guarda-vidas previstos ${p.sem_sinal ? 'no último dado recebido' : 'no posto agora'}</span></p>
      <p class="posto-info"><span>${esc(frasePosto(p))}</span><span>Horário do posto: ${p.hora_inicio} às ${p.hora_fim}</span></p>
      ${extras ? `<p class="posto-info">${extras}</p>` : ''}
      ${nota ? `<p class="posto-nota">${esc(nota)}</p>` : ''}
    </article>`;
  }

  async function carregar() {
    try {
      const d = await api('/api/publico/praias/' + encodeURIComponent(slug));
      document.getElementById('agora').textContent = `Situação às ${d.relogio.hhmm} (horário simulado da demonstração). Atualiza sozinho a cada minuto.`;
      document.getElementById('resumo').innerHTML = `
        <div><dt>postos</dt><dd>${d.praia.postos}</dd></div>
        <div><dt>guarda-vidas no posto</dt><dd>${d.praia.no_posto}</dd></div>
        <div><dt>previstos para hoje</dt><dd>${d.praia.previstos}</dd></div>`;
      if (!d.postos.length) {
        // Praia sem posto cadastrado: sem mapa, com orientação ao banhista.
        document.getElementById('resumo').innerHTML = '';
        document.getElementById('agora').textContent = 'Nenhum posto de guarda-vidas cadastrado nesta praia.';
        document.getElementById('mapa').remove();
        document.getElementById('postos').innerHTML = `<div class="destaque sem-posto-caixa">
          ${d.praia.observacao ? `<p><strong>${esc(d.praia.observacao)}.</strong></p>` : ''}
          <p>Sem guarda-vidas, o risco aumenta. Prefira tomar banho em praias vigiadas, entre as bandeiras vermelha e amarela, e veja as <a href="/seguranca">orientações de segurança</a>.</p>
          <p>A qualidade da água é avaliada pelo IMA: consulte o <a href="https://balneabilidade.ima.sc.gov.br/">relatório de balneabilidade</a>.</p>
          <p>Em emergência, ligue <a href="tel:193">193</a>.</p>
        </div>`;
        clearInterval(repetir);
        return;
      }
      document.getElementById('postos').innerHTML = d.postos.map(cartao).join('');
      if (!mapa) {
        mapa = criarMapa('mapa', { centro: [d.praia.latitude, d.praia.longitude], zoom: 14 });
        marcadores = marcarPostos(mapa, d.postos, { link: false });
        const grupo = L.featureGroup(Object.values(marcadores));
        if (d.postos.length > 1) mapa.fitBounds(grupo.getBounds().pad(0.4), { maxZoom: 15 });
        if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
      } else atualizarMarcadores(marcadores, d.postos);
    } catch (e) { document.getElementById('agora').textContent = e.message; }
  }
  const repetir = setInterval(carregar, 60_000);
  carregar();
})();
