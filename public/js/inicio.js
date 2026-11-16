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

  function statusDaPraia(pr, postos) {
    const ps = postos.filter((p) => pr.ids.includes(p.id));
    if (ps.every((p) => !p.em_horario)) return 'fechado';
    if (ps.some((p) => p.sem_sinal)) return 'sem_atualizacao';
    if (ps.some((p) => p.status === 'sem_efetivo')) return 'sem_efetivo';
    if (ps.some((p) => p.status === 'reduzido')) return 'reduzido';
    return 'completo';
  }

  function mostrarRegioes(d) {
    const nomes = { N: 'Norte', L: 'Leste', S: 'Sul' };
    document.getElementById('regioes').innerHTML = Object.entries(nomes).map(([id, nome]) => {
      const lista = d.praias.filter((p) => p.regiao_id === id);
      const gv = lista.reduce((s, p) => s + p.no_posto, 0);
      return `<div class="regiao">
        <h3>${nome} <small>${gv} guarda-vidas</small></h3>
        <ul class="lista-praias">${lista.map((p) => {
          const st = statusDaPraia(p, d.postos);
          return `<li><a href="/praias/${encodeURIComponent(p.slug)}">
            <span>${esc(p.nome)}</span>
            <span class="conta"><span class="ponto ponto-${st}" title="${esc(window.SIGPO.STATUS[st])}"></span>${st === 'sem_atualizacao' && !p.no_posto ? 'sem atualização' : `${p.no_posto} de ${p.previstos}`}</span>
          </a></li>`;
        }).join('')}</ul>
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
  const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
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
