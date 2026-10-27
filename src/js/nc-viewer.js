// ╔═══════════════════════════════════════════════════════════════╗
// ║  NCViewer — Visualizador Operacional de G-Code com Mesa CNC ║
// ║  Mesa X=1850 (L) × Y=2750 (A) mm + Batente X0,Y0 Top-Left   ║
// ╚═══════════════════════════════════════════════════════════════╝

var NCViewer = {
  canvas: null,
  ctx: null,
  tableW: 1850, // Eixo X (L) — Comprimento (1850 mm)
  tableH: 2750, // Eixo Y (A) — Altura (2750 mm)
  gcodeText: '',
  fileName: 'Nenhum arquivo carregado',
  parsedData: null,
  
  // View & Camera
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  padding: 60,
  viewMode: '2d', // '2d' ou '3d'
  
  // Toggles
  showRapid: true,
  showDims: true,
  showTable: true,

  // 3D Motion state
  rotZ: Math.PI / 5,  // ~36 deg
  rotX: Math.PI / 5,  // ~36 deg
  zoom3D: 1.0,
  panX: 0,
  panY: 0,
  isDragging: false,
  lastMouseX: 0,
  lastMouseY: 0,

  // Simulation player
  currentStep: -1,
  isPlaying: false,
  playTimer: null,
  playSpeed: 50, // ms per move

  init() {
    this.canvas = document.getElementById('nc-viewer-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    
    this.setupEvents();
    this.resizeCanvas();
    this.draw();
  },

  setupEvents() {
    window.addEventListener('resize', () => this.resizeCanvas());

    if (!this.canvas) return;

    // Double click to reset view
    this.canvas.addEventListener('dblclick', () => this.resetView());

    // Drag & Drop NC File onto canvas
    this.canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.canvas.style.borderColor = 'var(--accent)';
    });

    this.canvas.addEventListener('dragleave', (e) => {
      e.preventDefault();
      this.canvas.style.borderColor = 'transparent';
    });

    this.canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      this.canvas.style.borderColor = 'transparent';
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.loadFile(e.dataTransfer.files[0]);
      }
    });

    // Mouse controls for 3D view
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.viewMode !== '3d') return;
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging || this.viewMode !== '3d') return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      
      this.rotZ += dx * 0.008;
      this.rotX = Math.max(0.05, Math.min(Math.PI / 2.2, this.rotX + dy * 0.008));
      
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.draw();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      if (this.viewMode === '3d') {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        this.zoom3D = Math.max(0.3, Math.min(3.0, this.zoom3D * factor));
        this.draw();
      }
    }, { passive: false });
  },

  resizeCanvas() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(rect.width) || 800;
    const h = Math.floor(rect.height) || 600;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.calcTransform();
    this.draw();
  },

  calcTransform() {
    if (!this.canvas) return;
    const cw = this.canvas.width / (window.devicePixelRatio || 1);
    const ch = this.canvas.height / (window.devicePixelRatio || 1);

    // Fit table (2750 x 1850 mm) into canvas
    const availableW = cw - this.padding * 2;
    const availableH = ch - this.padding * 2;

    const scaleX = availableW / this.tableW;
    const scaleY = availableH / this.tableH;
    this.scale = Math.min(scaleX, scaleY);

    // Center table on canvas
    this.offsetX = (cw - this.tableW * this.scale) / 2;
    this.offsetY = (ch - this.tableH * this.scale) / 2;
  },

  resetView() {
    this.rotZ = Math.PI / 5;
    this.rotX = Math.PI / 5;
    this.zoom3D = 1.0;
    this.calcTransform();
    this.draw();
  },

  // ── G-Code File Loader & Parsing ────────────────────────────

  loadFile(file) {
    if (!file) return;
    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.loadNCText(e.target.result, file.name);
    };
    reader.readAsText(file);
  },

  loadNCText(text, name = 'Plano_Nesting.NC') {
    this.gcodeText = text || '';
    this.fileName = name;
    this.parsedData = this.parseGCode(this.gcodeText);
    this.currentStep = this.parsedData ? this.parsedData.moves.length - 1 : -1;
    this.stopSimulation();
    this.updateInfoPanel();
    this.calcTransform();
    this.draw();
  },

  parseGCode(gcodeText) {
    if (!gcodeText) return null;
    const lines = gcodeText.split(/\r?\n/);

    const moves = [];
    const toolsUsed = new Set();
    
    let curX = 0, curY = 0, curZ = 25;
    let curMode = 'G00'; // G00, G01, G02, G03
    let curTool = 'T1';
    let curFeed = 4000;
    let distMode = 'G90'; // G90 (Absoluto) vs G91 (Incremental)

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let totalCutLen = 0;
    let totalRapidLen = 0;

    const trackBounds = (x, y, z) => {
      if (x !== null && !isNaN(x)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      if (y !== null && !isNaN(y)) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (z !== null && !isNaN(z)) {
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    };

    // Tenta detectar dimensões no nome do arquivo ou cabeçalho (ex: 1850x500 ou 1800x600)
    let pieceW = 0, pieceH = 0;
    const nameMatch = (this.fileName || '').match(/(\d+)\s*[xX×]\s*(\d+)/);
    if (nameMatch) {
      pieceW = parseFloat(nameMatch[1]);
      pieceH = parseFloat(nameMatch[2]);
    } else {
      const headerMatch = gcodeText.match(/\((?:PEÇA|CHAPA|PECA):\s*([\d.]+)\s*[xX×]\s*([\d.]+)/i);
      if (headerMatch) {
        pieceW = parseFloat(headerMatch[1]);
        pieceH = parseFloat(headerMatch[2]);
      }
    }

    lines.forEach((lineText, lineIdx) => {
      const cleanLine = lineText.replace(/\(.*\)/, '').trim().toUpperCase();
      if (!cleanLine) return;

      // Extract tool T...
      const tMatch = cleanLine.match(/T(\d+)/);
      if (tMatch) {
        curTool = `T${tMatch[1]}`;
        toolsUsed.add(curTool);
      }

      // Distance Mode
      if (cleanLine.includes('G90')) distMode = 'G90';
      if (cleanLine.includes('G91')) distMode = 'G91';

      // Motion Mode
      if (/\bG00?\b/.test(cleanLine)) curMode = 'G00';
      else if (/\bG01?\b/.test(cleanLine)) curMode = 'G01';
      else if (/\bG02?\b/.test(cleanLine)) curMode = 'G02';
      else if (/\bG03?\b/.test(cleanLine)) curMode = 'G03';

      // Feed rate F...
      const fMatch = cleanLine.match(/F([\d.]+)/);
      if (fMatch) curFeed = parseFloat(fMatch[1]);

      // Extract X, Y, Z, I, J, R
      const xMatch = cleanLine.match(/X([-\d.]+)/);
      const yMatch = cleanLine.match(/Y([-\d.]+)/);
      const zMatch = cleanLine.match(/Z([-\d.]+)/);
      const iMatch = cleanLine.match(/I([-\d.]+)/);
      const jMatch = cleanLine.match(/J([-\d.]+)/);
      const rMatch = cleanLine.match(/R([-\d.]+)/);

      let targetX = curX;
      let targetY = curY;
      let targetZ = curZ;
      let hasMove = false;

      if (xMatch) {
        const val = parseFloat(xMatch[1]);
        targetX = distMode === 'G90' ? val : curX + val;
        hasMove = true;
      }
      if (yMatch) {
        const val = parseFloat(yMatch[1]);
        targetY = distMode === 'G90' ? val : curY + val;
        hasMove = true;
      }
      if (zMatch) {
        const val = parseFloat(zMatch[1]);
        targetZ = distMode === 'G90' ? val : curZ + val;
        hasMove = true;
      }

      if (hasMove) {
        const startX = curX;
        const startY = curY;
        const startZ = curZ;

        const move = {
          type: curMode,
          startX, startY, startZ,
          endX: targetX, endY: targetY, endZ: targetZ,
          i: iMatch ? parseFloat(iMatch[1]) : 0,
          j: jMatch ? parseFloat(jMatch[1]) : 0,
          r: rMatch ? parseFloat(rMatch[1]) : 0,
          tool: curTool,
          feed: curFeed,
          lineIdx,
          lineText
        };

        const dx = targetX - startX;
        const dy = targetY - startY;
        const dz = targetZ - startZ;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Rastreia coordenadas em todos os movimentos
        trackBounds(startX, startY, startZ);
        trackBounds(targetX, targetY, targetZ);

        if (curMode === 'G00') {
          totalRapidLen += dist;
        } else if (curMode === 'G02' || curMode === 'G03') {
          const arcPts = this.getArcPoints(move, 32);
          let arcLen = 0;
          for (let pIdx = 0; pIdx < arcPts.length; pIdx++) {
            const pt = arcPts[pIdx];
            trackBounds(pt.x, pt.y, pt.z);
            if (pIdx > 0) {
              const prev = arcPts[pIdx - 1];
              arcLen += Math.hypot(pt.x - prev.x, pt.y - prev.y, pt.z - prev.z);
            }
          }
          totalCutLen += arcLen;
        } else {
          totalCutLen += dist;
        }

        moves.push(move);

        curX = targetX;
        curY = targetY;
        curZ = targetZ;
      }
    });

    if (minX === Infinity) { minX = 0; maxX = 0; }
    if (minY === Infinity) { minY = 0; maxY = 0; }
    if (minZ === Infinity) { minZ = 0; maxZ = 0; }

    const rawW = Math.max(0, maxX - minX);
    const rawH = Math.max(0, maxY - minY);

    const calcW = pieceW || (rawW > 0 ? (minX === 0 ? maxX : rawW) : 1800);
    const calcH = pieceH || (rawH > 0 ? (minY === 0 ? maxY : rawH) : 500);

    return {
      moves,
      toolsUsed: Array.from(toolsUsed),
      minX, maxX,
      minY, maxY,
      minZ, maxZ,
      pieceW: calcW,
      pieceH: calcH,
      width: calcW,
      height: calcH,
      totalCutLen: totalCutLen / 1000,   // Em metros
      totalRapidLen: totalRapidLen / 1000,
      lineCount: lines.length
    };
  },

  // ── Arc Interpolator Helper (G02 / G03) ──────────────────────
  
  getArcPoints(move, numSegments = 32) {
    const { startX, startY, startZ, endX, endY, endZ, i, j, r, type } = move;
    
    let cx, cy, radius;
    if (i !== 0 || j !== 0) {
      cx = startX + i;
      cy = startY + j;
      radius = Math.hypot(i, j);
    } else if (r !== 0) {
      const chord = Math.hypot(endX - startX, endY - startY);
      let R = Math.abs(r);
      if (R < chord / 2) R = chord / 2;
      const h = Math.sqrt(Math.max(0, R * R - (chord / 2) * (chord / 2)));
      const mx = (startX + endX) / 2;
      const my = (startY + endY) / 2;
      const perpX = chord > 0 ? (endY - startY) / chord : 0;
      const perpY = chord > 0 ? -(endX - startX) / chord : 0;
      
      const sign = (type === 'G02' ? 1 : -1) * (r > 0 ? 1 : -1);
      cx = mx + sign * h * perpX;
      cy = my + sign * h * perpY;
      radius = R;
    } else {
      return [{ x: startX, y: startY, z: startZ }, { x: endX, y: endY, z: endZ }];
    }

    const distStartEnd = Math.hypot(endX - startX, endY - startY);
    const isFullCircle = distStartEnd < 0.001;
    let startAngle = Math.atan2(startY - cy, startX - cx);
    let endAngle = Math.atan2(endY - cy, endX - cx);
    let deltaAngle;

    if (isFullCircle) {
      deltaAngle = (type === 'G02') ? -2 * Math.PI : 2 * Math.PI;
    } else {
      deltaAngle = endAngle - startAngle;
      if (type === 'G02') {
        while (deltaAngle >= 0) deltaAngle -= 2 * Math.PI;
      } else {
        while (deltaAngle <= 0) deltaAngle += 2 * Math.PI;
      }
    }

    const points = [];
    for (let s = 0; s <= numSegments; s++) {
      const t = s / numSegments;
      const angle = startAngle + deltaAngle * t;
      const px = cx + radius * Math.cos(angle);
      const py = cy + radius * Math.sin(angle);
      const pz = startZ + (endZ - startZ) * t;
      points.push({ x: px, y: py, z: pz });
    }

    return points;
  },

  // ── Coordinates Converter (Mesa X:1850 x Y:2750 mm) ─────────────
  // Origem (X0,Y0) fica no CANTO SUPERIOR DIREITO (Batente de Referência da Máquina)
  // X (L) cresce da DIREITA para a ESQUERDA (0 -> 1850 mm)
  // Y (A) cresce de CIMA para BAIXO (0 -> 2750 mm) no Canvas

  toCanvas2D(px, py) {
    return {
      x: this.offsetX + (this.tableW - px) * this.scale,
      y: this.offsetY + py * this.scale
    };
  },

  // ── 3D Isometric Projection ────────────────────────────────
  toCanvas3D(px, py, pz) {
    const cw = this.canvas.width / (window.devicePixelRatio || 1);
    const ch = this.canvas.height / (window.devicePixelRatio || 1);
    const cx = cw / 2 + this.panX;
    const cy = ch / 2 + this.panY + 40;

    // Centered coordinates relative to table center (X0 on Right, X1850 on Left)
    const relX = (this.tableW / 2 - px) * this.scale * this.zoom3D;
    const relY = (py - this.tableH / 2) * this.scale * this.zoom3D;
    const relZ = pz * this.scale * this.zoom3D * 1.8; // Z gain for visual clarity

    // Rotate around Z axis (Yaw)
    const cosZ = Math.cos(this.rotZ);
    const sinZ = Math.sin(this.rotZ);
    const rx1 = relX * cosZ - relY * sinZ;
    const ry1 = relX * sinZ + relY * cosZ;

    // Tilt around X axis (Pitch)
    const cosX = Math.cos(this.rotX);
    const sinX = Math.sin(this.rotX);
    const rx2 = rx1;
    const ry2 = ry1 * cosX - relZ * sinX;

    return {
      x: cx + rx2,
      y: cy + ry2
    };
  },

  // ── Main Drawing Dispatcher ─────────────────────────────────

  draw() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const cw = this.canvas.width / (window.devicePixelRatio || 1);
    const ch = this.canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, cw, ch);

    // Workspace background (Respeita Tema Dark / Light)
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.fillStyle = isLight ? '#f1f5f9' : '#0a0d14';
    ctx.fillRect(0, 0, cw, ch);

    if (this.viewMode === '2d') {
      this.draw2D(ctx);
    } else {
      this.draw3D(ctx);
    }
  },

  // ── 2D View Renderer ────────────────────────────────────────

  draw2D(ctx) {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const tableTL = this.toCanvas2D(this.tableW, 0); // Canto Superior Esquerdo do Canvas
    const tableDrawW = this.tableW * this.scale;
    const tableDrawH = this.tableH * this.scale;

    // 1. RENDERIZAR MESA CNC DE ALUMÍNIO (X:1850 x Y:2750 mm)
    if (this.showTable) {
      // Fundo da Mesa CNC
      ctx.fillStyle = isLight ? '#ffffff' : '#121722';
      ctx.fillRect(tableTL.x, tableTL.y, tableDrawW, tableDrawH);

      // Grade de Vácuo / Ranhuras da Mesa
      ctx.save();
      ctx.strokeStyle = isLight ? 'rgba(203, 213, 225, 0.7)' : 'rgba(0, 180, 216, 0.08)';
      ctx.lineWidth = 1;
      
      const gridX = 250; // mm
      const gridY = 250;
      for (let x = gridX; x < this.tableW; x += gridX) {
        const p1 = { x: tableTL.x + x * this.scale, y: tableTL.y };
        const p2 = { x: tableTL.x + x * this.scale, y: tableTL.y + tableDrawH };
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
      for (let y = gridY; y < this.tableH; y += gridY) {
        const p1 = { x: tableTL.x, y: tableTL.y + y * this.scale };
        const p2 = { x: tableTL.x + tableDrawW, y: tableTL.y + y * this.scale };
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
      ctx.restore();

      // Borda da Mesa
      ctx.strokeStyle = isLight ? '#cbd5e1' : '#242c42';
      ctx.lineWidth = 2;
      ctx.strokeRect(tableTL.x, tableTL.y, tableDrawW, tableDrawH);

      // Título da Mesa
      ctx.font = `600 12px 'JetBrains Mono', monospace`;
      ctx.fillStyle = isLight ? '#64748b' : 'rgba(140, 150, 172, 0.6)';
      ctx.textAlign = 'left';
      ctx.fillText(`MESA DE USINAGEM CNC (X: ${this.tableW} mm × Y: ${this.tableH} mm)`, tableTL.x + 15, tableTL.y + tableDrawH - 15);
    }

    // 2. RENDERIZAR BATENTES DE REFERÊNCIA (X0, Y0) NO CANTO SUPERIOR DIREITO
    this.drawBatentesX0Y0_2D(ctx, tableTL);

    // 3. RENDERIZAR CHAPA / BOUNDING BOX E TOOLPATHS DO ARQUIVO NC
    if (this.parsedData && this.parsedData.moves.length > 0) {
      this.drawWorkpieceAndToolpaths2D(ctx);
    } else {
      // Mensagem de instrução quando nenhum arquivo NC foi carregado
      ctx.font = `500 13px 'Inter', sans-serif`;
      ctx.fillStyle = 'rgba(230, 235, 245, 0.4)';
      ctx.textAlign = 'center';
      ctx.fillText('📁 Arraste um arquivo .NC aqui ou clique em "Abrir Arquivo .NC"', tableTL.x + tableDrawW / 2, tableTL.y + tableDrawH / 2);
    }
  },

  // ── Renderizador do Batente (Canto Superior Direito / Vermelho) ──

  drawBatentesX0Y0_2D(ctx, tableTL) {
    ctx.save();

    const tableDrawW = this.tableW * this.scale;

    // 1. Destaque em Caixa Vermelha no Canto Superior Direito
    const boxW = Math.min(220, tableDrawW * 0.2);
    const boxH = Math.min(180, this.tableH * this.scale * 0.15);
    const boxX = tableTL.x + tableDrawW - boxW;
    const boxY = tableTL.y;

    ctx.fillStyle = 'rgba(255, 82, 82, 0.08)';
    ctx.fillRect(boxX, boxY, boxW, boxH);

    ctx.strokeStyle = '#ff5252';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.setLineDash([]);

    // 2. Pinos do Batente Físico Pneumático no Canto Superior Direito
    // Afastados pelo raio para ficarem tangentes/encostados por fora da borda da mesa
    const pinRadius = 7;
    const pinColor = '#ff5252';

    // 1 Batente em X: Afastado 70mm do eixo 0 (no topo, tangenciando a borda superior)
    const ptX70 = this.toCanvas2D(70, 0);
    const pinTop1 = { x: ptX70.x, y: ptX70.y - pinRadius };

    // 2 Batentes em Y: Afastados 70mm e 140mm do eixo 0 (na lateral direita, tangenciando a borda direita)
    const ptY70 = this.toCanvas2D(0, 70);
    const pinSide1 = { x: ptY70.x + pinRadius, y: ptY70.y };

    const ptY140 = this.toCanvas2D(0, 140);
    const pinSide2 = { x: ptY140.x + pinRadius, y: ptY140.y };

    const drawPin = (pt) => {
      ctx.fillStyle = pinColor;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pinRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    drawPin(pinTop1);
    drawPin(pinSide1);
    drawPin(pinSide2);

    // 3. Rótulo de Instrução Operacional X0 Y0
    ctx.font = `700 11px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#ff5252';
    ctx.textAlign = 'right';
    ctx.fillText('🔴 BATENTE DE REFERÊNCIA (X0, Y0)', tableTL.x + tableDrawW - 12, tableTL.y + 24);

    ctx.font = `600 10px 'Inter', sans-serif`;
    ctx.fillStyle = '#ff8a8a';
    ctx.fillText('📌 1 pino X (70mm) · 2 pinos Y (70mm e 140mm)', tableTL.x + tableDrawW - 12, tableTL.y + 40);

    // Seta orientadora de posição do operador (apontando para o canto superior direito)
    ctx.strokeStyle = '#ff5252';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tableTL.x + tableDrawW - 45, tableTL.y + 55);
    ctx.lineTo(tableTL.x + tableDrawW - 15, tableTL.y + 55);
    ctx.lineTo(tableTL.x + tableDrawW - 22, tableTL.y + 50);
    ctx.moveTo(tableTL.x + tableDrawW - 15, tableTL.y + 55);
    ctx.lineTo(tableTL.x + tableDrawW - 22, tableTL.y + 60);
    ctx.stroke();

    ctx.restore();
  },

  // ── Renderizador de Peça & Usinagens (2D) ───────────────────

  drawWorkpieceAndToolpaths2D(ctx) {
    const data = this.parsedData;
    const moves = data.moves;

    const activeMovesCount = this.currentStep >= 0 ? Math.min(moves.length, this.currentStep + 1) : moves.length;

    // 1. CHAPA DA PEÇA (MELAMINA BRANCA SOBRE A MESA)
    const pieceW = data.pieceW || (data.width > 0 ? data.width : 1800);
    const pieceH = data.pieceH || (data.height > 0 ? data.height : 500);

    const pMin = this.toCanvas2D(pieceW, 0);
    const pW = pieceW * this.scale;
    const pH = pieceH * this.scale;

    // Corpo da peça em MDF
    ctx.save();
    ctx.fillStyle = 'rgba(245, 247, 250, 0.95)';
    ctx.fillRect(pMin.x, pMin.y, pW, pH);

    ctx.strokeStyle = '#00b4d8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pMin.x, pMin.y, pW, pH);

    // Texto da peça
    ctx.font = `700 11px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'right';
    ctx.fillText(`PEÇA: L(X): ${pieceW.toFixed(1)} × A(Y): ${pieceH.toFixed(1)} mm`, pMin.x + pW - 8, pMin.y + 18);
    ctx.restore();

    // 2. DESENHO DAS USINAGENS (TOOLPATHS)
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < activeMovesCount; i++) {
      const m = moves[i];
      const p1 = this.toCanvas2D(m.startX, m.startY);
      const p2 = this.toCanvas2D(m.endX, m.endY);

      if (m.type === 'G00') {
        if (this.showRapid) {
          ctx.strokeStyle = 'rgba(255, 82, 82, 0.6)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else if (m.type === 'G01') {
        const isThrough = m.endZ <= 0.5;
        ctx.strokeStyle = isThrough ? '#ff7043' : '#00e676';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        this.drawSegmentArrows(ctx, p1, p2, '#ffffff');

        const prevMove = i > 0 ? moves[i - 1] : null;
        if (!prevMove || prevMove.type === 'G00') {
          this.drawStartPoint(ctx, p1.x, p1.y, 8);
        }
      } else if (m.type === 'G02' || m.type === 'G03') {
        const isThrough = m.endZ <= 0.5;
        ctx.strokeStyle = isThrough ? '#ff7043' : '#00e676';
        ctx.lineWidth = 1.8;

        const arcPts = this.getArcPoints(m, 32);
        ctx.beginPath();
        arcPts.forEach((pt, pIdx) => {
          const cpt = this.toCanvas2D(pt.x, pt.y);
          if (pIdx === 0) ctx.moveTo(cpt.x, cpt.y);
          else ctx.lineTo(cpt.x, cpt.y);
        });
        ctx.stroke();

        if (arcPts.length >= 2) {
          const midIdx = Math.floor(arcPts.length / 2);
          const pMid1 = this.toCanvas2D(arcPts[midIdx - 1].x, arcPts[midIdx - 1].y);
          const pMid2 = this.toCanvas2D(arcPts[midIdx].x, arcPts[midIdx].y);
          const arcAngle = Math.atan2(pMid2.y - pMid1.y, pMid2.x - pMid1.x);
          this.drawDirectionArrow(ctx, pMid2.x, pMid2.y, arcAngle, 7, '#ffffff');
        }

        const prevMove = i > 0 ? moves[i - 1] : null;
        if (!prevMove || prevMove.type === 'G00') {
          this.drawStartPoint(ctx, p1.x, p1.y, 8);
        }
      }
    }
    ctx.restore();

    // 3. CURSOR DA FERRAMENTA / SPINDLE NA SIMULAÇÃO
    if (activeMovesCount > 0) {
      const lastMove = moves[activeMovesCount - 1];
      const toolPt = this.toCanvas2D(lastMove.endX, lastMove.endY);

      ctx.save();
      ctx.fillStyle = '#ffd600';
      ctx.beginPath();
      ctx.arc(toolPt.x, toolPt.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = `600 10px 'JetBrains Mono', monospace`;
      ctx.fillStyle = '#ffd600';
      ctx.textAlign = 'left';
      ctx.fillText(` ⚙️ ${lastMove.tool} (X:${lastMove.endX.toFixed(1)} Y:${lastMove.endY.toFixed(1)} Z:${lastMove.endZ.toFixed(1)})`, toolPt.x + 10, toolPt.y + 4);
      ctx.restore();
    }

    // 4. LINHAS DE COTA E DIMENSÕES
    if (this.showDims) {
      this.drawDimensions2D(ctx, data);
    }
  },

  // ── Cotas e Linhas de Dimensão 2D ───────────────────────────

  drawDimensions2D(ctx, data) {
    ctx.save();
    ctx.font = `600 10px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#00b4d8';
    ctx.strokeStyle = '#00b4d8';
    ctx.lineWidth = 1;

    const pieceW = data.pieceW || (data.width > 0 ? data.width : 1800);
    const pieceH = data.pieceH || (data.height > 0 ? data.height : 500);
    const pMin = this.toCanvas2D(pieceW, 0);
    const pW = pieceW * this.scale;
    const pH = pieceH * this.scale;

    // Cota Superior (horizontal) -> representa Eixo L (X)
    const dimY = pMin.y - 12;
    ctx.beginPath();
    ctx.moveTo(pMin.x, dimY); ctx.lineTo(pMin.x + pW, dimY);
    ctx.moveTo(pMin.x, dimY - 4); ctx.lineTo(pMin.x, dimY + 4);
    ctx.moveTo(pMin.x + pW, dimY - 4); ctx.lineTo(pMin.x + pW, dimY + 4);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillText(`L (X): ${pieceW.toFixed(1)} mm`, pMin.x + pW / 2, dimY - 4);

    // Cota Direita (vertical) -> representa Eixo A (Y) no lado do batente direito
    const dimX = pMin.x + pW + 12;
    ctx.beginPath();
    ctx.moveTo(dimX, pMin.y); ctx.lineTo(dimX, pMin.y + pH);
    ctx.moveTo(dimX - 4, pMin.y); ctx.lineTo(dimX + 4, pMin.y);
    ctx.moveTo(dimX - 4, pMin.y + pH); ctx.lineTo(dimX + 4, pMin.y + pH);
    ctx.stroke();

    ctx.save();
    ctx.translate(dimX + 14, pMin.y + pH / 2);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(`A (Y): ${pieceH.toFixed(1)} mm`, 0, 0);
    ctx.restore();

    ctx.restore();
  },

  // ── 3D Isometric View Renderer ──────────────────────────────

  draw3D(ctx) {
    // Render Machine Table 3D Plate
    const t00 = this.toCanvas3D(0, 0, 0);
    const tW0 = this.toCanvas3D(this.tableW, 0, 0);
    const tWH = this.toCanvas3D(this.tableW, this.tableH, 0);
    const t0H = this.toCanvas3D(0, this.tableH, 0);

    // Mesa de Usinagem 3D
    ctx.fillStyle = 'rgba(18, 23, 34, 0.95)';
    ctx.beginPath();
    ctx.moveTo(t00.x, t00.y);
    ctx.lineTo(tW0.x, tW0.y);
    ctx.lineTo(tWH.x, tWH.y);
    ctx.lineTo(t0H.x, t0H.y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#242c42';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Batente Vermelho X0 Y0 3D (Canto Superior Direito)
    // 1 pino em X (70mm) e 2 pinos em Y (70mm e 140mm)
    const bPin1 = this.toCanvas3D(70, 0, 15);
    const bPin2 = this.toCanvas3D(0, 70, 15);
    const bPin3 = this.toCanvas3D(0, 140, 15);

    [bPin1, bPin2, bPin3].forEach(pt => {
      ctx.fillStyle = '#ff5252';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.font = `700 11px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#ff5252';
    ctx.textAlign = 'left';
    ctx.fillText('🔴 BATENTE X0 Y0', bPin1.x + 10, bPin1.y - 15);

    // Render Workpiece 3D Box & Toolpaths
    if (this.parsedData && this.parsedData.moves.length > 0) {
      const data = this.parsedData;
      const moves = data.moves;

      // Workpiece Base 3D
      const p00 = this.toCanvas3D(data.minX, data.minY, 0);
      const pW0 = this.toCanvas3D(data.maxX, data.minY, 0);
      const pWH = this.toCanvas3D(data.maxX, data.maxY, 0);
      const p0H = this.toCanvas3D(data.minX, data.maxY, 0);

      ctx.fillStyle = 'rgba(245, 247, 250, 0.85)';
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(pW0.x, pW0.y);
      ctx.lineTo(pWH.x, pWH.y);
      ctx.lineTo(p0H.x, p0H.y);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#00b4d8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Toolpaths in 3D
      const activeCount = this.currentStep >= 0 ? Math.min(moves.length, this.currentStep + 1) : moves.length;
      for (let i = 0; i < activeCount; i++) {
        const m = moves[i];
        const p1 = this.toCanvas3D(m.startX, m.startY, m.startZ);
        const p2 = this.toCanvas3D(m.endX, m.endY, m.endZ);

        if (m.type === 'G00') {
          if (this.showRapid) {
            ctx.strokeStyle = 'rgba(255, 82, 82, 0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
          }
        } else if (m.type === 'G01') {
          const isThrough = m.endZ <= 0.5;
          ctx.strokeStyle = isThrough ? '#ff7043' : '#00e676';
          ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        } else if (m.type === 'G02' || m.type === 'G03') {
          const isThrough = m.endZ <= 0.5;
          ctx.strokeStyle = isThrough ? '#ff7043' : '#00e676';
          ctx.lineWidth = 1.8;
          const arcPts = this.getArcPoints(m, 32);
          ctx.beginPath();
          arcPts.forEach((pt, pIdx) => {
            const cpt = this.toCanvas3D(pt.x, pt.y, pt.z);
            if (pIdx === 0) ctx.moveTo(cpt.x, cpt.y);
            else ctx.lineTo(cpt.x, cpt.y);
          });
          ctx.stroke();
        }
      }
    }
  },

  // ── Info Panel Updates ──────────────────────────────────────

  updateInfoPanel() {
    const filenameEl = document.getElementById('nc-info-filename');
    const dimsEl = document.getElementById('nc-info-dims');
    const cutLenEl = document.getElementById('nc-info-cutlen');
    const toolsEl = document.getElementById('nc-info-tools');
    const sliderEl = document.getElementById('nc-sim-slider');
    const codeListEl = document.getElementById('nc-code-preview');

    if (filenameEl) filenameEl.textContent = this.fileName;

    if (!this.parsedData) {
      if (dimsEl) dimsEl.textContent = '-';
      if (cutLenEl) cutLenEl.textContent = '-';
      if (toolsEl) toolsEl.textContent = '-';
      if (codeListEl) codeListEl.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">Nenhum código G carregado.</div>';
      return;
    }

    const data = this.parsedData;
    if (dimsEl) dimsEl.textContent = `L(X): ${data.width.toFixed(1)} × A(Y): ${data.height.toFixed(1)} mm (Z máx: ${data.minZ.toFixed(1)}mm)`;
    if (cutLenEl) cutLenEl.textContent = `${data.totalCutLen.toFixed(2)} m (Rápido: ${data.totalRapidLen.toFixed(2)}m)`;
    if (toolsEl) toolsEl.textContent = data.toolsUsed.join(', ') || 'T1';

    if (sliderEl) {
      sliderEl.max = Math.max(0, data.moves.length - 1);
      sliderEl.value = this.currentStep >= 0 ? this.currentStep : data.moves.length - 1;
    }

    this.renderCodePreview();
  },

  renderCodePreview() {
    const container = document.getElementById('nc-code-preview');
    if (!container || !this.parsedData) return;

    const moves = this.parsedData.moves;
    if (moves.length === 0) return;

    let html = '';
    const startIdx = Math.max(0, (this.currentStep >= 0 ? this.currentStep : moves.length - 1) - 15);
    const endIdx = Math.min(moves.length - 1, startIdx + 30);

    for (let i = startIdx; i <= endIdx; i++) {
      const m = moves[i];
      const isActive = i === this.currentStep;
      html += `
        <div class="nc-code-line ${isActive ? 'active' : ''}" onclick="NCViewer.jumpToStep(${i})">
          <span style="color: #666; width: 35px; display: inline-block;">${m.lineIdx + 1}</span>
          <span>${m.lineText}</span>
        </div>
      `;
    }
    container.innerHTML = html;
  },

  jumpToStep(stepIndex) {
    if (!this.parsedData) return;
    this.currentStep = Math.max(0, Math.min(this.parsedData.moves.length - 1, stepIndex));
    this.updateInfoPanel();
    this.draw();
  },

  onSliderChange(val) {
    this.jumpToStep(parseInt(val));
  },

  // ── Simulation Player ───────────────────────────────────────

  togglePlay() {
    if (this.isPlaying) {
      this.stopSimulation();
    } else {
      this.startSimulation();
    }
  },

  startSimulation() {
    if (!this.parsedData || this.parsedData.moves.length === 0) return;
    this.isPlaying = true;
    const btn = document.getElementById('nc-play-btn');
    if (btn) btn.textContent = '⏸️ Pausar';

    if (this.currentStep >= this.parsedData.moves.length - 1) {
      this.currentStep = 0;
    }

    this.playTimer = setInterval(() => {
      if (this.currentStep < this.parsedData.moves.length - 1) {
        this.currentStep++;
        this.updateInfoPanel();
        this.draw();
      } else {
        this.stopSimulation();
      }
    }, this.playSpeed);
  },

  stopSimulation() {
    this.isPlaying = false;
    if (this.playTimer) clearInterval(this.playTimer);
    const btn = document.getElementById('nc-play-btn');
    if (btn) btn.textContent = '▶️ Simular';
  },

  toggleViewMode(mode) {
    this.viewMode = mode;
    this.calcTransform();
    this.draw();
  },

  toggleRapid() {
    this.showRapid = !this.showRapid;
    this.draw();
  },

  toggleDims() {
    this.showDims = !this.showDims;
    this.draw();
  },

  toggleTable() {
    this.showTable = !this.showTable;
    this.draw();
  },

  drawStartPoint(ctx, x, y, size = 8) {
    ctx.save();
    const half = size / 2;
    ctx.fillStyle = '#00e676';
    ctx.fillRect(x - half, y - half, size, size);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - half, y - half, size, size);
    ctx.restore();
  },

  drawDirectionArrow(ctx, x, y, angle, length = 7, color = '#ffffff') {
    ctx.save();
    const wingAngle = Math.PI * 0.82;
    ctx.beginPath();
    ctx.moveTo(x + (length + 0.6) * Math.cos(angle + wingAngle), y + (length + 0.6) * Math.sin(angle + wingAngle));
    ctx.lineTo(x + 0.6 * Math.cos(angle), y + 0.6 * Math.sin(angle));
    ctx.lineTo(x + (length + 0.6) * Math.cos(angle - wingAngle), y + (length + 0.6) * Math.sin(angle - wingAngle));
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + length * Math.cos(angle + wingAngle), y + length * Math.sin(angle + wingAngle));
    ctx.lineTo(x, y);
    ctx.lineTo(x + length * Math.cos(angle - wingAngle), y + length * Math.sin(angle - wingAngle));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  },

  drawSegmentArrows(ctx, p1, p2, color = '#ffffff', spacing = 45) {
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
      this.drawDirectionArrow(ctx, ax, ay, angle, 7, color);
    }
  }
};
