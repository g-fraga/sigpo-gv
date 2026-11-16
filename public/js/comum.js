// Funções usadas em todas as páginas.
(() => {
  // Menu no celular: abre e fecha.
  const botao = document.querySelector('.menu-botao');
  const menu = document.getElementById('menu');
  if (botao && menu) {
    botao.addEventListener('click', () => {
      const aberto = menu.classList.toggle('aberto');
      botao.setAttribute('aria-expanded', String(aberto));
      botao.textContent = aberto ? 'Fechar' : 'Menu';
    });
  }

  // Busca dados na API e devolve o JSON. Em caso de erro, lança uma mensagem legível.
  async function api(caminho, opcoes = {}) {
    const resp = await fetch(caminho, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...opcoes,
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
    });
    let dados = null;
    try { dados = await resp.json(); } catch { /* resposta sem JSON */ }
    if (!resp.ok) throw new Error(dados?.erro || 'Não foi possível falar com o servidor. Tente novamente.');
    return dados;
  }

  // Protege textos vindos do banco antes de colocá-los no HTML.
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const STATUS = {
    completo: 'Efetivo completo',
    reduzido: 'Efetivo reduzido',
    sem_efetivo: 'Sem guarda-vidas no momento',
    sem_atualizacao: 'Sem atualização',
    fechado: 'Fora do horário',
    sem_posto: 'Sem posto cadastrado',
  };
  const selo = (status) => `<span class="selo selo-${status}">${STATUS[status]}</span>`;

  // Frase curta sobre a atualização de um posto.
  function frasePosto(p) {
    if (!p.em_horario) return `Funciona das ${p.hora_inicio} às ${p.hora_fim}.`;
    if (p.sem_sinal) return `Sem atualização desde ${p.atualizado}. O terminal do posto está sem sinal.`;
    if (!p.atualizado) return 'Ainda sem registro hoje.';
    return `Atualizado às ${p.atualizado}.`;
  }

  // Quantos guarda-vidas mostrar: em posto sem sinal, o número é o último recebido.
  const textoEfetivo = (p) => (p.em_horario ? `${p.presentes} de ${p.previsto}` : `0 de ${p.previsto}`);

  window.SIGPO = { api, esc, STATUS, selo, frasePosto, textoEfetivo };
})();
