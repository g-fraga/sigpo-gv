// Mapa com Leaflet + OpenStreetMap. Cada posto vira um marcador com o número de guarda-vidas no posto.
(() => {
  const { esc, selo, frasePosto } = window.SIGPO;

  function criarMapa(elemento, { centro = [-27.61, -48.47], zoom = 11 } = {}) {
    const mapa = L.map(elemento, { scrollWheelZoom: false, zoomSnap: 0.25 }).setView(centro, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa);
    // A roda do mouse só dá zoom depois de clicar no mapa, para não "prender" a rolagem da página.
    mapa.on('click', () => mapa.scrollWheelZoom.enable());
    mapa.on('mouseout', () => mapa.scrollWheelZoom.disable());
    return mapa;
  }

  function icone(p) {
    const numero = p.em_horario ? p.presentes : '–';
    return L.divIcon({
      className: '',
      html: `<span class="pino pino-${p.status}"><b>${numero}</b></span>`,
      iconSize: [34, 34],
      iconAnchor: [4, 32],
      popupAnchor: [13, -30],
    });
  }

  function conteudoPopup(p, link) {
    return `
        <strong>${esc(p.praia)}</strong>
        <p>${esc(p.nome)}${p.tipo === 'avancado' ? ' (posto avançado)' : ''}</p>
        <p>${selo(p.status)}</p>
        ${p.em_horario ? `<p><b>${p.presentes}</b> de ${p.previsto} guarda-vidas no posto</p>` : ''}
        <p>${esc(frasePosto(p))}</p>
        ${link ? `<a class="botao-popup" href="/praias/${encodeURIComponent(p.slug)}#posto-${p.id}">Ver a praia</a>` : ''}`;
  }

  function marcarPostos(mapa, postos, { link = true } = {}) {
    const marcadores = {};
    for (const p of postos) {
      const texto = `${p.praia}, ${p.nome}: ${p.em_horario ? p.presentes + ' de ' + p.previsto + ' guarda-vidas' : 'fora do horário'}`;
      const m = L.marker([p.latitude, p.longitude], { icon: icone(p), title: texto, alt: texto, keyboard: true }).addTo(mapa);
      m.bindPopup(conteudoPopup(p, link));
      m.link = link;
      marcadores[p.id] = m;
    }
    return marcadores;
  }

  function atualizarMarcadores(marcadores, postos) {
    for (const p of postos) {
      const m = marcadores[p.id];
      if (!m) continue;
      m.setIcon(icone(p));
      m.setPopupContent(conteudoPopup(p, m.link));
    }
  }

  window.SIGPO.mapa = { criarMapa, marcarPostos, atualizarMarcadores };
})();
