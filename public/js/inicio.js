// Página inicial: mapa, números da cidade, busca de praia, dica do dia e lista por região.
(() => {
  const { api, esc } = window.SIGPO;
  const { criarMapa, marcarPostos, atualizarMarcadores } = window.SIGPO.mapa;

  // Dicas com fonte. Uma por dia, em rodízio.
  const CBMPR_DEZ = 'Corpo de Bombeiros Militar do Paraná (AEN, 28/12/2025).';
  const CBMPR_JUL = 'Corpo de Bombeiros Militar do Paraná (AEN, 25/07/2025).';
  const DICAS = [
    ['Tome banho de mar só onde houver guarda-vidas, entre as bandeiras vermelha e amarela.', CBMPR_DEZ],
    ['Bandeira vermelha avisa perigo extremo: não entre no mar.', CBMPR_JUL],
    ['Foi pego por uma corrente? Não nade contra ela. Deixe-se levar e nade paralelo à praia até sair da faixa.', CBMPR_DEZ],
    ['Criança no mar fica a no máximo um braço de distância do adulto responsável.', CBMPR_JUL],
    ['Na dúvida, pergunte ao guarda-vidas antes de entrar: os pontos de risco mudam ao longo do dia.', CBMPR_DEZ],
    ['Evite nadar perto de pedras, encostas e molhes.', CBMPR_DEZ],
    ['Bebida alcoólica reduz a capacidade de reação. Evite antes de entrar no mar.', CBMPR_DEZ],
    ['Queimadura de água-viva: não esfregue. Lave com água do mar e procure o posto de guarda-vidas.', CBMPR_JUL],
    ['Criança perdida? Leve-a imediatamente ao posto de guarda-vidas mais próximo.', CBMPR_JUL],
    ['Viu alguém se afogando? Não entre para resgatar sem preparo. Chame o guarda-vidas ou ligue 193.', CBMPR_JUL],
  ];
  const diaDoAno = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 864e5);
  const [dica, fonte] = DICAS[diaDoAno % DICAS.length];
  document.getElementById('dica-texto').textContent = dica;
  document.getElementById('dica-fonte').textContent = 'Fonte: ' + fonte;

  const mapa = criarMapa('mapa');
  let marcadores = null;
  let praias = [];

  function mostrarNumeros(d) {
    document.getElementById('agora').textContent =
      `Situação às ${d.relogio.hhmm} (horário simulado da demonstração). Atualiza sozinho a cada minuto.`;
    document.getElementById('n-postos').textContent = `${d.totais.em_operacao}/${d.totais.postos}`;
    document.getElementById('n-gv').textContent = d.totais.no_posto;
    document.getElementById('n-sem').textContent = d.totais.sem_atualizacao;
  }

  function textoConta(p) {
    if (p.status === 'sem_posto') return 'sem posto';
    if (p.status === 'sem_atualizacao' && !p.no_posto) return 'sem atualização';
    return `${p.no_posto} de ${p.previstos}`;
  }

  function mostrarRegioes(d) {
    document.getElementById('regioes').innerHTML = d.regioes.map((r) => {
      const lista = d.praias.filter((p) => p.regiao_id === r.id);
      const gv = lista.reduce((s, p) => s + p.no_posto, 0);
      const comPosto = lista.filter((p) => p.postos > 0).length;
      return `<div class="regiao">
        <h3>${esc(r.nome)} <small>${comPosto ? `${gv} guarda-vidas` : 'sem postos'}</small></h3>
        <ul class="lista-praias">${lista.map((p) => `<li${p.postos ? '' : ' class="sem-posto"'}><a href="/praias/${encodeURIComponent(p.slug)}">
            <span>${esc(p.nome)}</span>
            <span class="conta"><span class="ponto ponto-${p.status}" title="${esc(window.SIGPO.STATUS[p.status])}"></span>${textoConta(p)}</span>
          </a></li>`).join('')}</ul>
      </div>`;
    }).join('');
  }

  async function carregar() {
    try {
      const d = await api('/api/publico/situacao');
      praias = d.praias;
      mostrarNumeros(d);
      mostrarRegioes(d);
      if (!marcadores) {
        marcadores = marcarPostos(mapa, d.postos);
        mapa.fitBounds(L.featureGroup(Object.values(marcadores)).getBounds(), { paddingTopLeft: [24, 48], paddingBottomRight: [24, 12] });
        document.getElementById('lista-praias').innerHTML = praias.map((p) => `<option value="${esc(p.nome)}">`).join('');
      } else atualizarMarcadores(marcadores, d.postos);
    } catch (e) {
      document.getElementById('agora').textContent = e.message;
    }
  }

  // Busca: aceita o nome com ou sem acento.
  const semAcento = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  document.getElementById('busca').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const termo = semAcento(document.getElementById('busca-praia').value);
    const erro = document.getElementById('busca-erro');
    if (!termo) { erro.textContent = 'Digite o nome de uma praia.'; return; }
    const achada = praias.find((p) => semAcento(p.nome) === termo) || praias.find((p) => semAcento(p.nome).includes(termo));
    if (!achada) { erro.textContent = 'Não encontramos essa praia. Veja a lista completa em Praias e postos.'; return; }
    erro.textContent = '';
    location.href = '/praias/' + encodeURIComponent(achada.slug);
  });

  carregar();
  setInterval(carregar, 60_000);
})();
