/* recorte-foto.js — recorte QUADRADO de foto de produto (vanilla, sem dependências).
 *
 *   const r = await RecorteFoto.abrir({ fonte: File | Blob | 'https://…' | 'data:…', titulo: 'Recortar foto' });
 *   // r = { dataUrl, blob, lado } (JPEG quadrado, até 1600 px)  ·  r = null se a pessoa cancelou
 *
 * Arrastar move · rolar o mouse / pinça / barra = zoom · "Preencher" corta as sobras ·
 * "Caber inteira" mostra a foto toda com bordas brancas · girar 90°. A saída é sempre quadrada.
 * Foto de endereço externo precisa permitir CORS (o armazenamento do Supabase permite); se não
 * permitir, a função recusa com mensagem clara em vez de gerar imagem em branco.
 */
(function(){
  if(window.RecorteFoto) return;
  const LADO_MAX = 1600, LADO_MIN = 800;

  function injetarCss(){
    if(document.getElementById('rfCss')) return;
    const st = document.createElement('style'); st.id = 'rfCss';
    st.textContent = `
      #rfOverlay{position:fixed;inset:0;background:rgba(15,42,61,.55);z-index:100000;display:flex;align-items:center;justify-content:center;padding:12px;font-family:inherit;}
      #rfOverlay .rf-box{background:#fff;border-radius:14px;padding:16px;width:100%;max-width:560px;max-height:96vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.35);color:#1B2733;}
      #rfOverlay h3{margin:0 0 4px;font-size:16px;} #rfOverlay .rf-sub{margin:0 0 10px;font-size:12.5px;color:#5B6B7A;}
      #rfOverlay .rf-stage{position:relative;width:100%;aspect-ratio:1/1;max-width:520px;margin:0 auto;border:2px solid #1F6F8B;border-radius:8px;overflow:hidden;background:#fff;touch-action:none;cursor:grab;user-select:none;}
      #rfOverlay .rf-stage.arrastando{cursor:grabbing;} #rfOverlay canvas{display:block;width:100%;height:100%;}
      #rfOverlay .rf-grade{position:absolute;inset:0;pointer-events:none;background:
        linear-gradient(to right,transparent 33.2%,rgba(255,255,255,.55) 33.3%,rgba(255,255,255,.55) 33.5%,transparent 33.6%,transparent 66.5%,rgba(255,255,255,.55) 66.6%,rgba(255,255,255,.55) 66.8%,transparent 66.9%),
        linear-gradient(to bottom,transparent 33.2%,rgba(255,255,255,.55) 33.3%,rgba(255,255,255,.55) 33.5%,transparent 33.6%,transparent 66.5%,rgba(255,255,255,.55) 66.6%,rgba(255,255,255,.55) 66.8%,transparent 66.9%);mix-blend-mode:difference;opacity:.55;}
      #rfOverlay .rf-linha{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;}
      #rfOverlay input[type=range]{flex:1;min-width:140px;}
      #rfOverlay button{border:1px solid #E3E8EE;background:#F0F3F6;color:#1B2733;border-radius:8px;padding:8px 13px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}
      #rfOverlay button.on{background:#E6F1F5;border-color:#1F6F8B;color:#1F6F8B;} #rfOverlay button.ok{background:#1F6F8B;border-color:#1F6F8B;color:#fff;}
      #rfOverlay button:disabled{opacity:.5;cursor:default;}
      #rfOverlay .rf-aviso{font-size:12.5px;margin-top:8px;padding:7px 10px;border-radius:8px;background:#FDF3E1;color:#B7791F;display:none;}
      #rfOverlay .rf-acoes{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;}`;
    document.head.appendChild(st);
  }

  function carregarImagem(fonte){
    return new Promise((resolve, reject) => {
      let url, revogar = false;
      if(fonte instanceof Blob){ url = URL.createObjectURL(fonte); revogar = true; } else url = String(fonte || '');
      if(!url){ reject(new Error('Foto não informada.')); return; }
      const img = new Image();
      if(!revogar && !/^data:/i.test(url)) img.crossOrigin = 'anonymous';
      img.onload = () => resolve({ img, url, revogar });
      img.onerror = () => { if(revogar) URL.revokeObjectURL(url); reject(new Error('Não consegui abrir esta foto (o endereço pode não permitir recorte). Anexe a foto de novo.')); };
      img.src = url;
    });
  }

  async function abrir(opts){
    opts = opts || {};
    injetarCss();
    let carregada;
    try{ carregada = await carregarImagem(opts.fonte); }
    catch(e){ alert(e.message); return null; }
    const { img } = carregada;
    // base = imagem já girada (canvas); girar 90° troca largura/altura
    let base = document.createElement('canvas');
    const redesenharBase = (graus) => {
      const w = img.naturalWidth, h = img.naturalHeight, g = ((graus % 360) + 360) % 360;
      const troca = g === 90 || g === 270;
      base = document.createElement('canvas'); base.width = troca ? h : w; base.height = troca ? w : h;
      const c = base.getContext('2d'); c.translate(base.width / 2, base.height / 2); c.rotate(g * Math.PI / 180); c.drawImage(img, -w / 2, -h / 2);
    };
    let giro = 0; redesenharBase(0);

    return new Promise(resolve => {
      const ov = document.createElement('div'); ov.id = 'rfOverlay';
      ov.innerHTML = `<div class="rf-box" role="dialog" aria-modal="true" aria-label="Recortar foto">
        <h3>${(opts.titulo || 'Recortar foto').replace(/</g, '&lt;')}</h3>
        <p class="rf-sub">A foto fica sempre <b>quadrada</b>, no formato do site. Arraste para posicionar e use o zoom.</p>
        <div class="rf-stage" id="rfStage"><canvas id="rfCv"></canvas><div class="rf-grade"></div></div>
        <div class="rf-linha"><span style="font-size:18px" aria-hidden="true">🔍</span><input type="range" id="rfZoom" min="0" max="1000" value="0" aria-label="Zoom"></div>
        <div class="rf-linha">
          <button type="button" id="rfPreencher" class="on">Preencher</button><button type="button" id="rfCaber">Caber inteira</button>
          <button type="button" id="rfGirar" title="Girar 90°">⟳ Girar</button>
        </div>
        <div class="rf-aviso" id="rfAviso"></div>
        <div class="rf-acoes"><button type="button" id="rfCancelar">Cancelar</button><button type="button" id="rfOk" class="ok">Usar este recorte</button></div></div>`;
      document.body.appendChild(ov);
      const stage = ov.querySelector('#rfStage'), cv = ov.querySelector('#rfCv'), zoom = ov.querySelector('#rfZoom'), aviso = ov.querySelector('#rfAviso');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      let L = 0;                          // lado do quadro (px de tela)
      let s = 1, ox = 0, oy = 0, sMin = 1, sMax = 4;   // escala (px da tela por px da imagem) e deslocamento
      const ptrs = new Map(); let pinca = null;

      const limitesEscala = () => { const sCobre = L / Math.min(base.width, base.height), sCaber = L / Math.max(base.width, base.height); sMin = sCaber * 0.999; sMax = Math.max(sCobre * 5, sCaber * 5); return { sCobre, sCaber }; };
      const grampear = () => {
        const w = base.width * s, h = base.height * s;
        ox = w >= L ? Math.min(0, Math.max(L - w, ox)) : Math.min(L - w, Math.max(0, ox));
        oy = h >= L ? Math.min(0, Math.max(L - h, oy)) : Math.min(L - h, Math.max(0, oy));
      };
      const centralizar = () => { ox = (L - base.width * s) / 2; oy = (L - base.height * s) / 2; };
      const desenhar = () => {
        const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#fff'; c.fillRect(0, 0, L, L);
        c.imageSmoothingQuality = 'high'; c.drawImage(base, ox, oy, base.width * s, base.height * s);
        zoom.value = String(Math.round(Math.log(s / sMin) / Math.log(sMax / sMin) * 1000));
        const lado = L / s;  // lado do recorte em px da imagem original
        aviso.style.display = lado < 700 ? 'block' : 'none';
        aviso.textContent = lado < 700 ? `Atenção: o recorte tem só ${Math.round(lado)} px — pode ficar sem nitidez no site. Use uma foto maior ou diminua o zoom.` : '';
        ov.querySelector('#rfPreencher').classList.toggle('on', Math.abs(s - (L / Math.min(base.width, base.height))) < 1e-3);
        ov.querySelector('#rfCaber').classList.toggle('on', Math.abs(s - (L / Math.max(base.width, base.height))) < 1e-3);
      };
      const medir = () => { L = Math.round(stage.clientWidth); cv.width = L * dpr; cv.height = L * dpr; };
      const modoPreencher = () => { const l = limitesEscala(); s = l.sCobre; centralizar(); grampear(); desenhar(); };
      const modoCaber = () => { const l = limitesEscala(); s = l.sCaber; centralizar(); desenhar(); };
      const zoomEm = (novaEscala, cx, cy) => {   // mantém o ponto (cx,cy) do quadro parado
        novaEscala = Math.min(sMax, Math.max(sMin, novaEscala));
        const ix = (cx - ox) / s, iy = (cy - oy) / s; s = novaEscala; ox = cx - ix * s; oy = cy - iy * s; grampear(); desenhar();
      };
      medir(); modoPreencher();
      const aoRedimensionar = () => { const antes = L; medir(); const k = L / (antes || L); s *= k; ox *= k; oy *= k; limitesEscala(); grampear(); desenhar(); };
      window.addEventListener('resize', aoRedimensionar);

      const pos = e => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      stage.addEventListener('pointerdown', e => { stage.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, pos(e)); stage.classList.add('arrastando'); if(ptrs.size === 2){ const [a, b] = [...ptrs.values()]; pinca = { d: Math.hypot(a.x - b.x, a.y - b.y), s }; } });
      stage.addEventListener('pointermove', e => {
        if(!ptrs.has(e.pointerId)) return; const novo = pos(e), ant = ptrs.get(e.pointerId); ptrs.set(e.pointerId, novo);
        if(ptrs.size === 1){ ox += novo.x - ant.x; oy += novo.y - ant.y; grampear(); desenhar(); }
        else if(ptrs.size === 2 && pinca){ const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); zoomEm(pinca.s * (d / (pinca.d || d)), (a.x + b.x) / 2, (a.y + b.y) / 2); }
      });
      const soltar = e => { ptrs.delete(e.pointerId); pinca = null; if(!ptrs.size) stage.classList.remove('arrastando'); };
      stage.addEventListener('pointerup', soltar); stage.addEventListener('pointercancel', soltar);
      stage.addEventListener('wheel', e => { e.preventDefault(); const p = pos(e); zoomEm(s * (e.deltaY < 0 ? 1.1 : 1 / 1.1), p.x, p.y); }, { passive: false });
      zoom.addEventListener('input', () => { const novo = sMin * Math.pow(sMax / sMin, Number(zoom.value) / 1000); zoomEm(novo, L / 2, L / 2); });
      ov.querySelector('#rfPreencher').addEventListener('click', modoPreencher);
      ov.querySelector('#rfCaber').addEventListener('click', modoCaber);
      ov.querySelector('#rfGirar').addEventListener('click', () => { giro = (giro + 90) % 360; redesenharBase(giro); modoPreencher(); });

      const fechar = (resultado) => { window.removeEventListener('resize', aoRedimensionar); ov.remove(); if(carregada.revogar) URL.revokeObjectURL(carregada.url); resolve(resultado); };
      ov.querySelector('#rfCancelar').addEventListener('click', () => fechar(null));
      ov.querySelector('#rfOk').addEventListener('click', () => {
        try{
          const lado = Math.min(LADO_MAX, Math.max(LADO_MIN, Math.round(L / s)));   // sem inventar resolução além do necessário
          const k = lado / L, out = document.createElement('canvas'); out.width = lado; out.height = lado;
          const c = out.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, lado, lado); c.imageSmoothingQuality = 'high';
          c.drawImage(base, ox * k, oy * k, base.width * s * k, base.height * s * k);
          const dataUrl = out.toDataURL('image/jpeg', 0.92);   // lança SecurityError se a imagem veio de endereço sem CORS
          out.toBlob(blob => fechar({ dataUrl, blob, lado }), 'image/jpeg', 0.92);
        }catch(e){ alert('Não foi possível recortar esta foto aqui (o endereço dela não permite). Anexe a foto de novo para recortar.'); fechar(null); }
      });
    });
  }
  window.RecorteFoto = { abrir };
})();
