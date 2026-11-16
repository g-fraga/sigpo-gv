// Guarda-vidas: página inicial com os próprios dados.
P.iniciar(async () => {
  const { api, esc, selo, seloDe, nome } = P;
  const d = await api('/api/gv/inicio');
  const e = d.eu; const h = d.hoje;
  P.app.innerHTML = `
    <div class="grade-painel">
      <div>
        <section class="bloco gv-hoje">
          <h2>Hoje, ${P.data(d.relogio.data)}</h2>
          ${h ? `<p class="gv-hoje-posto">${esc(h.praia)}, ${esc(h.posto)}</p>
            <dl class="detalhe-lista">
              <dt>Região</dt><dd>${esc(h.regiao)}</dd>
              <dt>Horário</dt><dd>${h.inicio} às ${h.fim}</dd>
              <dt>Função</dt><dd>${esc(h.funcao)}</dd>
              <dt>Situação agora</dt><dd>${d.presenca ? `${seloDe('situacaoPessoa', d.presenca.situacao)} <small>${d.presenca.desde ? 'desde ' + d.presenca.desde : ''}</small>` : '–'}</dd>
            </dl>
            ${d.presenca?.situacao === 'pendentes' ? '<p class="aviso">Sua apresentação de hoje ainda não chegou ao sistema. Se você já aproximou a pulseira, avise o chefe do posto ou peça revisão.</p>' : ''}`
          : P.estado('vazio', 'Você não está escalado hoje.')}
          <a class="link-mais" href="/painel/minha-escala">Ver minha escala</a>
        </section>
        <section class="bloco"><h2>Registros recentes</h2>
          ${d.recentes.length ? `<ul class="lista-simples">${d.recentes.map((r) => `<li><span class="hora">${r.quando.slice(6)}</span><span><strong>${esc(nome('tipo', r.tipo))}</strong>
            ${r.situacao !== 'valido' ? selo(nome('situacaoRegistro', r.situacao), 'neutro') : ''}${r.sincronizado ? '' : ' ' + selo('Aguardando sincronização', 'atencao')}
            <small>${r.quando.slice(0, 5)}, ${esc(r.praia)}, ${esc(r.posto)}${r.origem !== 'nfc' ? ' (' + esc(nome('origem', r.origem)) + ')' : ''}</small></span></li>`).join('')}</ul>`
            : P.estado('vazio', 'Nenhum registro ainda.')}
          <a class="link-mais" href="/painel/meus-registros">Ver todos os meus registros</a>
        </section>
      </div>
      <aside>
        <section class="bloco"><h2>Meus dados</h2>
          <dl class="detalhe-lista">
            <dt>Nome</dt><dd>${esc(e.nome)}</dd>
            <dt>Matrícula</dt><dd>${esc(e.codigo)}</dd>
            <dt>Vínculo</dt><dd>${e.vinculo === 'Militar' ? 'Militar' : 'Guarda-vidas civil voluntário'}</dd>
            <dt>Posto base</dt><dd>${e.posto ? `${esc(e.praia)}, ${esc(e.posto)}<br><small>${esc(e.regiao)}</small>` : 'Reserva, sem posto base'}</dd>
            <dt>Pulseira ativa</dt><dd>${e.pulseira ? esc(e.pulseira) : selo('Sem credencial ativa', 'perigo')}</dd>
          </dl>
        </section>
        <section class="bloco"><h2>Avisos <small>${d.avisos.length}</small></h2>
          ${d.avisos.length ? `<ul class="lista-alertas">${d.avisos.map((a) => `<li>${a.link ? `<a href="${a.link}">${esc(a.texto)}</a>` : esc(a.texto)}</li>`).join('')}</ul>` : P.estado('vazio', 'Nenhum aviso.')}
        </section>
      </aside>
    </div>`;
});
