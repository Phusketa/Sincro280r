// ╔═══════════════════════════════════════════════════════════════╗
// ║  Tool3DRenderer — Renderizador 3D interativo para Fresas     ║
// ╚═══════════════════════════════════════════════════════════════╝

var Tool3DRenderer = {
  canvas: null,
  ctx: null,
  rotX: 0.2,
  rotY: -0.4,
  isDragging: false,
  lastMouseX: 0,
  lastMouseY: 0,
  toolData: {
    type: 'reta',
    CT: 75,   // Comprimento Total (mm)
    AC: 22,   // Altura do Corte (mm)
    D: 6,     // Diâmetro do Corte (mm)
    H: 6      // Diâmetro da Haste (mm)
  },

  init() {
    this.canvas = document.getElementById('tool-3d-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this.setupEvents();
    this.resizeCanvas();
    this.render();
  },

  setupEvents() {
    if (!this.canvas) return;

    window.addEventListener('resize', () => this.resizeCanvas());

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.rotY += dx * 0.01;
      this.rotX += dy * 0.01;
      // Clamp rotX
      this.rotX = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.rotX));
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.render();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
  },

  resizeCanvas() {
    if (!this.canvas) return;
    const container = this.canvas.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const w = rect.width || 320;
    const h = rect.height || 400;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.render();
  },

  updateTool(data) {
    this.toolData = { ...this.toolData, ...data };
    this.render();
  },

  render() {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const cw = this.canvas.width / (window.devicePixelRatio || 1);
    const ch = this.canvas.height / (window.devicePixelRatio || 1);

    // Clear background
    ctx.clearRect(0, 0, cw, ch);

    // Subtle dark gradient background
    const bgGrad = ctx.createRadialGradient(cw / 2, ch / 2, 20, cw / 2, ch / 2, Math.max(cw, ch));
    bgGrad.addColorStop(0, '#161d2d');
    bgGrad.addColorStop(1, '#0b0f19');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, cw, ch);

    // Grid lines behind tool
    this.drawBackgroundGrid(ctx, cw, ch);

    // Tool dimensions
    const CT = Math.max(20, parseFloat(this.toolData.CT) || 75);
    const AC = Math.max(5, Math.min(CT - 5, parseFloat(this.toolData.AC) || 22));
    const D = Math.max(1, parseFloat(this.toolData.D) || 6);
    const H = Math.max(1, parseFloat(this.toolData.H) || 6);
    const type = this.toolData.type || 'reta';

    // Scaling to fit canvas with padding for dimension labels
    const maxPixelH = ch * 0.65;
    const scaleY = maxPixelH / CT;
    const maxD = Math.max(D, H);
    const scaleX = (cw * 0.35) / Math.max(12, maxD);
    const scale = Math.min(scaleX, scaleY);

    const centerX = cw / 2 - 20; // Slightly left to leave space for right labels
    const topY = ch / 2 - (CT * scale) / 2 + 10;
    const shankLen = CT - AC;

    // ── 3D Projection Helpers ─────────────────────────────────────
    const project = (x, y, z) => {
      // Rotate Y then X
      const cosY = Math.cos(this.rotY), sinY = Math.sin(this.rotY);
      const cosX = Math.cos(this.rotX), sinX = Math.sin(this.rotX);

      const x1 = x * cosY + z * sinY;
      const z1 = -x * sinY + z * cosY;

      const y2 = y * cosX - z1 * sinX;
      const z2 = y * sinX + z1 * cosX;

      const px = centerX + x1;
      const py = topY + y2;
      return { x: px, y: py, z: z2 };
    };

    // Render Shank Cylinder (top portion)
    this.renderCylinder3D(ctx, project, scale, H / 2, H / 2, 0, shankLen, '#8a99b5', '#4d5975');

    // Render Cut Portion (bottom portion) based on type
    const cutStart = shankLen;
    const cutEnd = CT;

    if (type === 'canaletado') {
      // Fresa Canaletado (T-Slot Cutter / Cava Canaletado)
      // H: Diâmetro Haste (øH)
      // D: Diâmetro Maior do Disco de Corte (øD)
      // B (AC): Altura da Zona de Corte/Cava (B)
      // CT: Comprimento Total
      const cutH = AC > 0 ? AC : 18;
      const discH = Math.max(4, Math.min(8, cutH * 0.35));
      const neckD = Math.max(H * 0.55, Math.min(H, D * 0.4));
      
      const yDiscStart = cutEnd - discH;

      // 1. Anel/Colarinho na base da haste
      if (cutStart > 8) {
        this.renderCylinder3D(ctx, project, scale, H * 1.3 / 2, H * 1.3 / 2, cutStart - 8, cutStart, '#768b9e', '#394b59');
      }

      // 2. Pescoço central da cava (do início de B até o disco de corte)
      this.renderCylinder3D(ctx, project, scale, neckD / 2, neckD / 2, cutStart, yDiscStart, '#00b8d4', '#007c91');

      // 3. Disco principal de corte do canaletado (diâmetro øD)
      this.renderTransitionRing(ctx, project, scale, neckD / 2, D / 2, yDiscStart, '#00b8d4', '#007c91');
      this.renderCylinder3D(ctx, project, scale, D / 2, D / 2, yDiscStart, cutEnd, '#00b8d4', '#007c91');
      this.renderCapEllipse(ctx, project, scale, D / 2, cutEnd, '#007c91');

      // 4. Gumes de corte Widia do disco
      this.renderFlutes3D(ctx, project, scale, D / 2, D / 2, yDiscStart, cutEnd, 'canaletado');
    } else if (type === 'y45') {
      // Fresa Y45° (Meia Esquadria 45° — Perfil Triangular / Cone Invertido)
      // H: Diâmetro Haste (øH)
      // D: Diâmetro Total Maior (øD)
      // B (AC): Altura de Corte (45°) da cabeça cônica
      // CT: Comprimento Total
      
      // 1. Anel horizontal de transição no topo da cabeça (da haste H/2 até o diâmetro total D/2)
      if (D > H) {
        this.renderTransitionRing(ctx, project, scale, H / 2, D / 2, cutStart, '#ff7043', '#d84315');
      }

      // 2. Cabeça cônica em V de 45° (triângulo) do topo D/2 até a ponta inferior (cutEnd)
      const tipRadius = 0.5;
      this.renderCone3D(ctx, project, scale, D / 2, tipRadius, cutStart, cutEnd, '#ff7043', '#d84315');

      // 3. Gumes de corte em 45° (flutes)
      this.renderFlutes3D(ctx, project, scale, D / 2, tipRadius, cutStart, cutEnd, 'y45');
    } else if (type === 'vbits') {
      const tipRadius = 0.2;
      this.renderCone3D(ctx, project, scale, H / 2, tipRadius, cutStart, cutEnd, '#00b4d8', '#007791');
      this.renderFlutes3D(ctx, project, scale, H / 2, tipRadius, cutStart, cutEnd, type);
    } else if (type === 'cava') {
      const neckD = this.toolData.neckD || 18;
      const cavaH = this.toolData.cavaH || 13.5;
      const topOff = this.toolData.topOffset || 2;

      // 1. Neck cylinder transition (Haste -> Pescoço ø18)
      this.renderTransitionRing(ctx, project, scale, H / 2, neckD / 2, cutStart, '#00e676', '#009647');
      
      // 2. Neck body (ø18) down to cava start
      const cavaStartY = cutStart + topOff;
      this.renderCylinder3D(ctx, project, scale, neckD / 2, neckD / 2, cutStart, cavaStartY, '#00e676', '#009647');

      // 3. Flared 35° Cava Head (ø18 -> ø36)
      const cavaEndY = cavaStartY + cavaH;
      this.renderCone3D(ctx, project, scale, neckD / 2, D / 2, cavaStartY, cavaEndY, '#00e676', '#009647');

      // 4. Bottom head cap (ø36)
      if (cavaEndY < cutEnd) {
        this.renderCylinder3D(ctx, project, scale, D / 2, D / 2, cavaEndY, cutEnd, '#00e676', '#009647');
      }
      this.renderCapEllipse(ctx, project, scale, D / 2, cutEnd, '#009647');
      this.renderFlutes3D(ctx, project, scale, neckD / 2, D / 2, cavaStartY, cavaEndY, type);
    } else if (type === 'limpeza') {
      if (H !== D) {
        this.renderTransitionRing(ctx, project, scale, H / 2, D / 2, cutStart, '#7c5cff', '#4a32b3');
      }
      this.renderCylinder3D(ctx, project, scale, D / 2, D / 2, cutStart, cutEnd, '#7c5cff', '#4a32b3');
      this.renderCapEllipse(ctx, project, scale, D / 2, cutEnd, '#4a32b3');
      this.renderFlutes3D(ctx, project, scale, D / 2, D / 2, cutStart, cutEnd, type);
    } else { // 'reta'
      if (H !== D) {
        this.renderTransitionRing(ctx, project, scale, H / 2, D / 2, cutStart, '#00c853', '#007a33');
      }
      this.renderCylinder3D(ctx, project, scale, D / 2, D / 2, cutStart, cutEnd, '#00c853', '#007a33');
      this.renderCapEllipse(ctx, project, scale, D / 2, cutEnd, '#007a33');
      this.renderFlutes3D(ctx, project, scale, D / 2, D / 2, cutStart, cutEnd, type);
    }

    // Top shank end cross section line
    this.renderCapEllipse(ctx, project, scale, H / 2, 0, '#b8c5db');

    // ── Technical Dimensions Callouts (Image 2 style) ─────────────
    this.drawTechnicalDimensions(ctx, centerX, topY, CT, AC, D, H, shankLen, scale, cw, ch);
  },

  drawBackgroundGrid(ctx, cw, ch) {
    ctx.save();
    ctx.strokeStyle = 'rgba(42, 49, 80, 0.25)';
    ctx.lineWidth = 1;

    const step = 30;
    for (let x = 0; x < cw; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x, ch);
      ctx.stroke();
    }
    for (let y = 0; y < ch; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(cw, y);
      ctx.stroke();
    }
    ctx.restore();
  },

  renderTransitionRing(ctx, project, scale, r1, r2, yVal, colorLight, colorDark) {
    const rOuter = Math.max(r1, r2);
    const rInner = Math.min(r1, r2);
    if (rOuter <= rInner || rInner <= 0) return;

    const numSegments = 24;
    ctx.fillStyle = colorDark;
    ctx.beginPath();

    for (let i = 0; i <= numSegments; i++) {
      const a = (i / numSegments) * Math.PI * 2;
      const pOuter = project(Math.cos(a) * rOuter * scale, yVal * scale, Math.sin(a) * rOuter * scale);
      if (i === 0) ctx.moveTo(pOuter.x, pOuter.y);
      else ctx.lineTo(pOuter.x, pOuter.y);
    }
    for (let i = numSegments; i >= 0; i--) {
      const a = (i / numSegments) * Math.PI * 2;
      const pInner = project(Math.cos(a) * rInner * scale, yVal * scale, Math.sin(a) * rInner * scale);
      ctx.lineTo(pInner.x, pInner.y);
    }
    ctx.closePath();
    ctx.fill();
  },

  renderCylinder3D(ctx, project, scale, rTop, rBot, y1, y2, colorLight, colorDark) {
    const num = 24;
    for (let i = 0; i < num; i++) {
      const a1 = (i / num) * Math.PI * 2;
      const a2 = ((i + 1) / num) * Math.PI * 2;
      const midA = (a1 + a2) / 2;

      const p1Top = project(Math.cos(a1) * rTop * scale, y1 * scale, Math.sin(a1) * rTop * scale);
      const p2Top = project(Math.cos(a2) * rTop * scale, y1 * scale, Math.sin(a2) * rTop * scale);
      const p1Bot = project(Math.cos(a1) * rBot * scale, y2 * scale, Math.sin(a1) * rBot * scale);
      const p2Bot = project(Math.cos(a2) * rBot * scale, y2 * scale, Math.sin(a2) * rBot * scale);

      const light = Math.max(0.2, Math.cos(midA + Math.PI / 4));
      ctx.fillStyle = this.blendColors(colorDark, colorLight, light);

      ctx.beginPath();
      ctx.moveTo(p1Top.x, p1Top.y);
      ctx.lineTo(p2Top.x, p2Top.y);
      ctx.lineTo(p2Bot.x, p2Bot.y);
      ctx.lineTo(p1Bot.x, p1Bot.y);
      ctx.closePath();
      ctx.fill();
    }
  },

  renderCone3D(ctx, project, scale, rTop, rBot, y1, y2, colorLight, colorDark) {
    this.renderCylinder3D(ctx, project, scale, rTop, rBot, y1, y2, colorLight, colorDark);
  },

  renderFlutes3D(ctx, project, scale, rTop, rBot, yTop, yBot, type) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.5;

    const numFlutes = 2;
    const numPoints = 16;
    const turns = 0.5;

    for (let f = 0; f < numFlutes; f++) {
      const fluteAngleOffset = (f * Math.PI * 2) / numFlutes;

      ctx.beginPath();
      for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        const y = yTop + (yBot - yTop) * t;
        const curRadius = rTop + (rBot - rTop) * t;
        const angle = fluteAngleOffset + t * turns * Math.PI * 2;

        const p = project(Math.cos(angle) * curRadius * scale * 1.02, y * scale, Math.sin(angle) * curRadius * scale * 1.02);

        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  },

  renderCapEllipse(ctx, project, scale, r, yVal, color) {
    ctx.beginPath();
    const num = 16;
    for (let i = 0; i <= num; i++) {
      const a = (i / num) * Math.PI * 2;
      const p = project(Math.cos(a) * r * scale, yVal * scale, Math.sin(a) * r * scale);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  },

  drawTechnicalDimensions(ctx, centerX, topY, CT, AC, D, H, shankLen, scale, cw, ch) {
    ctx.save();
    ctx.font = `600 11px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#00b4d8';
    ctx.strokeStyle = '#00b4d8';
    ctx.lineWidth = 1;

    const maxR = Math.max(D, H) / 2 * scale;
    const rightMarginX = centerX + maxR + 35;

    const topPixelY = topY;
    const cutStartPixelY = topY + shankLen * scale;
    const botPixelY = topY + CT * scale;

    // ── CT (Comprimento Total) — Right Outer Line ─────────────────
    ctx.beginPath();
    // Top extension line
    ctx.moveTo(centerX, topPixelY); ctx.lineTo(rightMarginX + 35, topPixelY);
    // Bottom extension line
    ctx.moveTo(centerX, botPixelY); ctx.lineTo(rightMarginX + 35, botPixelY);
    // Vertical CT dimension line
    ctx.moveTo(rightMarginX + 25, topPixelY); ctx.lineTo(rightMarginX + 25, botPixelY);
    ctx.stroke();

    this.drawArrowhead(ctx, rightMarginX + 25, topPixelY, 'up');
    this.drawArrowhead(ctx, rightMarginX + 25, botPixelY, 'down');

    // Label CT
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(rightMarginX + 42, (topPixelY + botPixelY) / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#00b4d8';
    ctx.fillText(`CT = ${CT}mm`, 0, 0);
    ctx.restore();

    // ── AC / B (Altura de Corte) — Right Inner Line ────────────────────
    ctx.beginPath();
    ctx.moveTo(centerX, cutStartPixelY); ctx.lineTo(rightMarginX + 15, cutStartPixelY);
    ctx.moveTo(rightMarginX + 8, cutStartPixelY); ctx.lineTo(rightMarginX + 8, botPixelY);
    ctx.stroke();

    this.drawArrowhead(ctx, rightMarginX + 8, cutStartPixelY, 'up');
    this.drawArrowhead(ctx, rightMarginX + 8, botPixelY, 'down');

    ctx.save();
    ctx.translate(rightMarginX + 18, (cutStartPixelY + botPixelY) / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#00e676';
    const acLabel = (this.toolData.type === 'y45' || this.toolData.type === 'canaletado') ? `B = ${AC}mm` : `AC = ${AC}mm`;
    ctx.fillText(acLabel, 0, 0);
    ctx.restore();

    // ── H (Diâmetro da Haste) — Top Horizontal Line ───────────────
    const shankRPixel = (H / 2) * scale;
    ctx.beginPath();
    ctx.moveTo(centerX - shankRPixel, topPixelY - 12);
    ctx.lineTo(centerX + shankRPixel, topPixelY - 12);
    ctx.moveTo(centerX - shankRPixel, topPixelY - 6);
    ctx.lineTo(centerX - shankRPixel, topPixelY - 16);
    ctx.moveTo(centerX + shankRPixel, topPixelY - 6);
    ctx.lineTo(centerX + shankRPixel, topPixelY - 16);
    ctx.stroke();

    this.drawArrowhead(ctx, centerX - shankRPixel, topPixelY - 12, 'left');
    this.drawArrowhead(ctx, centerX + shankRPixel, topPixelY - 12, 'right');

    ctx.textAlign = 'center';
    ctx.fillStyle = '#8a92a8';
    const hLabel = (this.toolData.type === 'y45' || this.toolData.type === 'canaletado') ? `øH = ${H}mm` : `H = Ø${H}mm`;
    ctx.fillText(hLabel, centerX, topPixelY - 22);

    // ── D (Diâmetro Total / Maior) — Bottom Horizontal Line ────────────
    const cutRPixel = (D / 2) * scale;
    ctx.beginPath();
    ctx.moveTo(centerX - cutRPixel, botPixelY + 14);
    ctx.lineTo(centerX + cutRPixel, botPixelY + 14);
    ctx.moveTo(centerX - cutRPixel, botPixelY + 6);
    ctx.lineTo(centerX - cutRPixel, botPixelY + 20);
    ctx.moveTo(centerX + cutRPixel, botPixelY + 6);
    ctx.lineTo(centerX + cutRPixel, botPixelY + 20);
    ctx.stroke();

    this.drawArrowhead(ctx, centerX - cutRPixel, botPixelY + 14, 'left');
    this.drawArrowhead(ctx, centerX + cutRPixel, botPixelY + 14, 'right');

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff7043';
    const dLabel = (this.toolData.type === 'y45' || this.toolData.type === 'canaletado') ? `øD = ${D}mm` : `D = Ø${D}mm`;
    ctx.fillText(dLabel, centerX, botPixelY + 28);

    // ── Extra Y45 Callout (Ângulo 45° Fixo) ───────────────────────
    if (this.toolData.type === 'y45') {
      ctx.save();
      ctx.font = `700 11px 'JetBrains Mono', monospace`;
      ctx.fillStyle = '#ff7043';
      ctx.textAlign = 'left';
      ctx.fillText('📐 Ângulo: 45° (Fixo)', centerX + maxR + 15, cutStartPixelY + 30);
      ctx.restore();
    }

    // ── Extra Cava Callouts (øPescoço, Ângulo 35°, Altura 13.5mm) ──
    if (this.toolData.type === 'cava') {
      const neckD = this.toolData.neckD || 18;
      const angle = this.toolData.angle || 35;
      const cavaH = this.toolData.cavaH || 13.5;

      const neckRPixel = (neckD / 2) * scale;
      const neckY = topY + (this.toolData.shankLen || 45) * scale;

      // øPescoço horizontal callout line
      ctx.beginPath();
      ctx.strokeStyle = '#00e676';
      ctx.moveTo(centerX - neckRPixel, neckY - 8);
      ctx.lineTo(centerX + neckRPixel, neckY - 8);
      ctx.stroke();

      ctx.fillStyle = '#00e676';
      ctx.fillText(`Pescoço Ø${neckD}mm | Cava ${cavaH}mm x ${angle}°`, centerX, neckY - 18);
    }

    ctx.restore();
  },

  drawArrowhead(ctx, x, y, dir) {
    const size = 4;
    ctx.beginPath();
    if (dir === 'up') {
      ctx.moveTo(x, y); ctx.lineTo(x - size, y + size * 1.5); ctx.lineTo(x + size, y + size * 1.5);
    } else if (dir === 'down') {
      ctx.moveTo(x, y); ctx.lineTo(x - size, y - size * 1.5); ctx.lineTo(x + size, y - size * 1.5);
    } else if (dir === 'left') {
      ctx.moveTo(x, y); ctx.lineTo(x + size * 1.5, y - size); ctx.lineTo(x + size * 1.5, y + size);
    } else if (dir === 'right') {
      ctx.moveTo(x, y); ctx.lineTo(x - size * 1.5, y - size); ctx.lineTo(x - size * 1.5, y + size);
    }
    ctx.closePath();
    ctx.fill();
  },

  blendColors(color1, color2, factor) {
    const c1 = this.hexToRgb(color1);
    const c2 = this.hexToRgb(color2);

    const r = Math.round(c1.r + (c2.r - c1.r) * factor);
    const g = Math.round(c1.g + (c2.g - c1.g) * factor);
    const b = Math.round(c1.b + (c2.b - c1.b) * factor);

    return `rgb(${r}, ${g}, ${b})`;
  },

  hexToRgb(hex) {
    let clean = hex.replace('#', '');
    if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
    const num = parseInt(clean, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
};
