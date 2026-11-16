// Lista de praias com filtro por nome e por região.
(() => {
  const { api, esc, selo } = window.SIGPO;
  const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  let dados = null; let regiao = '';

  function situacao(pr) {
    const ps = dados.postos.filter((p) => pr.ids.includes(p.id));
    if (ps.every((p) => !p.em_horario)) return 'fechado';
    if (ps.some((p) => p.sem_sinal)) return 'sem_atualizacao';
    if (ps.some((p) => p.status === 'sem_efetivo')) return 'sem_efetivo';
    if (ps.some((p) => p.status === 'reduzido')) return 'reduzido';
    return 'completo';
  }

  function desenhar() {
    const termo = semAcento(document.getElementById('filtro-nome').value);
    const lista = dados.praias.filter((p) => (!regiao || p.regiao_id === regiao) && (!termo || semAcento(p.nome).includes(termo)));
    document.getElementById('tabela').innerHTML = lista.map((p) => `<tr>
      <td><a href="/praias/${encodeURIComponent(p.slug)}">${esc(p.nome)}</a></td>
      <td>${esc(p.regiao)}, ${p.postos} ${p.postos === 1 ? 'posto' : 'postos'}</td>
      <td class="num">${p.sem_atualizacao && !p.no_posto ? 'Sem atualização' : `${p.no_posto} de ${p.previstos} previstos`}</td>
      <td>${selo(situacao(p))}</td>
    </tr>`).join('');
    document.getElementById('vazio').hidden = lista.length > 0;
  }

  document.getElementById('filtro-nome').addEventListener('input', () => dados && desenhar());
  document.querySelectorAll('.abas button').forEach((b) => b.addEventListener('click', () => {
    regiao = b.dataset.regiao;
    document.querySelectorAll('.abas button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (dados) desenhar();
  }));

  async function carregar() {
    try {
      dados = await api('/api/publico/situacao');
      document.getElementById('agora').textContent = `Situação às ${dados.relogio.hhmm} (horário simulado da demonstração).`;
      desenhar();
    } catch (e) { document.getElementById('agora').textContent = e.message; }
  }
  carregar();
  setInterval(carregar, 60_000);
})();
