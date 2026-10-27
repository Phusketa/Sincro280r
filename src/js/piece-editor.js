// ╔═══════════════════════════════════════════════════════════════╗
// ║  PieceEditor — Canvas proporcional: Visões 2D, 3D e Raio-X   ║
// ╚═══════════════════════════════════════════════════════════════╝

var PieceEditor = {
  canvas: null,
  ctx: null,
  pieceW: 800,
  pieceH: 500,
  pieceD: 15,
  viewMode: '2d', // '2d', '3d', 'raio-x'
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  padding: 60,

  // 3D Motion state
  rotZ: Math.PI / 4,   // Yaw rotation (45 deg)
  rotX: Math.PI / 6,   // Pitch rotation (30 deg)
  panX: 0,
  panY: 0,
  zoom: 1.0,
  isDragging: false,
  dragMode: 'rotate',  // 'rotate' or 'pan'
  lastMouseX: 0,
  lastMouseY: 0,
  showDirections: true, // Ponto inicial (quadrado verde) e setas de sentido em todos os vetores

  toggleDirection() {
    this.showDirections = !this.showDirections;
    const btn = document.getElementById('btn-toggle-direction');
    if (btn) {
      if (this.showDirections) {
        btn.classList.add('active');
        btn.setAttribute('title', 'Sentido dos Vetores: Ativado (Clique para ocultar)');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('title', 'Sentido dos Vetores: Oculto (Clique para exibir)');
      }
    }
    this.draw();
  },

  init() {
    this.canvas = document.getElementById('piece-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this.setupEvents();
    this.resizeCanvas();
    requestAnimationFrame(() => this.resizeCanvas());
    setTimeout(() => this.resizeCanvas(), 50);
    setTimeout(() => this.resizeCanvas(), 200);
  },

  setupEvents() {
    if (!this.canvas) return;

    window.addEventListener('resize', () => this.resizeCanvas());

    const centerPanel = document.querySelector('.panel-center');
    if (centerPanel && window.ResizeObserver) {
      const ro = new ResizeObserver(() => this.resizeCanvas());
      ro.observe(centerPanel);
    }

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragMode = (this.viewMode === '2d' || e.button === 2 || e.shiftKey) ? 'pan' : 'rotate';
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;

        if (this.dragMode === 'rotate' && this.viewMode !== '2d') {
          this.rotZ += dx * 0.008;
          this.rotX += dy * 0.008;
          // Clamp pitch to avoid extreme inversion
          const minPitch = -Math.PI / 2 + 0.05;
          const maxPitch = Math.PI / 2 - 0.05;
          this.rotX = Math.max(minPitch, Math.min(maxPitch, this.rotX));
        } else {
          this.panX += dx;
          this.panY += dy;
        }

        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.calcTransform();
        this.draw();
      }
      this.onMouseMove(e);
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      this.adjustZoom(zoomFactor);
    }, { passive: false });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    this.canvas.addEventListener('dblclick', () => {
      this.resetView();
    });

    this.canvas.addEventListener('mouseleave', () => {
      const wrap = document.getElementById('canvas-coords-wrap');
      if (wrap) wrap.classList.add('hidden');
    });
  },

  setViewMode(mode) {
    this.viewMode = mode;
    document.querySelectorAll('.view-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const ctrl3d = document.getElementById('view-controls-3d');
    if (ctrl3d) {
      ctrl3d.style.display = 'flex';
    }

    this.canvas.style.cursor = 'grab';

    this.calcTransform();
    this.draw();
  },

  resetView() {
    this.rotZ = Math.PI / 4;
    this.rotX = Math.PI / 6;
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.calcTransform();
    this.draw();
  },

  reset3DView() {
    this.resetView();
  },

  adjustZoom(factor) {
    this.zoom = Math.max(0.2, Math.min(5.0, this.zoom * factor));
    this.calcTransform();
    this.draw();
  },

  resizeCanvas() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = parent.getBoundingClientRect();
    let w = Math.floor(rect.width || parent.clientWidth || 800);
    let h = Math.floor(rect.height || parent.clientHeight || 500);

    if (w <= 0) w = 800;
    if (h <= 0) h = 500;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    if (this.ctx) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    this.calcTransform();
    this.draw();
  },

  // setPieceDimensions is defined below with full signature (w, h, d, hasGrain, isOrganic)

  getOpColor(op, selected) {
    if (selected) return '#ffd600';
    const depth = App.getOpVal ? App.getOpVal(op, 'depth', 0) : (op.depth || 0);
    if (depth >= this.pieceD) {
      return '#ff7043'; // Orange through-cut (corte passante por completo)
    }
    return '#00e676';   // Green partial depth cut
  },

  calcTransform() {
    const cw = Math.max(100, this.canvas.width / (window.devicePixelRatio || 1));
    const ch = Math.max(100, this.canvas.height / (window.devicePixelRatio || 1));

    const availW = Math.max(50, cw - this.padding * 2);
    const availH = Math.max(50, ch - this.padding * 2);

    const pw = Math.max(1, this.pieceW || 800);
    const ph = Math.max(1, this.pieceH || 500);
    const pd = Math.max(0.1, this.pieceD || 15);

    if (this.viewMode === '2d') {
      const baseScaleX = availW / pw;
      const baseScaleY = availH / ph;
      const baseScale = Math.max(0.001, Math.min(baseScaleX, baseScaleY));
      this.scale = baseScale * (this.zoom || 1.0);
      const drawW = pw * this.scale;
      const drawH = ph * this.scale;
      this.offsetX = (cw - drawW) / 2 + (this.panX || 0);
      this.offsetY = (ch - drawH) / 2 + (this.panY || 0);
    } else {
      // Bounding box calculation for 3D centered model
      const cosZ = Math.cos(this.rotZ || 0), sinZ = Math.sin(this.rotZ || 0);
      const cosX = Math.cos(this.rotX || 0), sinX = Math.sin(this.rotX || 0);

      const halfW = pw / 2;
      const halfH = ph / 2;
      const halfD = (pd / 2) * 2;

      const corners = [
        [-halfW, -halfH, -halfD], [ halfW, -halfH, -halfD],
        [ halfW,  halfH, -halfD], [-halfW,  halfH, -halfD],
        [-halfW, -halfH,  halfD], [ halfW, -halfH,  halfD],
        [ halfW,  halfH,  halfD], [-halfW,  halfH,  halfD]
      ];

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      corners.forEach(([dx, dy, dz]) => {
        const x1 = dx * cosZ - dy * sinZ;
        const y1 = dx * sinZ + dy * cosZ;
        const x2 = x1;
        const y2 = y1 * sinX - dz * cosX;
        if (x2 < minX) minX = x2;
        if (x2 > maxX) maxX = x2;
        if (y2 < minY) minY = y2;
        if (y2 > maxY) maxY = y2;
      });

      const isoW = (maxX - minX) || 1;
      const isoH = (maxY - minY) || 1;

      const scaleX = availW / isoW;
      const scaleY = availH / isoH;
      this.scale = Math.max(0.001, Math.min(scaleX, scaleY));

      // Centered at screen center + pan offset
      this.offsetX = cw / 2 + (this.panX || 0);
      this.offsetY = ch / 2 + (this.panY || 0);
    }
  },

  // ── 3D Projection Helper ────────────────────────────────────
  toIso(px, py, pz = 0) {
    const dx = px - this.pieceW / 2;
    const dy = py - this.pieceH / 2;
    const dz = (pz - this.pieceD / 2) * 2; // thickness scaling

    const cosZ = Math.cos(this.rotZ);
    const sinZ = Math.sin(this.rotZ);
    const cosX = Math.cos(this.rotX);
    const sinX = Math.sin(this.rotX);

    // 1. Yaw rotation (Z)
    const x1 = dx * cosZ - dy * sinZ;
    const y1 = dx * sinZ + dy * cosZ;

    // 2. Pitch rotation (X)
    const x2 = x1;
    const y2 = y1 * sinX - dz * cosX;
    const z2 = y1 * cosX + dz * sinX; // Depth for sorting

    return {
      x: this.offsetX + x2 * this.scale * this.zoom,
      y: this.offsetY + y2 * this.scale * this.zoom,
      z: z2
    };
  },

  toCanvas(px, py) {
    if (this.viewMode === '2d') {
      return {
        x: this.offsetX + px * this.scale,
        y: this.offsetY + (this.pieceH - py) * this.scale
      };
    } else {
      return this.toIso(px, py, this.pieceD);
    }
  },

  toPiece(cx, cy) {
    if (this.viewMode === '2d') {
      return {
        x: (cx - this.offsetX) / this.scale,
        y: this.pieceH - (cy - this.offsetY) / this.scale
      };
    }

    const dz = (this.pieceD / 2) * 2;
    const cosZ = Math.cos(this.rotZ);
    const sinZ = Math.sin(this.rotZ);
    const cosX = Math.cos(this.rotX);
    const sinX = Math.sin(this.rotX);

    const x2 = (cx - this.offsetX) / (this.scale * this.zoom);
    const y2 = (cy - this.offsetY) / (this.scale * this.zoom);

    const safeSinX = Math.abs(sinX) < 0.001 ? 0.001 * Math.sign(sinX || 1) : sinX;
    const y1 = (y2 + dz * cosX) / safeSinX;

    const dx = x2 * cosZ + y1 * sinZ;
    const dy = y1 * cosZ - x2 * sinZ;

    return {
      x: dx + this.pieceW / 2,
      y: dy + this.pieceH / 2
    };
  },

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const p = this.toPiece(cx, cy);

    const wrap = document.getElementById('canvas-coords-wrap');
    const el = document.getElementById('canvas-coords');

    if (p.x >= 0 && p.x <= this.pieceW && p.y >= 0 && p.y <= this.pieceH) {
      if (wrap) wrap.classList.remove('hidden');
      if (el) el.textContent = `X${p.x.toFixed(1)} Y${p.y.toFixed(1)}`;
    } else {
      if (wrap) wrap.classList.add('hidden');
    }
  },

  // ── Render Main ──────────────────────────────────────────────

  draw() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const cw = this.canvas.width / (window.devicePixelRatio || 1);
    const ch = this.canvas.height / (window.devicePixelRatio || 1);

    ctx.save();
    ctx.clearRect(0, 0, cw, ch);

    // Background
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.fillStyle = isLight ? '#f1f5f9' : '#0a0d14';
    ctx.fillRect(0, 0, cw, ch);

    if (this.viewMode === '2d') {
      this.drawGrid2D(ctx);
      this.drawPiece2D(ctx);
      this.drawDimensions2D(ctx);
      this.drawOperations(ctx);
      this.drawLivePreview(ctx);
      this.drawOrigin2D(ctx);
    } else if (this.viewMode === '3d') {
      this.drawBackgroundCircuit(ctx, cw, ch);
      this.drawPiece3DSolid(ctx);
      this.drawOperations(ctx);
      this.drawLivePreview(ctx);
    } else { // 'raio-x'
      this.drawBackgroundCircuit(ctx, cw, ch);
      this.drawPiece3DXRay(ctx);
      this.drawOperations(ctx);
      this.drawLivePreview(ctx);
    }

    ctx.restore();
  },

  drawBackgroundCircuit(ctx, cw, ch) {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.save();
    ctx.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.12)' : 'rgba(0, 180, 216, 0.08)';
    ctx.lineWidth = 1;

    const step = 40;
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

  // ── 2D Mode Drawing ──────────────────────────────────────────

  drawGrid2D(ctx) {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const gridStep = 50;
    ctx.strokeStyle = isLight ? 'rgba(203, 213, 225, 0.7)' : 'rgba(0, 180, 216, 0.15)';
    ctx.lineWidth = 0.8;

    for (let x = 0; x <= this.pieceW; x += gridStep) {
      const p1 = this.toCanvas(x, 0);
      const p2 = this.toCanvas(x, this.pieceH);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    for (let y = 0; y <= this.pieceH; y += gridStep) {
      const p1 = this.toCanvas(0, y);
      const p2 = this.toCanvas(this.pieceW, y);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
  },

  hasGrain: false,
  isOrganic: false,

  setPieceDimensions(w, h, d, hasGrain = false, isOrganic = false) {
    this.pieceW = Math.min(Math.max(1, w || 800), 1850);
    this.pieceH = Math.min(Math.max(1, h || 500), 2750);
    this.pieceD = Math.max(0.1, d || 15);
    this.hasGrain = !!hasGrain;
    this.isOrganic = !!isOrganic;
    this.calcTransform();
    this.draw();
  },

  drawPiece2D(ctx) {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const tl = this.toCanvas(0, this.pieceH);
    const drawW = this.pieceW * this.scale;
    const drawH = this.pieceH * this.scale;

    // Piece Plate Fill (High contrast slate panel in dark mode)
    ctx.fillStyle = isLight ? '#ffffff' : '#182232';
    ctx.fillRect(tl.x, tl.y, drawW, drawH);

    // Marca d'água do Veio da Madeira (Sentido Altura / Eixo Y / 2750mm)
    if (this.hasGrain) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 183, 77, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([8, 6]);

      const grainStep = 25;
      for (let x = grainStep; x < this.pieceW; x += grainStep) {
        const p1 = this.toCanvas(x, 0);
        const p2 = this.toCanvas(x, this.pieceH);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }

      ctx.setLineDash([]);
      ctx.font = `600 11px 'JetBrains Mono', monospace`;
      ctx.fillStyle = 'rgba(255, 183, 77, 0.9)';
      ctx.textAlign = 'right';
      ctx.fillText('🪵 VEIO DA MADEIRA (SENTIDO ALTURA / 2750mm)', tl.x + drawW - 10, tl.y + 20);
      ctx.restore();
    }

    if (this.isOrganic) {
      ctx.save();
      ctx.font = `600 11px 'JetBrains Mono', monospace`;
      ctx.fillStyle = '#00e676';
      ctx.textAlign = 'left';
      ctx.fillText('🌿 PEÇA ORGÂNICA / VETORIAL (Contorno Passante E + Extra)', tl.x + 10, tl.y + (this.hasGrain ? 36 : 20));
      ctx.restore();
    }

    // Outer Border & Glow
    ctx.strokeStyle = this.isOrganic ? '#00e676' : '#00b4d8';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(tl.x, tl.y, drawW, drawH);
  },

  drawDimensions2D(ctx) {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.font = `600 12px 'JetBrains Mono', monospace`;
    ctx.fillStyle = isLight ? '#0284c7' : '#00b4d8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const bLeft = this.toCanvas(0, 0);
    const bRight = this.toCanvas(this.pieceW, 0);
    const bMid = { x: (bLeft.x + bRight.x) / 2, y: bLeft.y + 24 };

    ctx.beginPath();
    ctx.strokeStyle = isLight ? '#0284c7' : '#00b4d8';
    ctx.lineWidth = 1.2;
    ctx.moveTo(bLeft.x, bLeft.y + 8); ctx.lineTo(bLeft.x, bLeft.y + 20);
    ctx.moveTo(bRight.x, bRight.y + 8); ctx.lineTo(bRight.x, bRight.y + 20);
    ctx.moveTo(bLeft.x, bMid.y); ctx.lineTo(bRight.x, bMid.y);
    ctx.stroke();

    ctx.fillText(`${this.pieceW} mm`, bMid.x, bMid.y + 14);

    const lTop = this.toCanvas(0, this.pieceH);
    const lBot = this.toCanvas(0, 0);
    const lMid = { x: lTop.x - 24, y: (lTop.y + lBot.y) / 2 };

    ctx.beginPath();
    ctx.moveTo(lTop.x - 8, lTop.y); ctx.lineTo(lTop.x - 20, lTop.y);
    ctx.moveTo(lBot.x - 8, lBot.y); ctx.lineTo(lBot.x - 20, lBot.y);
    ctx.moveTo(lMid.x, lTop.y); ctx.lineTo(lMid.x, lBot.y);
    ctx.stroke();

    ctx.save();
    ctx.translate(lMid.x - 14, lMid.y);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${this.pieceH} mm`, 0, 0);
    ctx.restore();
  },

  drawOrigin2D(ctx) {
    const o = this.toCanvas(0, 0);
    const size = 14;

    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 2;

    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + size * 2, o.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x, o.y - size * 2); ctx.stroke();

    ctx.font = `700 11px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#00e676';
    ctx.fillText('X (0,0)', o.x + size * 2 + 6, o.y + 3);
    ctx.fillText('Y', o.x - 2, o.y - size * 2 - 8);

    ctx.fillStyle = '#00e676';
    ctx.beginPath(); ctx.arc(o.x, o.y, 4, 0, Math.PI * 2); ctx.fill();
  },

  // ── 3D Solid Mode Drawing ────────────────────────────────────

  getMDFPattern(ctx) {
    if (this._mdfPattern) return this._mdfPattern;
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const pctx = canvas.getContext('2d');
    pctx.fillStyle = '#c59656'; // Cor base do miolo de MDF
    pctx.fillRect(0, 0, 64, 64);

    const specks = ['#b38346', '#d6a667', '#9e7239', '#e0b275', '#8a5e26', '#d29f60'];
    for (let i = 0; i < 300; i++) {
      pctx.fillStyle = specks[i % specks.length];
      pctx.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 3, 1 + Math.random() * 1.5);
    }
    this._mdfPattern = ctx.createPattern(canvas, 'repeat');
    return this._mdfPattern;
  },

  drawPiece3DSolid(ctx) {
    const W = this.pieceW, H = this.pieceH, D = this.pieceD;

    // Bottom Corners (pz = 0)
    const b0 = this.toIso(0, 0, 0);
    const b1 = this.toIso(W, 0, 0);
    const b2 = this.toIso(W, H, 0);
    const b3 = this.toIso(0, H, 0);

    // Top Corners (pz = D)
    const t0 = this.toIso(0, 0, D);
    const t1 = this.toIso(W, 0, D);
    const t2 = this.toIso(W, H, D);
    const t3 = this.toIso(0, H, D);

    // Faces da peça em Melamina Branca (Estilo CAD / SketchUp)
    const faces = [
      { pts: [b0, b1, b2, b3], fill: '#aab2ba', stroke: '#222' },
      { pts: [t0, t1, t2, t3], fill: '#f5f7fa', stroke: '#222', topHighlight: true },
      { pts: [b0, b1, t1, t0], fill: '#d9e0e8', stroke: '#222' },
      { pts: [b3, b2, t2, t3], fill: '#b8c0c8', stroke: '#222' },
      { pts: [b0, b3, t3, t0], fill: '#c6ccd4', stroke: '#222' },
      { pts: [b1, b2, t2, t1], fill: '#c0c8d0', stroke: '#222' },
    ];

    faces.forEach(f => {
      f.avgZ = (f.pts[0].z + f.pts[1].z + f.pts[2].z + f.pts[3].z) / 4;
    });
    faces.sort((a, b) => a.avgZ - b.avgZ);

    faces.forEach(f => {
      ctx.fillStyle = f.fill;
      ctx.beginPath();
      ctx.moveTo(f.pts[0].x, f.pts[0].y);
      ctx.lineTo(f.pts[1].x, f.pts[1].y);
      ctx.lineTo(f.pts[2].x, f.pts[2].y);
      ctx.lineTo(f.pts[3].x, f.pts[3].y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = f.stroke;
      ctx.lineWidth = f.topHighlight ? 1.5 : 1;
      ctx.stroke();
    });
  },

  // ── Raio-X Mode Drawing ──────────────────────────────────────

  drawPiece3DXRay(ctx) {
    const W = this.pieceW, H = this.pieceH, D = this.pieceD;

    // Bottom Corners (pz = 0)
    const b0 = this.toIso(0, 0, 0);
    const b1 = this.toIso(W, 0, 0);
    const b2 = this.toIso(W, H, 0);
    const b3 = this.toIso(0, H, 0);

    // Top Corners (pz = D)
    const t0 = this.toIso(0, 0, D);
    const t1 = this.toIso(W, 0, D);
    const t2 = this.toIso(W, H, D);
    const t3 = this.toIso(0, H, D);

    // Top Face Glassy Glow
    ctx.save();
    const topGrad = ctx.createLinearGradient(t0.x, t0.y, t2.x, t2.y);
    topGrad.addColorStop(0, 'rgba(0, 180, 216, 0.12)');
    topGrad.addColorStop(1, 'rgba(0, 180, 216, 0.03)');

    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(t3.x, t3.y);
    ctx.closePath(); ctx.fill();

    // Wireframe Internal Grid on Top Face
    ctx.strokeStyle = 'rgba(0, 180, 216, 0.2)';
    ctx.lineWidth = 0.8;
    const gridStep = 100;

    for (let x = 0; x <= W; x += gridStep) {
      const pA = this.toIso(x, 0, D);
      const pB = this.toIso(x, H, D);
      ctx.beginPath(); ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y); ctx.stroke();
    }
    for (let y = 0; y <= H; y += gridStep) {
      const pA = this.toIso(0, y, D);
      const pB = this.toIso(W, y, D);
      ctx.beginPath(); ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y); ctx.stroke();
    }

    // Top Face Neon Edges (Cyan Glowing)
    ctx.shadowColor = '#00b4d8';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#00b4d8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(t3.x, t3.y);
    ctx.closePath(); ctx.stroke();

    // Vertical Corner Pillars
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0, 180, 216, 0.4)';
    ctx.lineWidth = 1;
    [ [b0, t0], [b1, t1], [b2, t2], [b3, t3] ].forEach(([b, t]) => {
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    });

    // Bottom Face Edges (Orange Glowing)
    ctx.shadowColor = '#ff7043';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#ff7043';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b3.x, b3.y);
    ctx.closePath(); ctx.stroke();

    ctx.restore();

    // ── Dimension Annotation Callouts ──────────────────────────────
    this.drawIsometricDimensions(ctx, b0, b1, b2, b3, t0, t1, t2, t3, W, H);
  },

  drawIsometricDimensions(ctx, b0, b1, b2, b3, t0, t1, t2, t3, W, H) {
    ctx.save();
    ctx.font = `600 11px 'JetBrains Mono', monospace`;
    ctx.lineWidth = 1.2;

    // Height callout (H mm) along edge b0 -> b3
    const vH_x = b3.x - b0.x;
    const vH_y = b3.y - b0.y;
    const lenH = Math.hypot(vH_x, vH_y) || 1;
    const perpH_x = -vH_y / lenH * 25;
    const perpH_y = vH_x / lenH * 25;

    ctx.strokeStyle = '#00b4d8';
    ctx.fillStyle = '#00b4d8';

    const p0H = { x: b0.x + perpH_x, y: b0.y + perpH_y };
    const p3H = { x: b3.x + perpH_x, y: b3.y + perpH_y };
    const midH = { x: (p0H.x + p3H.x) / 2, y: (p0H.y + p3H.y) / 2 };

    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y); ctx.lineTo(p0H.x, p0H.y);
    ctx.moveTo(b3.x, b3.y); ctx.lineTo(p3H.x, p3H.y);
    ctx.moveTo(p0H.x, p0H.y); ctx.lineTo(p3H.x, p3H.y);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(midH.x, midH.y);
    let angH = Math.atan2(vH_y, vH_x);
    if (angH > Math.PI / 2 || angH < -Math.PI / 2) angH += Math.PI;
    ctx.rotate(angH);
    ctx.fillText(`${H}mm`, 0, -6);
    ctx.restore();

    // Width callout (W mm) along edge b0 -> b1
    const vW_x = b1.x - b0.x;
    const vW_y = b1.y - b0.y;
    const lenW = Math.hypot(vW_x, vW_y) || 1;
    const perpW_x = vW_y / lenW * 25;
    const perpW_y = -vW_x / lenW * 25;

    ctx.strokeStyle = '#ff7043';
    ctx.fillStyle = '#ff7043';

    const p0W = { x: b0.x + perpW_x, y: b0.y + perpW_y };
    const p1W = { x: b1.x + perpW_x, y: b1.y + perpW_y };
    const midW = { x: (p0W.x + p1W.x) / 2, y: (p0W.y + p1W.y) / 2 };

    ctx.beginPath();
    ctx.moveTo(b0.x, b0.y); ctx.lineTo(p0W.x, p0W.y);
    ctx.moveTo(b1.x, b1.y); ctx.lineTo(p1W.x, p1W.y);
    ctx.moveTo(p0W.x, p0W.y); ctx.lineTo(p1W.x, p1W.y);
    ctx.stroke();

    ctx.save();
    ctx.translate(midW.x, midW.y);
    let angW = Math.atan2(vW_y, vW_x);
    if (angW > Math.PI / 2 || angW < -Math.PI / 2) angW += Math.PI;
    ctx.rotate(angW);
    ctx.fillText(`${W}mm`, 0, 14);
    ctx.restore();

    ctx.restore();
  },

  getDrillHoles(op, pieceW, pieceH) {
    const pw = pieceW !== undefined ? pieceW : this.pieceW;
    const ph = pieceH !== undefined ? pieceH : this.pieceH;

    const startX = App.getOpVal ? App.getOpVal(op, 'x', op.x) : (op.x || 0);
    const startY = App.getOpVal ? App.getOpVal(op, 'y', op.y) : (op.y || 0);
    const qty = Math.max(1, parseInt(App.getOpVal ? App.getOpVal(op, 'qty', op.qty) : op.qty) || 1);
    const dx = qty > 1 ? (App.getOpVal ? App.getOpVal(op, 'dx', op.dx) : (op.dx || 0)) : 0;
    const dy = qty > 1 ? (App.getOpVal ? App.getOpVal(op, 'dy', op.dy) : (op.dy || 0)) : 0;
    const mirrorX = !!op.mirrorX;
    const mirrorY = !!op.mirrorY;

    const L = pw;
    const A = ph;

    const holes = [];

    for (let k = 0; k < qty; k++) {
      const instX = startX + k * dx;
      const instY = startY + k * dy;

      // 1. Original
      holes.push({ x: instX, y: instY });

      // 2. Espelho X (X_esp = L - X, mantendo Y)
      if (mirrorX) {
        holes.push({ x: L - instX, y: instY });
      }

      // 3. Espelho Y (Y_esp = A - Y, mantendo X)
      if (mirrorY) {
        holes.push({ x: instX, y: A - instY });
      }

      // 4. Espelho Duplo (L - X, A - Y) se ambos ativos
      if (mirrorX && mirrorY) {
        holes.push({ x: L - instX, y: A - instY });
      }
    }

    return holes;
  },

  drawOperations(ctx) {
    const ops = App.operations || [];

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const isSelected = App.selectedOpIndex === i;

      if (this.viewMode === '2d') {
        if (op.type === 'line') this.drawLineOp(ctx, op, isSelected);
        else if (op.type === 'curve') this.drawCurveOp(ctx, op, isSelected);
        else if (op.type === 'path') this.drawPathOp(ctx, op, isSelected);
        else if (op.type === 'circle') this.drawCircleOp(ctx, op, isSelected);
        else if (op.type === 'rect') this.drawRectOp(ctx, op, isSelected);
        else if (op.type === 'drill') this.drawDrillOp(ctx, op, isSelected);
        else if (op.type === 'park') this.drawParkOp(ctx, op, isSelected);
      } else {
        // 3D & Raio-X Modes: Render real 3D Carved Groove with Depth, Floor & Sidewalls
        this.draw3DGrooveCut(ctx, op, isSelected);
      }
    }

    if (this.previewArrayOps && this.previewArrayOps.length > 0) {
      for (let p = 0; p < this.previewArrayOps.length; p++) {
        const pop = this.previewArrayOps[p];
        if (this.viewMode === '2d') {
          if (pop.type === 'line') this.drawLineOp(ctx, pop, true);
          else if (pop.type === 'curve') this.drawCurveOp(ctx, pop, true);
          else if (pop.type === 'path') this.drawPathOp(ctx, pop, true);
          else if (pop.type === 'circle') this.drawCircleOp(ctx, pop, true);
          else if (pop.type === 'rect') this.drawRectOp(ctx, pop, true);
          else if (pop.type === 'drill') this.drawDrillOp(ctx, pop, true);
        } else {
          this.draw3DGrooveCut(ctx, pop, true);
        }
      }
    }
  },

  // ── 3D Carved Groove & Slot Cut Rendering ─────────────────────

  draw3DGrooveCut(ctx, op, selected) {
    if (op.type === 'park') {
      this.drawParkOp(ctx, op, selected);
      return;
    }

    const corr = op.correction || 'meio';
    const gw = App.getOpVal ? App.getOpVal(op, 'grooveWidth', 6) : (op.grooveWidth || 6);
    const depth = App.getOpVal ? App.getOpVal(op, 'depth', 5) : (op.depth || 5);

    const zTop = this.pieceD;
    const zBot = Math.max(0, this.pieceD - depth);

    const is3DSolid = this.viewMode === '3d';
    const mdfPattern = is3DSolid ? this.getMDFPattern(ctx) : (selected ? 'rgba(255, 214, 0, 0.25)' : 'rgba(8, 14, 24, 0.95)');
    const wallColor = is3DSolid ? '#b38346' : (selected ? 'rgba(255, 214, 0, 0.35)' : 'rgba(0, 230, 118, 0.25)');
    const bandColor = is3DSolid ? '#222222' : (selected ? '#ffd600' : '#00e676');

    ctx.save();

    if (op.type === 'line') {
      const sx = App.getOpVal(op, 'startX', 0);
      const sy = App.getOpVal(op, 'startY', 0);
      const ex = App.getOpVal(op, 'endX', 100);
      const ey = App.getOpVal(op, 'endY', 0);

      const halfW = gw / 2;
      const dx = ex - sx, dy = ey - sy;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len * halfW, ny = dx / len * halfW;

      // Top outer corners
      const tL1 = this.toIso(sx + nx, sy + ny, zTop);
      const tL2 = this.toIso(ex + nx, ey + ny, zTop);
      const tR1 = this.toIso(sx - nx, sy - ny, zTop);
      const tR2 = this.toIso(ex - nx, ey - ny, zTop);

      // Floor outer corners
      const bL1 = this.toIso(sx + nx, sy + ny, zBot);
      const bL2 = this.toIso(ex + nx, ey + ny, zBot);
      const bR1 = this.toIso(sx - nx, sy - ny, zBot);
      const bR2 = this.toIso(ex - nx, ey - ny, zBot);

      // 1. Draw 3D Recessed MDF Floor quad polygon
      ctx.fillStyle = mdfPattern;
      ctx.beginPath();
      ctx.moveTo(bL1.x, bL1.y); ctx.lineTo(bL2.x, bL2.y);
      ctx.lineTo(bR2.x, bR2.y); ctx.lineTo(bR1.x, bR1.y);
      ctx.closePath(); ctx.fill();

      // 2. Draw 3D Milled MDF Inner Sidewalls
      const drawWall = (p1, p2, p3, p4, shade = '#b38346') => {
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = bandColor;
        ctx.lineWidth = 1;
        ctx.stroke();
      };

      drawWall(tL1, tL2, bL2, bL1, '#9e7239');
      drawWall(tR1, tR2, bR2, bR1, '#b38346');
      drawWall(tL1, tR1, bR1, bL1, '#8a5e26');
      drawWall(tL2, tR2, bR2, bL2, '#c59656');

      // 3. Draw Top Rim & Centerline CAD Vectors
      ctx.strokeStyle = selected ? '#ffd600' : bandColor;
      ctx.lineWidth = selected ? 2.5 : 1.2;
      ctx.beginPath(); ctx.moveTo(tL1.x, tL1.y); ctx.lineTo(tL2.x, tL2.y); ctx.lineTo(tR2.x, tR2.y); ctx.lineTo(tR1.x, tR1.y); ctx.closePath(); ctx.stroke();

    } else if (op.type === 'rect') {
      const rx = App.getOpVal(op, 'x', 0);
      const ry = App.getOpVal(op, 'y', 0);
      const rl = App.getOpVal(op, 'length', 100);
      const rw = App.getOpVal(op, 'width', 100);

      // Outer rectangle boundary
      const o1 = { x: rx, y: ry };
      const o2 = { x: rx + rl, y: ry };
      const o3 = { x: rx + rl, y: ry + rw };
      const o4 = { x: rx, y: ry + rw };

      // Inner island boundary (if frame channel)
      const isPocket = op.isPocket;
      const i1 = { x: rx + gw, y: ry + gw };
      const i2 = { x: rx + rl - gw, y: ry + gw };
      const i3 = { x: rx + rl - gw, y: ry + rw - gw };
      const i4 = { x: rx + gw, y: ry + rw - gw };

      // Top outer rim
      const to1 = this.toIso(o1.x, o1.y, zTop), to2 = this.toIso(o2.x, o2.y, zTop);
      const to3 = this.toIso(o3.x, o3.y, zTop), to4 = this.toIso(o4.x, o4.y, zTop);

      // Floor outer rim
      const bo1 = this.toIso(o1.x, o1.y, zBot), bo2 = this.toIso(o2.x, o2.y, zBot);
      const bo3 = this.toIso(o3.x, o3.y, zBot), bo4 = this.toIso(o4.x, o4.y, zBot);

      // Top inner island rim
      const ti1 = this.toIso(i1.x, i1.y, zTop), ti2 = this.toIso(i2.x, i2.y, zTop);
      const ti3 = this.toIso(i3.x, i3.y, zTop), ti4 = this.toIso(i4.x, i4.y, zTop);

      // Floor inner island rim
      const bi1 = this.toIso(i1.x, i1.y, zBot), bi2 = this.toIso(i2.x, i2.y, zBot);
      const bi3 = this.toIso(i3.x, i3.y, zBot), bi4 = this.toIso(i4.x, i4.y, zBot);

      // 1. Draw Recessed MDF Floor
      ctx.fillStyle = mdfPattern;
      if (isPocket || rl <= 2 * gw || rw <= 2 * gw) {
        // Full pocket floor
        ctx.beginPath();
        ctx.moveTo(bo1.x, bo1.y); ctx.lineTo(bo2.x, bo2.y);
        ctx.lineTo(bo3.x, bo3.y); ctx.lineTo(bo4.x, bo4.y);
        ctx.closePath(); ctx.fill();
      } else {
        // Frame channel floor (Ring between outer rim and inner island)
        ctx.beginPath();
        ctx.moveTo(bo1.x, bo1.y); ctx.lineTo(bo2.x, bo2.y); ctx.lineTo(bo3.x, bo3.y); ctx.lineTo(bo4.x, bo4.y); ctx.closePath();
        ctx.moveTo(bi1.x, bi1.y); ctx.lineTo(bi4.x, bi4.y); ctx.lineTo(bi3.x, bi3.y); ctx.lineTo(bi2.x, bi2.y); ctx.closePath();
        ctx.fill();
      }

      // 2. Draw Outer MDF Sidewalls
      const drawWall = (p1, p2, p3, p4, shade = '#b38346') => {
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = bandColor;
        ctx.lineWidth = 1;
        ctx.stroke();
      };

      drawWall(to1, to2, bo2, bo1, '#9e7239');
      drawWall(to2, to3, bo3, bo2, '#b38346');
      drawWall(to3, to4, bo4, bo3, '#8a5e26');
      drawWall(to4, to1, bo1, to4, '#c59656');

      if (!isPocket && rl > 2 * gw && rw > 2 * gw) {
        // 3. Draw Inner Island Sidewalls
        drawWall(ti1, ti2, bi2, bi1, '#8a5e26');
        drawWall(ti2, ti3, bi3, bi2, '#c59656');
        drawWall(ti3, ti4, bi4, bi3, '#9e7239');
        drawWall(ti4, ti1, bi1, bi4, '#b38346');

        // 4. Draw Raised White Melamine Center Island Top Face
        ctx.fillStyle = is3DSolid ? '#f5f7fa' : 'rgba(32, 42, 63, 0.9)';
        ctx.beginPath();
        ctx.moveTo(ti1.x, ti1.y); ctx.lineTo(ti2.x, ti2.y);
        ctx.lineTo(ti3.x, ti3.y); ctx.lineTo(ti4.x, ti4.y);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = selected ? '#ffd600' : bandColor;
        ctx.lineWidth = selected ? 2.5 : 1.2;
        ctx.stroke();
      }

      // Outer Rim CAD Outline
      ctx.strokeStyle = selected ? '#ffd600' : bandColor;
      ctx.lineWidth = selected ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.moveTo(to1.x, to1.y); ctx.lineTo(to2.x, to2.y);
      ctx.lineTo(to3.x, to3.y); ctx.lineTo(to4.x, to4.y);
      ctx.closePath(); ctx.stroke();

    } else if (op.type === 'circle') {
      const cx = App.getOpVal(op, 'centerX', 0);
      const cy = App.getOpVal(op, 'centerY', 0);
      const radius = App.getOpVal(op, 'radius', 50);
      const rEff = this.calcCircleRadiusOffset(radius, corr, gw);

      const steps = 32;
      const topPts = [];
      const botPts = [];

      for (let s = 0; s <= steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const px = cx + Math.cos(a) * rEff;
        const py = cy + Math.sin(a) * rEff;
        topPts.push(this.toIso(px, py, zTop));
        botPts.push(this.toIso(px, py, zBot));
      }

      // Recessed 3D Floor
      ctx.fillStyle = mdfPattern;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        if (i === 0) ctx.moveTo(botPts[i].x, botPts[i].y);
        else ctx.lineTo(botPts[i].x, botPts[i].y);
      }
      ctx.closePath(); ctx.fill();

      // 3D Cylinder Inner Sidewalls
      for (let i = 0; i < steps; i++) {
        ctx.fillStyle = wallColor;
        ctx.beginPath();
        ctx.moveTo(topPts[i].x, topPts[i].y);
        ctx.lineTo(topPts[i + 1].x, topPts[i + 1].y);
        ctx.lineTo(botPts[i + 1].x, botPts[i + 1].y);
        ctx.lineTo(botPts[i].x, botPts[i].y);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = is3DSolid ? '#222222' : 'rgba(0, 230, 118, 0.2)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Top Rim Circle Outline
      ctx.strokeStyle = selected ? '#ffd600' : bandColor;
      ctx.lineWidth = selected ? 2.5 : 1.2;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        if (i === 0) ctx.moveTo(topPts[i].x, topPts[i].y);
        else ctx.lineTo(topPts[i].x, topPts[i].y);
      }
      ctx.stroke();

    } else if (op.type === 'curve') {
      const sx = App.getOpVal(op, 'startX', 0);
      const sy = App.getOpVal(op, 'startY', 0);
      const ex = App.getOpVal(op, 'endX', 100);
      const ey = App.getOpVal(op, 'endY', 100);
      const radius = App.getOpVal(op, 'radius', 50);
      const isCW = op.curveDirection === 'cw' || op.curveDirection === 'cw180';

      const center = calcArcCenter(sx, sy, ex, ey, radius, op.curveDirection);
      let angStart = Math.atan2(sy - center.y, sx - center.x);
      let angEnd = Math.atan2(ey - center.y, ex - center.x);

      let sweep = angEnd - angStart;
      if (isCW && sweep > 0) sweep -= Math.PI * 2;
      if (!isCW && sweep < 0) sweep += Math.PI * 2;

      let rEff = radius;
      if (corr === 'esquerda') rEff += (gw / 2) * (isCW ? 1 : -1);
      else if (corr === 'direita') rEff -= (gw / 2) * (isCW ? 1 : -1);
      rEff = Math.max(1, rEff);

      const steps = 24;
      const topPts = [];
      const botPts = [];

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const a = angStart + sweep * t;
        const px = center.x + Math.cos(a) * rEff;
        const py = center.y + Math.sin(a) * rEff;
        topPts.push(this.toIso(px, py, zTop));
        botPts.push(this.toIso(px, py, zBot));
      }

      // 3D Inner Arc Wall
      for (let i = 0; i < steps; i++) {
        ctx.fillStyle = wallColor;
        ctx.beginPath();
        ctx.moveTo(topPts[i].x, topPts[i].y);
        ctx.lineTo(topPts[i + 1].x, topPts[i + 1].y);
        ctx.lineTo(botPts[i + 1].x, botPts[i + 1].y);
        ctx.lineTo(botPts[i].x, botPts[i].y);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = is3DSolid ? '#222222' : 'rgba(0, 230, 118, 0.2)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Top Rim Vector Line
      ctx.strokeStyle = bandColor;
      ctx.lineWidth = selected ? 2.5 : 1.5;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        if (i === 0) ctx.moveTo(topPts[i].x, topPts[i].y);
        else ctx.lineTo(topPts[i].x, topPts[i].y);
      }
      ctx.stroke();

      this.drawPoint(ctx, topPts[0].x, topPts[0].y, bandColor, 4);
      this.drawPoint(ctx, topPts[steps].x, topPts[steps].y, bandColor, 4);
    } else if (op.type === 'path') {
      let curX = App.getOpVal ? App.getOpVal(op, 'startX', op.startPoint ? op.startPoint.x : 0) : (op.startPoint ? op.startPoint.x : 0);
      let curY = App.getOpVal ? App.getOpVal(op, 'startY', op.startPoint ? op.startPoint.y : 0) : (op.startPoint ? op.startPoint.y : 0);

      for (const seg of (op.segments || [])) {
        if (seg.type === 'line') {
          const sx = curX, sy = curY;
          const ex = seg.endX, ey = seg.endY;

          const halfW = gw / 2;
          const dx = ex - sx, dy = ey - sy;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len * halfW, ny = dx / len * halfW;

          const tL1 = this.toIso(sx + nx, sy + ny, zTop);
          const tL2 = this.toIso(ex + nx, ey + ny, zTop);
          const tR1 = this.toIso(sx - nx, sy - ny, zTop);
          const tR2 = this.toIso(ex - nx, ey - ny, zTop);

          const bL1 = this.toIso(sx + nx, sy + ny, zBot);
          const bL2 = this.toIso(ex + nx, ey + ny, zBot);
          const bR1 = this.toIso(sx - nx, sy - ny, zBot);
          const bR2 = this.toIso(ex - nx, ey - ny, zBot);

          ctx.fillStyle = mdfPattern;
          ctx.beginPath();
          ctx.moveTo(bL1.x, bL1.y); ctx.lineTo(bL2.x, bL2.y);
          ctx.lineTo(bR2.x, bR2.y); ctx.lineTo(bR1.x, bR1.y);
          ctx.closePath(); ctx.fill();

          const drawWall = (p1, p2, p3, p4, shade = '#b38346') => {
            ctx.fillStyle = shade;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
            ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = bandColor;
            ctx.lineWidth = 1;
            ctx.stroke();
          };

          drawWall(tL1, tL2, bL2, bL1, '#9e7239');
          drawWall(tR1, tR2, bR2, bR1, '#b38346');

          curX = ex; curY = ey;
        }
      }
    } else if (op.type === 'drill') {
      const holes = this.getDrillHoles(op);
      const diameter = App.getOpVal ? App.getOpVal(op, 'diameter', op.diameter) : (op.diameter || 8);
      const radius = diameter / 2;

      for (const hole of holes) {
        const cx = hole.x;
        const cy = hole.y;
        const steps = 24;
        const topPts = [];
        const botPts = [];

        for (let s = 0; s <= steps; s++) {
          const a = (s / steps) * Math.PI * 2;
          const px = cx + Math.cos(a) * radius;
          const py = cy + Math.sin(a) * radius;
          topPts.push(this.toIso(px, py, zTop));
          botPts.push(this.toIso(px, py, zBot));
        }

        // Recessed 3D Floor
        ctx.fillStyle = mdfPattern;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          if (i === 0) ctx.moveTo(botPts[i].x, botPts[i].y);
          else ctx.lineTo(botPts[i].x, botPts[i].y);
        }
        ctx.closePath(); ctx.fill();

        // 3D Cylinder Inner Sidewalls
        for (let i = 0; i < steps; i++) {
          ctx.fillStyle = wallColor;
          ctx.beginPath();
          ctx.moveTo(topPts[i].x, topPts[i].y);
          ctx.lineTo(topPts[i + 1].x, topPts[i + 1].y);
          ctx.lineTo(botPts[i + 1].x, botPts[i + 1].y);
          ctx.lineTo(botPts[i].x, botPts[i].y);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = is3DSolid ? '#222222' : 'rgba(0, 230, 118, 0.2)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }

        // Top Rim Circle Outline
        ctx.strokeStyle = selected ? '#ffd600' : bandColor;
        ctx.lineWidth = selected ? 2.5 : 1.2;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          if (i === 0) ctx.moveTo(topPts[i].x, topPts[i].y);
          else ctx.lineTo(topPts[i].x, topPts[i].y);
        }
        ctx.stroke();
      }
    }

    ctx.restore();
  },

  drawParkOp(ctx, op, selected) {
    const pt = this.toCanvas(op.x || 1850, op.y || 2750);
    const color = selected ? '#ffd600' : '#7c5cff';
    this.drawPoint(ctx, pt.x, pt.y, color, 6);
    ctx.save();
    ctx.font = `600 11px 'JetBrains Mono', monospace`;
    ctx.fillStyle = color;
    ctx.fillText(`🅿️ Park (X${op.x} Y${op.y} Z${op.z})`, pt.x + 8, pt.y - 6);
    ctx.restore();
  },

  // ── Live Vectorization Dynamic Preview ──────────────────────

  drawLivePreview(ctx) {
    const op = App.livePreviewOp;
    if (!op) return;

    ctx.save();
    const previewColor = '#ffd600'; // Bright neon yellow live preview
    ctx.shadowColor = previewColor;
    ctx.shadowBlur = 8;
    ctx.setLineDash([]); // Smooth solid stroke on thick band (prevents dash combs on zoom)

    const corr = op.correction || 'meio';
    const gw = op.grooveWidth || 6;
    const bandWidth = Math.max(2, gw * this.scale);

    if (op.type === 'line') {
      const off = this.calcLineOffset(op.startX, op.startY, op.endX, op.endY, corr, gw);
      const p1 = this.toCanvas(off.sx, off.sy);
      const p2 = this.toCanvas(off.ex, off.ey);

      // Thick groove band
      ctx.strokeStyle = 'rgba(255, 214, 0, 0.75)';
      ctx.lineWidth = bandWidth;
      ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();

      // Thin centerline vector
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      ctx.setLineDash([]);

      if (this.showDirections) {
        this.drawSegmentArrows(ctx, p1, p2, true);
      }

      this.drawPoint(ctx, p2.x, p2.y, previewColor, 5);
      if (this.showDirections) {
        this.drawStartPoint(ctx, p1.x, p1.y, 8);
      } else {
        this.drawPoint(ctx, p1.x, p1.y, previewColor, 5);
      }

      ctx.font = `600 11px 'JetBrains Mono', monospace`;
      ctx.fillStyle = previewColor;
      ctx.shadowBlur = 4;
      ctx.fillText(`(${op.startX}, ${op.startY}) [${corr}]`, p1.x + 8, p1.y - 8);
    } else if (op.type === 'curve') {
      const center = calcArcCenter(op.startX, op.startY, op.endX, op.endY, op.radius, op.curveDirection);
      const angStart = Math.atan2(op.startY - center.y, op.startX - center.x);
      const angEnd = Math.atan2(op.endY - center.y, op.endX - center.x);
      const isCW = op.curveDirection === 'cw' || op.curveDirection === 'cw180';

      let rEff = op.radius;
      if (corr === 'esquerda') rEff += (gw / 2) * (isCW ? 1 : -1);
      else if (corr === 'direita') rEff -= (gw / 2) * (isCW ? 1 : -1);
      rEff = Math.max(1, rEff);

      // Thick groove band
      ctx.lineWidth = bandWidth;
      ctx.lineCap = 'butt';
      this.drawArcWithCenter(ctx, center, rEff, angStart, angEnd, op.curveDirection, 'rgba(255, 214, 0, 0.75)');

      // Thin centerline vector
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      this.drawArcWithCenter(ctx, center, rEff, angStart, angEnd, op.curveDirection, '#ffffff');
      ctx.setLineDash([]);

      const p1 = this.toCanvas(op.startX, op.startY);
      const p2 = this.toCanvas(op.endX, op.endY);

      if (this.showDirections) {
        this.drawArcArrows(ctx, center, rEff, angStart, angEnd, op.curveDirection, true);
      }

      this.drawPoint(ctx, p2.x, p2.y, previewColor, 5);
      if (this.showDirections) {
        this.drawStartPoint(ctx, p1.x, p1.y, 8);
      } else {
        this.drawPoint(ctx, p1.x, p1.y, previewColor, 5);
      }

      ctx.font = `600 11px 'JetBrains Mono', monospace`;
      ctx.fillStyle = previewColor;
      ctx.shadowBlur = 4;
      ctx.fillText(`R${op.radius} [${corr}]`, (p1.x + p2.x) / 2 + 10, (p1.y + p2.y) / 2);
    } else if (op.type === 'circle') {
      const rEff = this.calcCircleRadiusOffset(op.radius, corr, gw);

      // Thick groove band
      ctx.lineWidth = bandWidth;
      this.drawCirclePath(ctx, op.centerX, op.centerY, rEff, 'rgba(255, 214, 0, 0.75)');

      // Thin centerline
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      this.drawCirclePath(ctx, op.centerX, op.centerY, rEff, '#ffffff');
      ctx.setLineDash([]);

      const centerPt = this.toCanvas(op.centerX, op.centerY);
      this.drawPoint(ctx, centerPt.x, centerPt.y, previewColor, 5);

      if (this.showDirections) {
        this.drawCircleArrows(ctx, op.centerX, op.centerY, rEff, true);
        const pStart = this.toCanvas(op.centerX + rEff, op.centerY);
        this.drawStartPoint(ctx, pStart.x, pStart.y, 8);
      }

      ctx.font = `600 11px 'JetBrains Mono', monospace`;
      ctx.fillStyle = previewColor;
      ctx.shadowBlur = 4;
      ctx.fillText(`Círculo R${op.radius} [${corr}] ${op.isPocket ? '(Pocket)' : ''}`, centerPt.x + 10, centerPt.y - 10);
    } else if (op.type === 'rect') {
      const rectEff = this.calcRectOffset(op.x, op.y, op.length, op.width, corr, gw);
      const cr = Math.min(op.cornerRadius || 0, Math.min(rectEff.length, rectEff.width) / 2);

      // Thick groove band
      ctx.lineWidth = bandWidth;
      this.drawRectPath(ctx, rectEff.x, rectEff.y, rectEff.length, rectEff.width, cr, 'rgba(255, 214, 0, 0.75)');

      // Thin centerline
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      this.drawRectPath(ctx, rectEff.x, rectEff.y, rectEff.length, rectEff.width, cr, '#ffffff');
      ctx.setLineDash([]);

      const pBL = this.toCanvas(rectEff.x, rectEff.y);
      const pTL = this.toCanvas(rectEff.x, rectEff.y + rectEff.width);
      const pTR = this.toCanvas(rectEff.x + rectEff.length, rectEff.y + rectEff.width);
      const pBR = this.toCanvas(rectEff.x + rectEff.length, rectEff.y);

      if (this.showDirections) {
        if (cr <= 0) {
          this.drawSegmentArrows(ctx, pBL, pTL, true);
          this.drawSegmentArrows(ctx, pTL, pTR, true);
          this.drawSegmentArrows(ctx, pTR, pBR, true);
          this.drawSegmentArrows(ctx, pBR, pBL, true);

          this.drawPoint(ctx, pTL.x, pTL.y, previewColor, 4);
          this.drawPoint(ctx, pTR.x, pTR.y, previewColor, 4);
          this.drawPoint(ctx, pBR.x, pBR.y, previewColor, 4);
          this.drawStartPoint(ctx, pBL.x, pBL.y, 8);
        } else {
          const pStart = this.toCanvas(rectEff.x, rectEff.y + cr);
          const p1Top = this.toCanvas(rectEff.x, rectEff.y + rectEff.width - cr);
          const p2Left = this.toCanvas(rectEff.x + cr, rectEff.y + rectEff.width);
          const p2Right = this.toCanvas(rectEff.x + rectEff.length - cr, rectEff.y + rectEff.width);
          const p3Top = this.toCanvas(rectEff.x + rectEff.length, rectEff.y + rectEff.width - cr);
          const p3Bottom = this.toCanvas(rectEff.x + rectEff.length, rectEff.y + cr);
          const p4Right = this.toCanvas(rectEff.x + rectEff.length - cr, rectEff.y);
          const p4Left = this.toCanvas(rectEff.x + cr, rectEff.y);

          this.drawSegmentArrows(ctx, pStart, p1Top, true);
          this.drawSegmentArrows(ctx, p2Left, p2Right, true);
          this.drawSegmentArrows(ctx, p3Top, p3Bottom, true);
          this.drawSegmentArrows(ctx, p4Right, p4Left, true);

          this.drawStartPoint(ctx, pStart.x, pStart.y, 8);
        }
      } else {
        this.drawPoint(ctx, pBL.x, pBL.y, previewColor, 5);
      }

      ctx.font = `600 11px 'JetBrains Mono', monospace`;
      ctx.fillStyle = previewColor;
      ctx.shadowBlur = 4;
    } else if (op.type === 'path') {
      const toolDiam = this.getOpToolDiameter ? this.getOpToolDiameter(op) : (Storage.getToolById(op.toolId)?.diameter || 6);
      const gw = op.grooveWidth || toolDiam;
      const bandWidth = Math.max(2, (op.correction === 'meio' ? toolDiam : gw) * this.scale);
      const corr = op.correction || 'meio';

      let curX = op.startPoint ? op.startPoint.x : 0;
      let curY = op.startPoint ? op.startPoint.y : 0;
      const startPt = this.toCanvas(curX, curY);

      // Draw groove band in bright yellow preview
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 214, 0, 0.75)';
      ctx.lineWidth = bandWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const seg of (op.segments || [])) {
        if (seg.type === 'line') {
          const off = this.calcLineOffset(curX, curY, seg.endX, seg.endY, corr, gw);
          const p1 = this.toCanvas(off.sx, off.sy);
          const p2 = this.toCanvas(off.ex, off.ey);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
          curX = seg.endX; curY = seg.endY;
        } else if (seg.type === 'curve') {
          const radius = seg.radius || 50;
          const dir = seg.curveDirection || 'cw';
          const center = calcArcCenter(curX, curY, seg.endX, seg.endY, radius, dir);
          const angStart = Math.atan2(curY - center.y, curX - center.x);
          const angEnd = Math.atan2(seg.endY - center.y, seg.endX - center.x);
          let rEff = radius;
          const isCW = dir === 'cw' || dir === 'cw180';
          if (corr === 'esquerda') rEff += (gw / 2) * (isCW ? 1 : -1);
          else if (corr === 'direita') rEff -= (gw / 2) * (isCW ? 1 : -1);
          rEff = Math.max(1, rEff);
          this.drawArcWithCenter(ctx, center, rEff, angStart, angEnd, dir, 'rgba(255, 214, 0, 0.75)');
          curX = seg.endX; curY = seg.endY;
        }
      }
      ctx.restore();

      // Draw vector centerline
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);

      curX = op.startPoint ? op.startPoint.x : 0;
      curY = op.startPoint ? op.startPoint.y : 0;

      for (const seg of (op.segments || [])) {
        if (seg.type === 'line') {
          const off = this.calcLineOffset(curX, curY, seg.endX, seg.endY, corr, gw);
          const p1 = this.toCanvas(off.sx, off.sy);
          const p2 = this.toCanvas(off.ex, off.ey);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
          curX = seg.endX; curY = seg.endY;
        } else if (seg.type === 'curve') {
          const radius = seg.radius || 50;
          const dir = seg.curveDirection || 'cw';
          const center = calcArcCenter(curX, curY, seg.endX, seg.endY, radius, dir);
          const angStart = Math.atan2(curY - center.y, curX - center.x);
          const angEnd = Math.atan2(seg.endY - center.y, seg.endX - center.x);
          let rEff = radius;
          const isCW = dir === 'cw' || dir === 'cw180';
          if (corr === 'esquerda') rEff += (gw / 2) * (isCW ? 1 : -1);
          else if (corr === 'direita') rEff -= (gw / 2) * (isCW ? 1 : -1);
          rEff = Math.max(1, rEff);
          this.drawArcWithCenter(ctx, center, rEff, angStart, angEnd, dir, '#ffffff');
          curX = seg.endX; curY = seg.endY;
        }
      }
      ctx.restore();

      if (this.showDirections) {
        curX = op.startPoint ? op.startPoint.x : 0;
        curY = op.startPoint ? op.startPoint.y : 0;
        for (const seg of (op.segments || [])) {
          if (seg.type === 'line') {
            const off = this.calcLineOffset(curX, curY, seg.endX, seg.endY, corr, gw);
            const p1 = this.toCanvas(off.sx, off.sy);
            const p2 = this.toCanvas(off.ex, off.ey);
            this.drawSegmentArrows(ctx, p1, p2, true);
          } else if (seg.type === 'curve') {
            const radius = seg.radius || 50;
            const dir = seg.curveDirection || 'cw';
            const center = calcArcCenter(curX, curY, seg.endX, seg.endY, radius, dir);
            const angStart = Math.atan2(curY - center.y, curX - center.x);
            const angEnd = Math.atan2(seg.endY - center.y, seg.endX - center.x);
            let rEff = radius;
            const isCW = dir === 'cw' || dir === 'cw180';
            if (corr === 'esquerda') rEff += (gw / 2) * (isCW ? 1 : -1);
            else if (corr === 'direita') rEff -= (gw / 2) * (isCW ? 1 : -1);
            rEff = Math.max(1, rEff);
            this.drawArcArrows(ctx, center, rEff, angStart, angEnd, dir, true);
          }
          curX = seg.endX; curY = seg.endY;
        }
      }

      // Draw node points
      curX = op.startPoint ? op.startPoint.x : 0;
      curY = op.startPoint ? op.startPoint.y : 0;
      for (const seg of (op.segments || [])) {
        const pt = this.toCanvas(seg.endX, seg.endY);
        this.drawPoint(ctx, pt.x, pt.y, previewColor, 4);
        curX = seg.endX; curY = seg.endY;
      }

      if (this.showDirections) {
        this.drawStartPoint(ctx, startPt.x, startPt.y, 8);
      } else {
        this.drawPoint(ctx, startPt.x, startPt.y, previewColor, 6);
      }

      if (op.closed && (op.segments || []).length > 0) {
        const off = this.calcLineOffset(curX, curY, op.startPoint.x, op.startPoint.y, corr, gw);
        const p1 = this.toCanvas(off.sx, off.sy);
        const p2 = this.toCanvas(off.ex, off.ey);
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        ctx.setLineDash([]);
        if (this.showDirections) {
          this.drawSegmentArrows(ctx, p1, p2, true);
        }
      }
    } else if (op.type === 'drill') {
      this.drawDrillOp(ctx, op, true);
    }

    ctx.restore();
  },

  drawDrillOp(ctx, op, selected) {
    const holes = this.getDrillHoles(op);
    const diameter = App.getOpVal ? App.getOpVal(op, 'diameter', op.diameter) : (op.diameter || 8);
    const radius = diameter / 2;
    const color = selected ? '#ffd600' : '#00e676';

    ctx.save();
    for (let i = 0; i < holes.length; i++) {
      const hole = holes[i];
      const pt = this.toCanvas(hole.x, hole.y);
      const canvasR = Math.max(2, radius * this.scale);

      // Circle background fill
      ctx.fillStyle = selected ? 'rgba(255, 214, 0, 0.2)' : 'rgba(0, 230, 118, 0.15)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, canvasR, 0, Math.PI * 2);
      ctx.fill();

      // Circle outline
      ctx.strokeStyle = color;
      ctx.lineWidth = selected ? 2.5 : 1.5;
      ctx.stroke();

      // Center crosshair
      const crossSize = Math.max(4, canvasR + 3);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pt.x - crossSize, pt.y); ctx.lineTo(pt.x + crossSize, pt.y);
      ctx.moveTo(pt.x, pt.y - crossSize); ctx.lineTo(pt.x, pt.y + crossSize);
      ctx.stroke();

      // Label on first hole
      if (i === 0) {
        ctx.font = `600 11px 'JetBrains Mono', monospace`;
        ctx.fillStyle = color;
        ctx.shadowBlur = 4;
        ctx.fillText(`Furo Ø${diameter}mm`, pt.x + canvasR + 6, pt.y - 4);
      }
    }
    ctx.restore();
  },

  // ── Offset Calculation Helpers ──────────────────────────────

  calcLineOffset(sx, sy, ex, ey, correction, grooveWidth) {
    if (!correction || correction === 'meio') return { sx, sy, ex, ey };
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const dist = (grooveWidth / 2) * (correction === 'esquerda' ? 1 : -1);
    return {
      sx: sx + dist * nx,
      sy: sy + dist * ny,
      ex: ex + dist * nx,
      ey: ey + dist * ny
    };
  },

  calcArcRadiusOffset(radius, correction, direction, grooveWidth) {
    if (!correction || correction === 'meio') return radius;
    const isCW = direction === 'cw' || direction === 'cw180';
    let delta = grooveWidth / 2;
    if (correction === 'esquerda') {
      delta = isCW ? delta : -delta;
    } else if (correction === 'direita') {
      delta = isCW ? -delta : delta;
    }
    return Math.max(1, radius + delta);
  },

  calcCircleRadiusOffset(radius, correction, grooveWidth) {
    if (!correction || correction === 'meio') return radius;
    const delta = (grooveWidth / 2) * (correction === 'esquerda' ? 1 : -1);
    return Math.max(1, radius + delta);
  },

  calcRectOffset(x, y, length, width, correction, grooveWidth) {
    if (!correction || correction === 'meio') return { x, y, length, width };
    const delta = (grooveWidth / 2) * (correction === 'esquerda' ? 1 : -1);
    return {
      x: x - delta,
      y: y - delta,
      length: Math.max(1, length + delta * 2),
      width: Math.max(1, width + delta * 2)
    };
  },

  // ── Vector Start Point and Direction Arrows (Aspire Style) ───

  drawStartPoint(ctx, x, y, size = 8) {
    ctx.save();
    const half = size / 2;
    // Ponto inicial: quadrado verde preenchido com borda preta nítida
    ctx.fillStyle = '#00e676';
    ctx.fillRect(x - half, y - half, size, size);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - half, y - half, size, size);
    ctx.restore();
  },

  drawDirectionArrow(ctx, x, y, angle, length = 7, isSelected = false) {
    ctx.save();
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const arrowColor = isSelected ? '#ffd600' : (isLight ? '#0f172a' : '#ffffff');
    const wingAngle = Math.PI * 0.82; // ~148 degrees backward

    // Contorno de contraste para legibilidade absoluta sobre qualquer cor
    ctx.beginPath();
    ctx.moveTo(x + (length + 0.6) * Math.cos(angle + wingAngle), y + (length + 0.6) * Math.sin(angle + wingAngle));
    ctx.lineTo(x + 0.6 * Math.cos(angle), y + 0.6 * Math.sin(angle));
    ctx.lineTo(x + (length + 0.6) * Math.cos(angle - wingAngle), y + (length + 0.6) * Math.sin(angle - wingAngle));
    ctx.strokeStyle = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.9)';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Seta chevron nítida
    ctx.beginPath();
    ctx.moveTo(x + length * Math.cos(angle + wingAngle), y + length * Math.sin(angle + wingAngle));
    ctx.lineTo(x, y);
    ctx.lineTo(x + length * Math.cos(angle - wingAngle), y + length * Math.sin(angle - wingAngle));
    ctx.strokeStyle = arrowColor;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  },

  drawSegmentArrows(ctx, p1, p2, isSelected = false, spacing = 45) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 12) return;
    const angle = Math.atan2(dy, dx);
    const numArrows = Math.max(1, Math.floor(dist / spacing));
    const step = dist / (numArrows + 1);
    for (let k = 1; k <= numArrows; k++) {
      const t = (k * step) / dist;
      const ax = p1.x + dx * t;
      const ay = p1.y + dy * t;
      this.drawDirectionArrow(ctx, ax, ay, angle, 7, isSelected);
    }
  },

  drawArcArrows(ctx, center, radius, angStart, angEnd, direction, isSelected = false, spacing = 45) {
    let aEnd = angEnd;
    if (direction === 'cw' && aEnd > angStart) aEnd -= Math.PI * 2;
    if (direction === 'ccw' && aEnd < angStart) aEnd += Math.PI * 2;

    const sweep = Math.abs(aEnd - angStart);
    const arcScreenLen = sweep * (radius * this.scale);
    if (arcScreenLen < 12) return;

    const numArrows = Math.max(1, Math.floor(arcScreenLen / spacing));
    const stepT = 1 / (numArrows + 1);

    for (let k = 1; k <= numArrows; k++) {
      const t = k * stepT;
      const ang = angStart + (aEnd - angStart) * t;
      const px = center.x + radius * Math.cos(ang);
      const py = center.y + radius * Math.sin(ang);
      const pt = this.toCanvas(px, py);

      const dt = 0.002;
      const angNext = angStart + (aEnd - angStart) * (t + dt);
      const pxNext = center.x + radius * Math.cos(angNext);
      const pyNext = center.y + radius * Math.sin(angNext);
      const ptNext = this.toCanvas(pxNext, pyNext);

      const angle = Math.atan2(ptNext.y - pt.y, ptNext.x - pt.x);
      this.drawDirectionArrow(ctx, pt.x, pt.y, angle, 7, isSelected);
    }
  },

  drawCircleArrows(ctx, cx, cy, radius, isSelected = false, spacing = 45) {
    const circLen = 2 * Math.PI * (radius * this.scale);
    const numArrows = Math.max(3, Math.min(16, Math.floor(circLen / spacing)));

    for (let k = 1; k <= numArrows; k++) {
      const t = (k - 0.5) / numArrows;
      const ang = -t * 2 * Math.PI; // Clockwise
      const px = cx + radius * Math.cos(ang);
      const py = cy + radius * Math.sin(ang);
      const pt = this.toCanvas(px, py);

      const dt = 0.002;
      const angNext = -(t + dt) * 2 * Math.PI;
      const pxNext = cx + radius * Math.cos(angNext);
      const pyNext = cy + radius * Math.sin(angNext);
      const ptNext = this.toCanvas(pxNext, pyNext);

      const angle = Math.atan2(ptNext.y - pt.y, ptNext.x - pt.x);
      this.drawDirectionArrow(ctx, pt.x, pt.y, angle, 7, isSelected);
    }
  },

  // ── Draw Operations with Band Width ─────────────────────────

  drawLineOp(ctx, op, selected) {
    const corr = op.correction || 'meio';
    const gw = App.getOpVal ? App.getOpVal(op, 'grooveWidth', 6) : (op.grooveWidth || 6);
    const sx = App.getOpVal ? App.getOpVal(op, 'startX', 0) : (op.startX || 0);
    const sy = App.getOpVal ? App.getOpVal(op, 'startY', 0) : (op.startY || 0);
    const ex = App.getOpVal ? App.getOpVal(op, 'endX', 100) : (op.endX || 100);
    const ey = App.getOpVal ? App.getOpVal(op, 'endY', 0) : (op.endY || 0);

    const off = this.calcLineOffset(sx, sy, ex, ey, corr, gw);
    const p1 = this.toCanvas(off.sx, off.sy);
    const p2 = this.toCanvas(off.ex, off.ey);
    const opColor = this.getOpColor(op, selected);

    // Draw groove width band
    const bandWidth = Math.max(2, gw * this.scale);
    ctx.save();
    ctx.strokeStyle = opColor;
    ctx.lineWidth = bandWidth;
    ctx.lineCap = 'butt';
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    ctx.restore();

    // Draw center vector line
    ctx.save();
    ctx.strokeStyle = selected ? '#ffffff' : 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    ctx.restore();

    // Seta de sentido do percurso (do ponto inicial ao final)
    if (this.showDirections) {
      this.drawSegmentArrows(ctx, p1, p2, selected);
    }

    // Nó final
    this.drawPoint(ctx, p2.x, p2.y, opColor, 4);

    // Ponto inicial da fresa: Quadrado verde com borda preta
    if (this.showDirections) {
      this.drawStartPoint(ctx, p1.x, p1.y, 8);
    } else {
      this.drawPoint(ctx, p1.x, p1.y, opColor, 4);
    }
  },

  drawCurveOp(ctx, op, selected) {
    const corr = op.correction || 'meio';
    const gw = App.getOpVal ? App.getOpVal(op, 'grooveWidth', 6) : (op.grooveWidth || 6);
    const sx = App.getOpVal ? App.getOpVal(op, 'startX', 0) : (op.startX || 0);
    const sy = App.getOpVal ? App.getOpVal(op, 'startY', 0) : (op.startY || 0);
    const ex = App.getOpVal ? App.getOpVal(op, 'endX', 100) : (op.endX || 100);
    const ey = App.getOpVal ? App.getOpVal(op, 'endY', 100) : (op.endY || 100);
    const radius = App.getOpVal ? App.getOpVal(op, 'radius', 50) : (op.radius || 50);
    const isCW = op.curveDirection === 'cw' || op.curveDirection === 'cw180';
    const opColor = this.getOpColor(op, selected);

    const center = calcArcCenter(sx, sy, ex, ey, radius, op.curveDirection);
    const angStart = Math.atan2(sy - center.y, sx - center.x);
    const angEnd = Math.atan2(ey - center.y, ex - center.x);

    let rEff = radius;
    if (corr === 'esquerda') {
      rEff += (gw / 2) * (isCW ? 1 : -1);
    } else if (corr === 'direita') {
      rEff -= (gw / 2) * (isCW ? 1 : -1);
    }
    rEff = Math.max(1, rEff);

    const bandWidth = Math.max(2, gw * this.scale);
    ctx.save();
    ctx.lineWidth = bandWidth;
    ctx.lineCap = 'butt';
    ctx.setLineDash([]);
    this.drawArcWithCenter(ctx, center, rEff, angStart, angEnd, op.curveDirection, opColor);
    ctx.restore();

    ctx.save();
    ctx.lineWidth = selected ? 2.5 : 1.5;
    this.drawArcWithCenter(ctx, center, rEff, angStart, angEnd, op.curveDirection, selected ? '#ffffff' : 'rgba(0, 0, 0, 0.7)');
    ctx.restore();

    const p1 = this.toCanvas(sx, sy);
    const p2 = this.toCanvas(ex, ey);

    // Setas indicando o percurso do arco
    if (this.showDirections) {
      this.drawArcArrows(ctx, center, rEff, angStart, angEnd, op.curveDirection, selected);
    }

    // Nó final
    this.drawPoint(ctx, p2.x, p2.y, opColor, 4);

    // Ponto inicial da fresa: Quadrado verde com borda preta
    if (this.showDirections) {
      this.drawStartPoint(ctx, p1.x, p1.y, 8);
    } else {
      this.drawPoint(ctx, p1.x, p1.y, opColor, 4);
    }
  },

  drawCircleOp(ctx, op, selected) {
    const corr = op.correction || 'meio';
    const gw = App.getOpVal ? App.getOpVal(op, 'grooveWidth', 6) : (op.grooveWidth || 6);
    const cx = App.getOpVal ? App.getOpVal(op, 'centerX', 0) : (op.centerX || 0);
    const cy = App.getOpVal ? App.getOpVal(op, 'centerY', 0) : (op.centerY || 0);
    const radius = App.getOpVal ? App.getOpVal(op, 'radius', 50) : (op.radius || 50);
    const rEff = this.calcCircleRadiusOffset(radius, corr, gw);
    const opColor = this.getOpColor(op, selected);

    const bandWidth = Math.max(2, gw * this.scale);
    ctx.save();
    ctx.lineWidth = bandWidth;
    ctx.setLineDash([]);
    this.drawCirclePath(ctx, cx, cy, rEff, opColor);
    ctx.restore();

    ctx.save();
    ctx.lineWidth = selected ? 2.5 : 1.5;
    this.drawCirclePath(ctx, cx, cy, rEff, selected ? '#ffffff' : 'rgba(0, 0, 0, 0.7)');
    ctx.restore();

    const centerPt = this.toCanvas(cx, cy);
    this.drawPoint(ctx, centerPt.x, centerPt.y, opColor, 4);

    if (op.isPocket) {
      this.drawCirclePath(ctx, cx, cy, rEff * 0.6, 'rgba(0, 230, 118, 0.4)');
      this.drawCirclePath(ctx, cx, cy, rEff * 0.3, 'rgba(0, 230, 118, 0.4)');
    }

    // Setas e ponto inicial da usinagem circular (Horário / Entrada às 3 horas)
    if (this.showDirections) {
      this.drawCircleArrows(ctx, cx, cy, rEff, selected);
      const pStart = this.toCanvas(cx + rEff, cy);
      this.drawStartPoint(ctx, pStart.x, pStart.y, 8);
    }
  },

  drawRectOp(ctx, op, selected) {
    const corr = op.correction || 'meio';
    const gw = App.getOpVal ? App.getOpVal(op, 'grooveWidth', 6) : (op.grooveWidth || 6);
    const rx = App.getOpVal ? App.getOpVal(op, 'x', 0) : (op.x || 0);
    const ry = App.getOpVal ? App.getOpVal(op, 'y', 0) : (op.y || 0);
    const rl = App.getOpVal ? App.getOpVal(op, 'length', 100) : (op.length || 100);
    const rw = App.getOpVal ? App.getOpVal(op, 'width', 100) : (op.width || 100);
    const rr = App.getOpVal ? App.getOpVal(op, 'cornerRadius', 0) : (op.cornerRadius || 0);
    const rectEff = this.calcRectOffset(rx, ry, rl, rw, corr, gw);
    const opColor = this.getOpColor(op, selected);
    const cr = Math.min(rr, Math.min(rectEff.length, rectEff.width) / 2);

    const bandWidth = Math.max(2, gw * this.scale);
    ctx.save();
    ctx.lineWidth = bandWidth;
    ctx.setLineDash([]);
    this.drawRectPath(ctx, rectEff.x, rectEff.y, rectEff.length, rectEff.width, cr, opColor);
    ctx.restore();

    ctx.save();
    ctx.lineWidth = selected ? 2.5 : 1.5;
    this.drawRectPath(ctx, rectEff.x, rectEff.y, rectEff.length, rectEff.width, cr, selected ? '#ffffff' : 'rgba(0, 0, 0, 0.7)');
    ctx.restore();

    const pBL = this.toCanvas(rectEff.x, rectEff.y);
    const pTL = this.toCanvas(rectEff.x, rectEff.y + rectEff.width);
    const pTR = this.toCanvas(rectEff.x + rectEff.length, rectEff.y + rectEff.width);
    const pBR = this.toCanvas(rectEff.x + rectEff.length, rectEff.y);

    if (cr <= 0) {
      if (this.showDirections) {
        // Sentido Horário / Fresagem Concordante como no Aspire / Foto do usuário:
        // Lado Esquerdo: BL -> TL (setas para cima ^)
        this.drawSegmentArrows(ctx, pBL, pTL, selected);
        // Lado Superior: TL -> TR (setas para direita >)
        this.drawSegmentArrows(ctx, pTL, pTR, selected);
        // Lado Direito: TR -> BR (setas para baixo v)
        this.drawSegmentArrows(ctx, pTR, pBR, selected);
        // Lado Inferior: BR -> BL (setas para esquerda <)
        this.drawSegmentArrows(ctx, pBR, pBL, selected);

        this.drawPoint(ctx, pTL.x, pTL.y, opColor, 3);
        this.drawPoint(ctx, pTR.x, pTR.y, opColor, 3);
        this.drawPoint(ctx, pBR.x, pBR.y, opColor, 3);

        // Ponto inicial: quadrado verde com borda preta no canto inferior esquerdo
        this.drawStartPoint(ctx, pBL.x, pBL.y, 8);
      } else {
        this.drawPoint(ctx, pBL.x, pBL.y, opColor, 3);
        this.drawPoint(ctx, pTL.x, pTL.y, opColor, 3);
        this.drawPoint(ctx, pTR.x, pTR.y, opColor, 3);
        this.drawPoint(ctx, pBR.x, pBR.y, opColor, 3);
      }
    } else {
      const pStart = this.toCanvas(rectEff.x, rectEff.y + cr);
      const p1Top = this.toCanvas(rectEff.x, rectEff.y + rectEff.width - cr);
      const p2Left = this.toCanvas(rectEff.x + cr, rectEff.y + rectEff.width);
      const p2Right = this.toCanvas(rectEff.x + rectEff.length - cr, rectEff.y + rectEff.width);
      const p3Top = this.toCanvas(rectEff.x + rectEff.length, rectEff.y + rectEff.width - cr);
      const p3Bottom = this.toCanvas(rectEff.x + rectEff.length, rectEff.y + cr);
      const p4Right = this.toCanvas(rectEff.x + rectEff.length - cr, rectEff.y);
      const p4Left = this.toCanvas(rectEff.x + cr, rectEff.y);

      if (this.showDirections) {
        this.drawSegmentArrows(ctx, pStart, p1Top, selected);
        this.drawSegmentArrows(ctx, p2Left, p2Right, selected);
        this.drawSegmentArrows(ctx, p3Top, p3Bottom, selected);
        this.drawSegmentArrows(ctx, p4Right, p4Left, selected);

        this.drawStartPoint(ctx, pStart.x, pStart.y, 8);
      } else {
        this.drawPoint(ctx, pBL.x, pBL.y, opColor, 3);
        this.drawPoint(ctx, pTL.x, pTL.y, opColor, 3);
        this.drawPoint(ctx, pTR.x, pTR.y, opColor, 3);
        this.drawPoint(ctx, pBR.x, pBR.y, opColor, 3);
      }
    }
  },

  drawArcWithCenter(ctx, center, radius, angStart, angEnd, direction, color) {
    const screenRadius = radius * this.scale;
    const numSteps = Math.max(36, Math.min(200, Math.ceil(screenRadius * 0.5)));
    ctx.beginPath();
    for (let i = 0; i <= numSteps; i++) {
      const t = i / numSteps;
      let aEnd = angEnd;
      if (direction === 'cw' && aEnd > angStart) aEnd -= Math.PI * 2;
      if (direction === 'ccw' && aEnd < angStart) aEnd += Math.PI * 2;

      const ang = angStart + (aEnd - angStart) * t;
      const px = center.x + radius * Math.cos(ang);
      const py = center.y + radius * Math.sin(ang);
      const pt = this.toCanvas(px, py);

      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.strokeStyle = color;
    ctx.stroke();
  },

  drawCirclePath(ctx, cx, cy, radius, color) {
    const steps = 36;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const ang = (i / steps) * Math.PI * 2;
      const px = cx + radius * Math.cos(ang);
      const py = cy + radius * Math.sin(ang);
      const pt = this.toCanvas(px, py);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.strokeStyle = color;
    ctx.stroke();
  },

  drawRectPath(ctx, x, y, length, width, radius, color) {
    const r = Math.min(radius || 0, Math.min(length, width) / 2);

    if (r <= 0) {
      const pBL = this.toCanvas(x, y);
      const pTL = this.toCanvas(x, y + width);
      const pTR = this.toCanvas(x + length, y + width);
      const pBR = this.toCanvas(x + length, y);

      ctx.beginPath();
      ctx.moveTo(pBL.x, pBL.y);
      ctx.lineTo(pTL.x, pTL.y);
      ctx.lineTo(pTR.x, pTR.y);
      ctx.lineTo(pBR.x, pBR.y);
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.stroke();
      return;
    }

    const pStart = this.toCanvas(x, y + r);
    const pTL = this.toCanvas(x, y + width);
    const pTR = this.toCanvas(x + length, y + width);
    const pBR = this.toCanvas(x + length, y);
    const pBL = this.toCanvas(x, y);

    const rCanvas = r * this.scale;

    ctx.beginPath();
    ctx.moveTo(pStart.x, pStart.y);
    ctx.arcTo(pTL.x, pTL.y, pTR.x, pTR.y, rCanvas);
    ctx.arcTo(pTR.x, pTR.y, pBR.x, pBR.y, rCanvas);
    ctx.arcTo(pBR.x, pBR.y, pBL.x, pBL.y, rCanvas);
    ctx.arcTo(pBL.x, pBL.y, pStart.x, pStart.y, rCanvas);
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.stroke();
  },

  drawPathOp(ctx, op, selected) {
    const corr = op.correction || 'meio';
    const gw = App.getOpVal ? App.getOpVal(op, 'grooveWidth', 6) : (op.grooveWidth || 6);
    const opColor = this.getOpColor(op, selected);
    const bandWidth = Math.max(2, gw * this.scale);

    let startX = App.getOpVal ? App.getOpVal(op, 'startX', op.startPoint?.x || 0) : (op.startPoint?.x || 0);
    let startY = App.getOpVal ? App.getOpVal(op, 'startY', op.startPoint?.y || 0) : (op.startPoint?.y || 0);

    const segments = op.segments || [];
    if (segments.length === 0) return;

    // ── PASS 1: Desenhar Banda da Largura do Corte ─────────────
    ctx.save();
    ctx.strokeStyle = opColor;
    ctx.lineWidth = bandWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);

    let curX = startX;
    let curY = startY;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const ex = App.getOpVal ? App.getOpVal(seg, 'endX', curX) : seg.endX;
      const ey = App.getOpVal ? App.getOpVal(seg, 'endY', curY) : seg.endY;

      if (seg.type === 'line') {
        const off = this.calcLineOffset(curX, curY, ex, ey, corr, gw);
        const p1 = this.toCanvas(off.sx, off.sy);
        const p2 = this.toCanvas(off.ex, off.ey);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      } else if (seg.type === 'curve') {
        const radius = App.getOpVal ? App.getOpVal(seg, 'radius', 50) : (seg.radius || 50);
        const dir = seg.curveDirection || 'cw';
        const center = calcArcCenter(curX, curY, ex, ey, radius, dir);
        const angStart = Math.atan2(curY - center.y, curX - center.x);
        const angEnd = Math.atan2(ey - center.y, ex - center.x);

        let rEff = radius;
        const isCW = dir === 'cw' || dir === 'cw180';
        if (corr === 'esquerda') {
          rEff += (gw / 2) * (isCW ? 1 : -1);
        } else if (corr === 'direita') {
          rEff -= (gw / 2) * (isCW ? 1 : -1);
        }
        rEff = Math.max(1, rEff);

        this.drawArcWithCenter(ctx, center, rEff, angStart, angEnd, dir, opColor);
      }
      curX = ex;
      curY = ey;
    }

    if (op.closed && segments.length > 0) {
      const off = this.calcLineOffset(curX, curY, startX, startY, corr, gw);
      const p1 = this.toCanvas(off.sx, off.sy);
      const p2 = this.toCanvas(off.ex, off.ey);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    ctx.restore();

    // ── PASS 2: Desenhar Linha Vetorial Central / Guia ────────
    ctx.save();
    ctx.strokeStyle = selected ? '#ffffff' : 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    curX = startX;
    curY = startY;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const ex = App.getOpVal ? App.getOpVal(seg, 'endX', curX) : seg.endX;
      const ey = App.getOpVal ? App.getOpVal(seg, 'endY', curY) : seg.endY;

      if (seg.type === 'line') {
        const off = this.calcLineOffset(curX, curY, ex, ey, corr, gw);
        const p1 = this.toCanvas(off.sx, off.sy);
        const p2 = this.toCanvas(off.ex, off.ey);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      } else if (seg.type === 'curve') {
        const radius = App.getOpVal ? App.getOpVal(seg, 'radius', 50) : (seg.radius || 50);
        const dir = seg.curveDirection || 'cw';
        const center = calcArcCenter(curX, curY, ex, ey, radius, dir);
        const angStart = Math.atan2(curY - center.y, curX - center.x);
        const angEnd = Math.atan2(ey - center.y, ex - center.x);

        let rEff = radius;
        const isCW = dir === 'cw' || dir === 'cw180';
        if (corr === 'esquerda') {
          rEff += (gw / 2) * (isCW ? 1 : -1);
        } else if (corr === 'direita') {
          rEff -= (gw / 2) * (isCW ? 1 : -1);
        }
        rEff = Math.max(1, rEff);

        this.drawArcWithCenter(ctx, center, rEff, angStart, angEnd, dir, selected ? '#ffffff' : 'rgba(0, 0, 0, 0.7)');
      }
      curX = ex;
      curY = ey;
    }

    if (op.closed && segments.length > 0) {
      const off = this.calcLineOffset(curX, curY, startX, startY, corr, gw);
      const p1 = this.toCanvas(off.sx, off.sy);
      const p2 = this.toCanvas(off.ex, off.ey);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    ctx.restore();

    // ── PASS 3: Setas de Sentido do Percurso ────────────────────
    if (this.showDirections) {
      curX = startX;
      curY = startY;

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const ex = App.getOpVal ? App.getOpVal(seg, 'endX', curX) : seg.endX;
        const ey = App.getOpVal ? App.getOpVal(seg, 'endY', curY) : seg.endY;

        if (seg.type === 'line') {
          const off = this.calcLineOffset(curX, curY, ex, ey, corr, gw);
          const p1 = this.toCanvas(off.sx, off.sy);
          const p2 = this.toCanvas(off.ex, off.ey);
          this.drawSegmentArrows(ctx, p1, p2, selected);
        } else if (seg.type === 'curve') {
          const radius = App.getOpVal ? App.getOpVal(seg, 'radius', 50) : (seg.radius || 50);
          const dir = seg.curveDirection || 'cw';
          const center = calcArcCenter(curX, curY, ex, ey, radius, dir);
          const angStart = Math.atan2(curY - center.y, curX - center.x);
          const angEnd = Math.atan2(ey - center.y, ex - center.x);

          let rEff = radius;
          const isCW = dir === 'cw' || dir === 'cw180';
          if (corr === 'esquerda') {
            rEff += (gw / 2) * (isCW ? 1 : -1);
          } else if (corr === 'direita') {
            rEff -= (gw / 2) * (isCW ? 1 : -1);
          }
          rEff = Math.max(1, rEff);

          this.drawArcArrows(ctx, center, rEff, angStart, angEnd, dir, selected);
        }
        curX = ex;
        curY = ey;
      }

      if (op.closed && segments.length > 0) {
        const off = this.calcLineOffset(curX, curY, startX, startY, corr, gw);
        const p1 = this.toCanvas(off.sx, off.sy);
        const p2 = this.toCanvas(off.ex, off.ey);
        this.drawSegmentArrows(ctx, p1, p2, selected);
      }
    }

    // ── PASS 4: Desenhar Nós (Pontos) ──────────────────────────
    curX = startX;
    curY = startY;
    for (const seg of segments) {
      const ex = App.getOpVal ? App.getOpVal(seg, 'endX', curX) : seg.endX;
      const ey = App.getOpVal ? App.getOpVal(seg, 'endY', curY) : seg.endY;
      const pt = this.toCanvas(ex, ey);
      this.drawPoint(ctx, pt.x, pt.y, opColor, 4);
      curX = ex;
      curY = ey;
    }

    // Ponto inicial da fresa: Quadrado verde com borda preta
    const startPt = this.toCanvas(startX, startY);
    if (this.showDirections) {
      this.drawStartPoint(ctx, startPt.x, startPt.y, 8);
    } else {
      this.drawPoint(ctx, startPt.x, startPt.y, opColor, 5);
    }
  },

  drawPoint(ctx, cx, cy, color, size = 3) {
    ctx.beginPath(); ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
  },

  drawArc(ctx, sx, sy, ex, ey, radius, direction, color) {
    const center = calcArcCenter(sx, sy, ex, ey, radius, direction);
    const angStart = Math.atan2(sy - center.y, sx - center.x);
    const angEnd = Math.atan2(ey - center.y, ex - center.x);
    this.drawArcWithCenter(ctx, center, radius, angStart, angEnd, direction, color);
  }
};

function var_accent() { return '#00b4d8'; }
