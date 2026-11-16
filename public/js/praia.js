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
    return `<article class="posto posto-${p.status}" id="posto-${p.id}">
      <div class="posto-topo"><h2>${esc(p.nome)}</h2>${selo(p.status)}</div>
      <p class="posto-efetivo"><b>${p.em_horario ? p.presentes : 0}</b><span>de ${p.previsto} guarda-vidas previstos ${p.sem_sinal ? 'no último dado recebido' : 'no posto agora'}</span></p>
      <p class="posto-info"><span>${esc(frasePosto(p))}</span><span>Horário do posto: ${p.hora_inicio} às ${p.hora_fim}</span></p>
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
  carregar();
  setInterval(carregar, 60_000);
})();
