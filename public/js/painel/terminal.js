// Terminal simulado: faz o papel do leitor NFC instalado na guarita.
// As leituras seguem o mesmo caminho de um terminal real: identificam a pulseira, evitam leitura repetida
// e, sem sinal, ficam guardadas no aparelho até a conexão voltar.
P.iniciar(async () => {
  const { api, esc, selo, nome } = P;
  let dados = null; let tipo = 'apresentacao'; let terminalId = '';

  P.app.innerHTML = `
    <p class="aviso aviso-info">Esta tela substitui o leitor NFC do posto na demonstração. Escolha o tipo de leitura e "aproxime" a pulseira de alguém escalado no posto.</p>
    <form class="barra-filtros" id="filtros"><label>Terminal<select name="terminal" id="sel-terminal"></select></label></form>
    <div id="resultado">${P.estado('carregando', 'Carregando terminais...')}</div>`;

  function desenhar() {
    const t = dados.terminal;
    document.getElementById('sel-terminal').innerHTML = dados.terminais.map((x) => `<option value="${x.id}" ${x.id === t?.id ? 'selected' : ''}>${esc(x.praia)}, ${esc(x.posto)} (${esc(x.codigo)})${x.online ? '' : ', sem sinal'}</option>`).join('');
    if (!t) { document.getElementById('resultado').innerHTML = P.estado('vazio', 'Nenhum terminal disponível.'); return; }
    document.getElementById('resultado').innerHTML = `
      <div class="grade-painel">
        <section class="bloco terminal ${t.online ? '' : 'terminal-sem-sinal'}">
          <div class="bloco-topo">
            <h2>${esc(t.codigo)} <small>${esc(t.praia)}, ${esc(t.posto)}</small></h2>
            ${t.online ? selo('Com sinal', 'ok') : selo(`Sem sinal desde ${t.offline_desde}`, 'perigo')}
          </div>
          <div class="terminal-tela" id="tela" aria-live="assertive"><p>Pronto para ler.</p><small>Escolha o tipo e aproxime a pulseira.</small></div>
          <div class="terminal-tipos" role="group" aria-label="Tipo de leitura">
            ${['apresentacao', 'intervalo', 'retorno', 'saida'].map((x) => `<button type="button" class="terminal-tipo" data-tipo="${x}" aria-pressed="${x === tipo}">${nome('tipo', x)}</button>`).join('')}
          </div>
          <h3>Pulseiras de quem está escalado aqui hoje</h3>
          <ul class="lista-pulseiras">${dados.pulseiras.map((p) => `<li><span><strong>${esc(p.codigo)}</strong> ${esc(p.nome)}<small>${p.numero_chip ? esc(p.numero_chip) : 'sem credencial ativa'}</small></span>
            ${p.numero_chip ? `<button type="button" class="botao-pequeno" data-chip="${esc(p.numero_chip)}">Aproximar pulseira</button>` : ''}</li>`).join('') || '<li>Ninguém escalado neste posto hoje.</li>'}</ul>
          <form class="terminal-chip" id="form-chip"><label>Outra pulseira (código do chip)<input name="chip" placeholder="04:AA:BB:CC:DD:EE:FF" autocomplete="off"></label><button class="botao-pequeno" type="submit">Ler</button></form>
        </section>
        <aside>
          <section class="bloco"><h2>Sinal do terminal</h2>
            ${t.online ? `<p>Simule uma queda de conexão para ver as leituras ficarem guardadas no aparelho.</p><button class="botao botao-secundario" data-sinal="false">Simular queda de sinal</button>`
              : `<p>${t.fila ? `<strong>${t.fila} ${t.fila === 1 ? 'leitura guardada' : 'leituras guardadas'}</strong> no terminal, aguardando envio.` : 'Nenhuma leitura guardada no terminal.'}</p><button class="botao" data-sinal="true">Restabelecer sinal${t.fila ? ' e enviar leituras' : ''}</button>`}
          </section>
          <section class="bloco"><h2>Últimas leituras</h2>
            ${dados.ultimas.length ? `<ul class="lista-simples">${dados.ultimas.map((r) => `<li><span class="hora">${r.hora.slice(0, 5)}</span><span><strong>${esc(r.codigo || '?')}</strong> ${esc(nome('tipo', r.tipo))}
              ${r.situacao !== 'valido' ? selo(nome('situacaoRegistro', r.situacao), r.situacao === 'negado' ? 'perigo' : 'neutro') : ''}${r.sincronizado ? '' : ' ' + selo('Guardada no terminal', 'atencao')}
              ${r.situacao !== 'valido' ? `<small>${esc(r.observacoes || '')}</small>` : ''}</span></li>`).join('')}</ul>` : P.estado('vazio', 'Nenhuma leitura hoje.')}
          </section>
        </aside>
      </div>`;
  }

  async function ler(chip) {
    const tela = document.getElementById('tela');
    tela.className = 'terminal-tela lendo'; tela.innerHTML = '<p>Lendo...</p>';
    try {
      const r = await api('/api/painel/leituras', { method: 'POST', body: { terminal_id: dados.terminal.id, chip, tipo, codigo_unico: crypto.randomUUID() } });
      await carregar();
      const t = document.getElementById('tela');
      t.className = 'terminal-tela resultado-' + r.resultado;
      t.innerHTML = `<p>${r.gv ? esc(r.gv.codigo + ' ' + r.gv.nome) : 'Pulseira desconhecida'}</p><small>${esc(nome('tipo', tipo))} às ${r.hora}. ${esc(r.mensagem)}</small>`;
    } catch (e) { tela.className = 'terminal-tela resultado-negada'; tela.innerHTML = `<p>Erro</p><small>${esc(e.message)}</small>`; }
  }

  P.app.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.tipo) { tipo = b.dataset.tipo; document.querySelectorAll('.terminal-tipo').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }
    if (b.dataset.chip) ler(b.dataset.chip);
    if (b.dataset.sinal) {
      b.disabled = true;
      try { const r = await api(`/api/painel/terminais/${dados.terminal.id}/sinal`, { method: 'POST', body: { online: b.dataset.sinal === 'true' } }); P.mensagem('sucesso', r.mensagem); await carregar(); }
      catch (e) { P.mensagem('erro', e.message); b.disabled = false; }
    }
  });
  P.app.addEventListener('submit', (ev) => {
    if (ev.target.id !== 'form-chip') return;
    ev.preventDefault();
    const chip = ev.target.chip.value.trim();
    if (!chip) return P.mensagem('erro', 'Digite o código da pulseira.');
    ler(chip);
  });
  P.app.addEventListener('change', (ev) => { if (ev.target.id === 'sel-terminal') { terminalId = ev.target.value; carregar(); } });

  async function carregar() {
    try { dados = await api('/api/painel/terminais' + P.qs({ terminal: terminalId })); terminalId = dados.terminal?.id || ''; desenhar(); }
    catch (e) { document.getElementById('resultado').innerHTML = P.estado('erro', e.message); }
  }
  await carregar();
});
