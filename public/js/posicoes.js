// Tela de administração: conferir a posição de cada posto arrastando o marcador ou colando a coordenada.
(() => {
  const { api, esc } = window.SIGPO;
  const { criarMapa } = window.SIGPO.mapa;
  const mapa = criarMapa('mapa');
  mapa.scrollWheelZoom.enable();
  const marcadores = {}; let postos = []; let ligado = false;

  const icone = (p) => L.divIcon({
    className: '',
    html: `<span class="pino pino-${p.precisao === 'conferida' ? 'completo' : 'fechado'}"><b>${esc(p.codigo)}</b></span>`,
    iconSize: [34, 34], iconAnchor: [17, 41], popupAnchor: [0, -36],
  });

  function contar() {
    const ok = postos.filter((p) => p.precisao === 'conferida').length;
    document.getElementById('contagem').textContent = `${ok} de ${postos.length} postos conferidos.`;
  }

  function linha(p) {
    return `<li id="item-${esc(p.codigo)}" data-busca="${esc((p.praia_nome + ' ' + p.posto + ' ' + p.codigo).toLowerCase())}">
      <div class="ajuste-nome">
        <button type="button" class="link" data-ir="${esc(p.codigo)}"><strong>${esc(p.praia_nome)}</strong> ${esc(p.posto)}</button>
        <span class="selo ${p.precisao === 'conferida' ? 'selo-completo' : 'selo-fechado'}">${p.precisao === 'conferida' ? 'Conferida' : 'Aproximada'}</span>
      </div>
      <form class="ajuste-form" data-codigo="${esc(p.codigo)}">
        <label class="visualmente-oculto" for="c-${esc(p.codigo)}">Coordenada de ${esc(p.praia_nome)}, ${esc(p.posto)}</label>
        <input id="c-${esc(p.codigo)}" type="text" value="${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}" ${ligado ? '' : 'disabled'}>
        <button class="botao" type="submit" ${ligado ? '' : 'disabled'}>Salvar</button>
      </form>
      <p class="ajuste-msg" role="status"></p>
    </li>`;
  }

  function desenharLista() {
    document.getElementById('lista').innerHTML = postos.map(linha).join('');
    contar();
  }

  async function salvar(codigo, lat, lng) {
    const item = document.getElementById('item-' + codigo);
    const msg = item.querySelector('.ajuste-msg');
    try {
      await api(`/api/admin/postos/${encodeURIComponent(codigo)}/posicao`, { method: 'PUT', body: { latitude: lat, longitude: lng } });
      const p = postos.find((x) => x.codigo === codigo);
      Object.assign(p, { latitude: lat, longitude: lng, precisao: 'conferida' });
      marcadores[codigo].setLatLng([lat, lng]).setIcon(icone(p));
      item.outerHTML = linha(p);
      document.querySelector(`#item-${codigo} .ajuste-msg`).textContent = 'Posição salva.';
      contar();
    } catch (e) {
      msg.textContent = e.message;
      const p = postos.find((x) => x.codigo === codigo);
      marcadores[codigo].setLatLng([p.latitude, p.longitude]);
    }
  }

  // Aceita "-27.43561, -48.51672" (como o Google Maps copia) ou com ponto e vírgula/espaço.
  function lerCoordenada(texto) {
    const n = texto.replace(/[()]/g, '').split(/[;,\s]+/).filter(Boolean).map(Number);
    return n.length === 2 && n.every(Number.isFinite) ? n : null;
  }

  document.getElementById('lista').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const c = lerCoordenada(form.querySelector('input').value);
    if (!c) { form.nextElementSibling.textContent = 'Use o formato -27.43561, -48.51672.'; return; }
    salvar(form.dataset.codigo, c[0], c[1]);
  });
  document.getElementById('lista').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ir]');
    if (!b) return;
    const m = marcadores[b.dataset.ir];
    mapa.setView(m.getLatLng(), 17);
    m.openPopup();
  });
  document.getElementById('filtro').addEventListener('input', (ev) => {
    const t = ev.target.value.toLowerCase().trim();
    document.querySelectorAll('#lista li').forEach((li) => { li.hidden = t && !li.dataset.busca.includes(t); });
  });

  api('/api/admin/postos').then((d) => {
    postos = d.postos; ligado = d.ajuste;
    document.getElementById('aviso').textContent = ligado
      ? 'Ajuste ligado. As posições salvas continuam valendo quando a demonstração é recriada. Para levar ao GitHub, baixe o postos.csv e substitua o arquivo server/catalogo/postos.csv.'
      : 'Neste servidor o ajuste está desligado (as contas de demonstração são públicas). Faça os ajustes no seu computador, com npm run dev.';
    for (const p of postos) {
      const m = L.marker([p.latitude, p.longitude], { icon: icone(p), draggable: ligado, title: `${p.praia_nome}, ${p.posto}` }).addTo(mapa);
      m.bindPopup(`<strong>${esc(p.praia_nome)}</strong><p>${esc(p.posto)} (${esc(p.codigo)})</p>`);
      m.on('dragend', () => { const ll = m.getLatLng(); salvar(p.codigo, Number(ll.lat.toFixed(6)), Number(ll.lng.toFixed(6))); });
      marcadores[p.codigo] = m;
    }
    mapa.fitBounds(L.featureGroup(Object.values(marcadores)).getBounds(), { padding: [30, 30] });
    desenharLista();
  }).catch((e) => { document.getElementById('aviso').textContent = e.message; });
})();
