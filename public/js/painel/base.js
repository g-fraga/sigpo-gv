// Base da área da equipe: confere o login, monta o menu do perfil e oferece funções comuns às telas.
// Importante: o menu só mostra o que o perfil pode usar, mas quem garante a permissão é o servidor.
(() => {
  const { api, esc } = window.SIGPO;

  const MENU = {
    admin: [['/painel/admin', 'Visão geral'], ['/painel/postos', 'Postos'], ['/painel/guarda-vidas', 'Guarda-vidas'], ['/painel/pulseiras', 'Pulseiras'],
      ['/painel/escalas', 'Escalas'], ['/painel/registros', 'Registros'], ['/painel/alertas', 'Alertas'], ['/painel/revisoes', 'Revisões'],
      ['/painel/terminal', 'Terminal'], ['/painel/auditoria', 'Auditoria']],
    supervisor: [['/painel/supervisao', 'Minha região'], ['/painel/escalas', 'Escalas'], ['/painel/registros', 'Registros'], ['/painel/alertas', 'Alertas'],
      ['/painel/revisoes', 'Revisões'], ['/painel/terminal', 'Terminal']],
    guarda_vidas: [['/painel/meu', 'Início'], ['/painel/minha-escala', 'Minha escala'], ['/painel/meus-registros', 'Meus registros'], ['/painel/minhas-revisoes', 'Revisões']],
  };
  const PERFIL = { admin: 'Administração', supervisor: 'Supervisão', guarda_vidas: 'Guarda-vidas' };

  // Nomes amigáveis dos códigos do banco.
  const NOMES = {
    tipo: { apresentacao: 'Apresentação', intervalo: 'Intervalo', retorno: 'Retorno', saida: 'Saída', negada: 'Leitura negada' },
    origem: { nfc: 'Pulseira', manual: 'Manual', correcao: 'Correção' },
    situacaoRegistro: { valido: 'Válido', repique: 'Repetido', negado: 'Negado', corrigido: 'Corrigido' },
    situacaoAlerta: { aberto: 'Aberto', reconhecido: 'Em tratamento', resolvido: 'Resolvido', descartado: 'Descartado' },
    tipoAlerta: { pendente: 'Pendência', offline: 'Terminal sem sinal', escala: 'Escala alterada', abaixo: 'Efetivo abaixo', pulseira: 'Pulseira' },
    situacaoPessoa: { presentes: 'No posto', intervalo: 'Intervalo', transito: 'Deslocamento', pendentes: 'Pendente', aguardando: 'Aguardando turno', sairam: 'Encerrou' },
    situacaoPulseira: { ativa: 'Ativa', bloqueada: 'Bloqueada', inativa: 'Inativa', substituida: 'Substituída' },
    revisao: { aberto: 'Aguardando análise', aceito: 'Aceito', recusado: 'Recusado' },
    situacaoGV: { ativo: 'Ativo', afastado: 'Afastado', desligado: 'Desligado' },
    motivo: { horario: 'Horário incorreto', tipo: 'Tipo de registro incorreto', posto: 'Posto incorreto', nao_reconhece: 'Não reconheço o registro', ausente: 'Registro ausente', outro: 'Outro motivo' },
  };
  const TOM = {
    valido: 'ok', ativa: 'ok', aceito: 'ok', resolvido: 'ok', presentes: 'ok', completo: 'ok', ativo: 'ok',
    reconhecido: 'atencao', aguardando: 'neutro', intervalo: 'atencao', transito: 'atencao', reduzido: 'atencao', repique: 'neutro', aberto: 'atencao',
    negado: 'perigo', bloqueada: 'perigo', recusado: 'perigo', pendentes: 'perigo', sem_efetivo: 'perigo',
    corrigido: 'neutro', substituida: 'neutro', inativa: 'neutro', descartado: 'neutro', sairam: 'neutro', sem_atualizacao: 'neutro', fechado: 'neutro', afastado: 'neutro', desligado: 'neutro',
  };

  const app = document.getElementById('app');
  const caixaMsg = document.getElementById('mensagens');

  const P = {
    app, NOMES, api, esc,
    nome: (grupo, chave) => NOMES[grupo]?.[chave] || chave || '',
    selo: (texto, tom = 'neutro') => `<span class="etiqueta etiqueta-${tom}">${esc(texto)}</span>`,
    seloDe: (grupo, chave) => P.selo(P.nome(grupo, chave), TOM[chave] || 'neutro'),
    tom: (chave) => TOM[chave] || 'neutro',
    data: (iso) => (iso ? iso.split('-').reverse().join('/') : ''),
    diaSemana: (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
    somaDias: (iso, n) => new Date(new Date(iso + 'T12:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10),

    // Mensagem de sucesso ou erro no topo da tela; some sozinha depois de alguns segundos.
    mensagem(tipo, texto) {
      const el = document.createElement('p');
      el.className = `mensagem mensagem-${tipo}`;
      el.textContent = texto;
      caixaMsg.prepend(el);
      setTimeout(() => el.remove(), tipo === 'erro' ? 9000 : 5000);
    },

    estado: (tipo, texto) => `<p class="estado estado-${tipo}">${esc(texto)}</p>`,

    // Tabela a partir de colunas { titulo, html(linha), classe }.
    tabela(colunas, linhas, vazio = 'Nada encontrado com esses filtros.') {
      if (!linhas.length) return P.estado('vazio', vazio);
      return `<div class="tabela-rolagem"><table class="tabela">
        <thead><tr>${colunas.map((c) => `<th scope="col" class="${c.classe || ''}">${esc(c.titulo)}</th>`).join('')}</tr></thead>
        <tbody>${linhas.map((l) => `<tr>${colunas.map((c) => `<td class="${c.classe || ''}" data-titulo="${esc(c.titulo)}">${c.html(l)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
    },

    // Lê os campos de um formulário como objeto.
    valores(form) {
      const v = {};
      for (const el of form.elements) {
        if (!el.name) continue;
        if (el.type === 'checkbox') v[el.name] = el.checked;
        else if (el.type === 'radio') { if (el.checked) v[el.name] = el.value; }
        else v[el.name] = el.value.trim();
      }
      return v;
    },

    // Janela com formulário. aoEnviar(valores, form) devolve a mensagem de sucesso; um erro mantém a janela aberta.
    dialogo({ titulo, corpo, botao = 'Salvar', aoEnviar, largo = false, aoAbrir }) {
      const d = document.createElement('dialog');
      d.className = 'janela' + (largo ? ' janela-larga' : '');
      d.innerHTML = `<form method="dialog" novalidate>
        <div class="janela-topo"><h2>${esc(titulo)}</h2><button type="button" class="janela-fechar" aria-label="Fechar">×</button></div>
        <div class="janela-corpo">${corpo}<p class="janela-erro" role="alert"></p></div>
        ${aoEnviar ? `<div class="janela-acoes"><button type="button" class="botao botao-secundario" data-cancelar>Cancelar</button><button type="submit" class="botao">${esc(botao)}</button></div>` : ''}
      </form>`;
      document.body.appendChild(d);
      const form = d.querySelector('form');
      const fechar = () => { d.close(); d.remove(); };
      d.querySelector('.janela-fechar').onclick = fechar;
      d.querySelector('[data-cancelar]')?.addEventListener('click', fechar);
      d.addEventListener('cancel', (e) => { e.preventDefault(); fechar(); });
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (!aoEnviar) return fechar();
        const erro = d.querySelector('.janela-erro');
        const enviar = form.querySelector('button[type=submit]');
        erro.textContent = '';
        enviar.disabled = true; const rotulo = enviar.textContent; enviar.textContent = 'Salvando...';
        try {
          const msg = await aoEnviar(P.valores(form), form);
          fechar();
          if (msg) P.mensagem('sucesso', msg);
        } catch (e) {
          erro.textContent = e.message;
          enviar.disabled = false; enviar.textContent = rotulo;
        }
      });
      d.showModal();
      aoAbrir?.(form, d);
      return d;
    },

    // Opções dos filtros (regiões, praias, postos e guarda-vidas do escopo do usuário).
    _opcoes: null,
    opcoes: () => (P._opcoes ||= api('/api/painel/opcoes')),
    opcoesPostos(postos, selecionado = '', { vazio = 'Todos os postos', soAtivos = true } = {}) {
      const grupos = {};
      for (const p of postos) if (!soAtivos || p.ativo) (grupos[p.praia] ||= []).push(p);
      return `<option value="">${esc(vazio)}</option>` + Object.entries(grupos).map(([praia, ps]) => `<optgroup label="${esc(praia)}">${ps.map((p) =>
        `<option value="${p.id}" ${String(p.id) === String(selecionado) ? 'selected' : ''}>${esc(praia)}, ${esc(p.nome)}${p.ativo ? '' : ' (desativado)'}</option>`).join('')}</optgroup>`).join('');
    },

    // Liga um formulário de filtros: qualquer mudança chama aoMudar(valores).
    filtros(form, aoMudar) {
      let espera;
      form.addEventListener('input', (e) => { clearTimeout(espera); espera = setTimeout(() => aoMudar(P.valores(form)), e.target.type === 'search' || e.target.type === 'text' ? 350 : 0); });
      form.addEventListener('submit', (e) => { e.preventDefault(); aoMudar(P.valores(form)); });
      return () => P.valores(form);
    },

    // Monta a query string ignorando filtros vazios.
    qs: (obj) => { const s = new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v != null && v !== false)).toString(); return s ? '?' + s : ''; },

    usuario: null,
    iniciar: null,
  };

  const pronto = api('/api/auth/eu');
  P.iniciar = (fn) => pronto.then(async (u) => {
    try { await fn(u); } catch (e) { app.innerHTML = P.estado('erro', e.message); }
  });

  pronto.then((u) => {
    P.usuario = u;
    document.getElementById('painel-perfil').textContent = `${u.nome.replace(' (fictício)', '')}, ${PERFIL[u.perfil].toLowerCase()}${u.regiao ? ' da região ' + u.regiao : ''}`;
    document.getElementById('painel-relogio').textContent = `Demonstração: ${u.relogio.hhmm}`;
    const atual = location.pathname;
    document.getElementById('painel-nav').innerHTML = MENU[u.perfil].map(([href, rotulo]) =>
      `<a href="${href}" ${href === atual ? 'aria-current="page"' : ''}>${esc(rotulo)}</a>`).join('');
    // No celular, o menu rola para o lado: centraliza a aba atual sem mexer na rolagem da página.
    const nav = document.getElementById('painel-nav'); const atualEl = nav.querySelector('[aria-current]');
    if (atualEl) nav.scrollLeft = atualEl.offsetLeft - nav.clientWidth / 2 + atualEl.clientWidth / 2;
  }).catch(() => { location.href = '/entrar'; });

  document.getElementById('sair').addEventListener('click', async () => {
    try { await api('/api/auth/sair', { method: 'POST' }); } finally { location.href = '/'; }
  });

  window.P = P;
})();
