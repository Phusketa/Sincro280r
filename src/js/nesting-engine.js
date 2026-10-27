// ╔═══════════════════════════════════════════════════════════════╗
// ║  NestingEngine — Algoritmo de Plano de Corte 2D + G-Code     ║
// ╚═══════════════════════════════════════════════════════════════╝

var NestingEngine = {
  canvas: null,
  ctx: null,
  sheetW: 1850,
  sheetH: 2750,
  extraGap: 2,          // Folga padrão (mm)
  extraCutDepth: 0.3,     // Sobrecorte extra passante na mesa de sacrifício (mm)
  selectedToolId: null,
  placedPieces: [],     // [{ piece, x, y, w, h, rotated }]
  scale: 1,
  offsetX: 0,
  offsetY: 0,

  init() {
    this.canvas = document.getElementById('nesting-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.setupEvents();
    this.resizeCanvas();
  },

  setupEvents() {
    window.addEventListener('resize', () => this.resizeCanvas());
    if (this.canvas) {
      this.canvas.addEventListener('dblclick', () => this.resetView());
    }
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
    const padding = 40;

    const scaleX = (cw - padding * 2) / this.sheetW;
    const scaleY = (ch - padding * 2) / this.sheetH;
    this.scale = Math.min(scaleX, scaleY);

    this.offsetX = (cw - this.sheetW * this.scale) / 2;
    this.offsetY = (ch - this.sheetH * this.scale) / 2;
  },

  resetView() {
    this.calcTransform();
    this.draw();
  },

  toCanvas(px, py) {
    return {
      x: this.offsetX + px * this.scale,
      y: this.offsetY + (this.sheetH - py) * this.scale
    };
  },

  // ── Context Expression Evaluator for Pieces ─────────────────

  getPieceOpVal(op, key, piece, fallback = 0) {
    if (!op || !piece) return fallback;
    const rawKey = 'raw' + key.charAt(0).toUpperCase() + key.slice(1);
    const val = op[rawKey] !== undefined ? op[rawKey] : op[key];
    if (val === undefined || val === null) return fallback;

    const num = Number(val);
    if (!isNaN(num)) return num;

    const ctx = {
      L: piece.width,
      A: piece.height,
      E: piece.depth,
      ...(piece.customVariables || {})
    };
    return App.evalExprRaw ? App.evalExprRaw(val, ctx) : fallback;
  },

  // ── Organic Bounding Box Calculator ──────────────────────────

  isOrganicContourOp(o) {
    if (!o || o.type === 'park') return false;
    if (!o.isOrganicContour) return false;
    return o.type === 'circle' || o.type === 'rect' || (o.type === 'path' && !!o.closed);
  },

  getArcExtrema(curX, curY, ex, ey, radius, direction) {
    const pts = [{ x: curX, y: curY }, { x: ex, y: ey }];
    try {
      const center = calcArcCenter(curX, curY, ex, ey, radius, direction);
      let aStart = Math.atan2(curY - center.y, curX - center.x);
      let aEnd = Math.atan2(ey - center.y, ex - center.x);

      const isCW = direction === 'cw' || direction === 'cw180';
      if (isCW && aEnd > aStart) aEnd -= Math.PI * 2;
      if (!isCW && aEnd < aStart) aEnd += Math.PI * 2;

      const minAng = Math.min(aStart, aEnd);
      const maxAng = Math.max(aStart, aEnd);

      for (let k = -4; k <= 4; k++) {
        const card = k * (Math.PI / 2);
        if (card >= minAng && card <= maxAng) {
          pts.push({
            x: center.x + radius * Math.cos(card),
            y: center.y + radius * Math.sin(card)
          });
        }
      }
    } catch (e) {}
    return pts;
  },

  getPieceBounds(p) {
    const isOrganic = !!p.isOrganic || (p.operations && p.operations.some(o => this.isOrganicContourOp(o)));

    if (!isOrganic || !p.operations || p.operations.length === 0) {
      return {
        w: p.width,
        h: p.height,
        shiftX: 0,
        shiftY: 0,
        isOrganic: false
      };
    }

    let contourOps = p.operations.filter(o => this.isOrganicContourOp(o));
    if (contourOps.length === 0) {
      contourOps = p.operations.filter(o => o.type !== 'park' && (o.type === 'circle' || o.type === 'rect' || (o.type === 'path' && !!o.closed)));
    }

    if (contourOps.length === 0) {
      return {
        w: p.width,
        h: p.height,
        shiftX: 0,
        shiftY: 0,
        isOrganic: true
      };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    contourOps.forEach(op => {
      if (op.type === 'circle') {
        const cx = this.getPieceOpVal(op, 'centerX', p, 0);
        const cy = this.getPieceOpVal(op, 'centerY', p, 0);
        const r = this.getPieceOpVal(op, 'radius', p, 50);
        minX = Math.min(minX, cx - r);
        maxX = Math.max(maxX, cx + r);
        minY = Math.min(minY, cy - r);
        maxY = Math.max(maxY, cy + r);
      } else if (op.type === 'rect') {
        const rx = this.getPieceOpVal(op, 'x', p, 0);
        const ry = this.getPieceOpVal(op, 'y', p, 0);
        const rl = this.getPieceOpVal(op, 'length', p, 100);
        const rw = this.getPieceOpVal(op, 'width', p, 100);
        minX = Math.min(minX, rx);
        maxX = Math.max(maxX, rx + rl);
        minY = Math.min(minY, ry);
        maxY = Math.max(maxY, ry + rw);
      } else if (op.type === 'line') {
        const sx = this.getPieceOpVal(op, 'startX', p, 0);
        const sy = this.getPieceOpVal(op, 'startY', p, 0);
        const ex = this.getPieceOpVal(op, 'endX', p, 100);
        const ey = this.getPieceOpVal(op, 'endY', p, 0);
        minX = Math.min(minX, sx, ex);
        maxX = Math.max(maxX, sx, ex);
        minY = Math.min(minY, sy, ey);
        maxY = Math.max(maxY, sy, ey);
      } else if (op.type === 'curve') {
        const sx = this.getPieceOpVal(op, 'startX', p, 0);
        const sy = this.getPieceOpVal(op, 'startY', p, 0);
        const ex = this.getPieceOpVal(op, 'endX', p, 100);
        const ey = this.getPieceOpVal(op, 'endY', p, 100);
        const r = this.getPieceOpVal(op, 'radius', p, 50);
        const dir = op.curveDirection || 'cw';

        const pts = this.getArcExtrema(sx, sy, ex, ey, r, dir);
        pts.forEach(pt => {
          minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
          minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
        });
      } else if (op.type === 'path') {
        const sx = this.getPieceOpVal(op, 'startX', p, op.startPoint?.x || 0);
        const sy = this.getPieceOpVal(op, 'startY', p, op.startPoint?.y || 0);
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);

        let curX = sx;
        let curY = sy;

        (op.segments || []).forEach(seg => {
          const ex = this.getPieceOpVal(seg, 'endX', p, seg.endX !== undefined ? seg.endX : curX);
          const ey = this.getPieceOpVal(seg, 'endY', p, seg.endY !== undefined ? seg.endY : curY);

          if (seg.type === 'line') {
            minX = Math.min(minX, ex); maxX = Math.max(maxX, ex);
            minY = Math.min(minY, ey); maxY = Math.max(maxY, ey);
          } else if (seg.type === 'curve') {
            const r = this.getPieceOpVal(seg, 'radius', p, seg.radius || 50);
            const dir = seg.curveDirection || 'cw';
            const pts = this.getArcExtrema(curX, curY, ex, ey, r, dir);
            pts.forEach(pt => {
              minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
              minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
            });
          }
          curX = ex;
          curY = ey;
        });
      }
    });

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return {
        w: p.width,
        h: p.height,
        shiftX: 0,
        shiftY: 0,
        isOrganic: true
      };
    }

    const organicW = Math.max(1, maxX - minX);
    const organicH = Math.max(1, maxY - minY);

    return {
      w: Math.round(organicW * 100) / 100,
      h: Math.round(organicH * 100) / 100,
      shiftX: Math.round(minX * 100) / 100,
      shiftY: Math.round(minY * 100) / 100,
      isOrganic: true
    };
  },

  // ── Operation Coordinate Transformer for Nesting ────────────

  transformOpForPlacedPiece(op, placed) {
    const p = placed.piece;
    const rot = placed.rotated;
    const px = placed.x;
    const py = placed.y;

    const depth = this.getPieceOpVal(op, 'depth', p, 5);
    const grooveWidth = this.getPieceOpVal(op, 'grooveWidth', p, 6);
    const correction = op.correction || 'meio';

    const res = {
      type: op.type,
      correction: correction,
      depth: depth,
      grooveWidth: grooveWidth,
      toolId: op.toolId,
      isOrganicContour: !!op.isOrganicContour
    };

    const mapPoint = (lx, ly) => {
      const shiftX = placed.shiftX || 0;
      const shiftY = placed.shiftY || 0;
      const relX = lx - shiftX;
      const relY = ly - shiftY;
      const organicW = placed.organicW || p.width;

      if (!rot) {
        return { x: px + relX, y: py + relY };
      } else {
        return { x: px + relY, y: py + (organicW - relX) };
      }
    };

    if (op.type === 'line') {
      const sx = this.getPieceOpVal(op, 'startX', p, 0);
      const sy = this.getPieceOpVal(op, 'startY', p, 0);
      const ex = this.getPieceOpVal(op, 'endX', p, 100);
      const ey = this.getPieceOpVal(op, 'endY', p, 0);

      const pt1 = mapPoint(sx, sy);
      const pt2 = mapPoint(ex, ey);
      res.startX = pt1.x; res.startY = pt1.y;
      res.endX = pt2.x; res.endY = pt2.y;
    } else if (op.type === 'rect') {
      const rx = this.getPieceOpVal(op, 'x', p, 0);
      const ry = this.getPieceOpVal(op, 'y', p, 0);
      const rl = this.getPieceOpVal(op, 'length', p, 100);
      const rw = this.getPieceOpVal(op, 'width', p, 100);
      const cr = this.getPieceOpVal(op, 'cornerRadius', p, 0);

      if (!rot) {
        const pt = mapPoint(rx, ry);
        res.x = pt.x;
        res.y = pt.y;
        res.length = Math.min(rl, p.width - rx);
        res.width = Math.min(rw, p.height - ry);
        res.cornerRadius = cr;
      } else {
        res.x = px + (ry - (placed.shiftY || 0));
        res.y = py + (placed.organicW || p.width) - ((rx - (placed.shiftX || 0)) + rl);
        res.length = rw;
        res.width = rl;
        res.cornerRadius = cr;
      }
    } else if (op.type === 'circle') {
      const cx = this.getPieceOpVal(op, 'centerX', p, 0);
      const cy = this.getPieceOpVal(op, 'centerY', p, 0);
      const r = this.getPieceOpVal(op, 'radius', p, 50);

      const pt = mapPoint(cx, cy);
      res.centerX = pt.x;
      res.centerY = pt.y;
      res.radius = r;
      res.isPocket = op.isPocket;
    } else if (op.type === 'curve') {
      const sx = this.getPieceOpVal(op, 'startX', p, 0);
      const sy = this.getPieceOpVal(op, 'startY', p, 0);
      const ex = this.getPieceOpVal(op, 'endX', p, 100);
      const ey = this.getPieceOpVal(op, 'endY', p, 100);
      const radius = this.getPieceOpVal(op, 'radius', p, 50);

      const pt1 = mapPoint(sx, sy);
      const pt2 = mapPoint(ex, ey);
      res.startX = pt1.x; res.startY = pt1.y;
      res.endX = pt2.x; res.endY = pt2.y;
      res.radius = radius;
      res.curveDirection = rot ? (op.curveDirection === 'cw' ? 'ccw' : 'cw') : op.curveDirection;
    } else if (op.type === 'path') {
      res.closed = op.closed;
      const startX = this.getPieceOpVal(op, 'startX', p, op.startPoint?.x || 0);
      const startY = this.getPieceOpVal(op, 'startY', p, op.startPoint?.y || 0);
      res.startPoint = mapPoint(startX, startY);

      let curX = startX;
      let curY = startY;

      res.segments = (op.segments || []).map(seg => {
        const ex = this.getPieceOpVal(seg, 'endX', p, seg.endX !== undefined ? seg.endX : curX);
        const ey = this.getPieceOpVal(seg, 'endY', p, seg.endY !== undefined ? seg.endY : curY);
        const endPt = mapPoint(ex, ey);

        const segCopy = {
          type: seg.type,
          endX: endPt.x,
          endY: endPt.y
        };

        if (seg.type === 'curve') {
          segCopy.radius = this.getPieceOpVal(seg, 'radius', p, seg.radius || 50);
          segCopy.curveDirection = rot ? (seg.curveDirection === 'cw' ? 'ccw' : 'cw') : seg.curveDirection;
        }

        curX = ex;
        curY = ey;
        return segCopy;
      });
    } else if (op.type === 'drill') {
      const origHoles = (typeof PieceEditor !== 'undefined' && PieceEditor.getDrillHoles) ? PieceEditor.getDrillHoles(op, p.width, p.height) : [{ x: op.x || 0, y: op.y || 0 }];
      res.holes = origHoles.map(h => mapPoint(h.x, h.y));
      res.diameter = this.getPieceOpVal(op, 'diameter', p, op.diameter || 8);
    }

    return res;
  },

  // ── True-Shape Organic Profile Sampler ──────────────────────

  getPieceProfiles(p, numSamples = 100) {
    const bounds = this.getPieceBounds(p);
    const w = bounds.w;
    const h = bounds.h;
    const shiftX = bounds.shiftX;
    const shiftY = bounds.shiftY;

    if (!bounds.isOrganic || !p.operations || p.operations.length === 0) {
      return {
        w,
        h,
        shiftX: 0,
        shiftY: 0,
        isOrganic: false,
        bottomProfile: new Array(numSamples).fill(0),
        topProfile: new Array(numSamples).fill(h)
      };
    }

    const contourOps = p.operations.filter(o => this.isOrganicContourOp(o));
    const targetOps = contourOps.length > 0 ? contourOps : p.operations.filter(o => o.type !== 'park' && (o.type === 'circle' || o.type === 'rect' || (o.type === 'path' && !!o.closed)));

    if (targetOps.length === 0) {
      return {
        w,
        h,
        shiftX: 0,
        shiftY: 0,
        isOrganic: true,
        bottomProfile: new Array(numSamples).fill(0),
        topProfile: new Array(numSamples).fill(h)
      };
    }

    const pts = [];

    targetOps.forEach(op => {
      if (op.type === 'circle') {
        const cx = this.getPieceOpVal(op, 'centerX', p, 0);
        const cy = this.getPieceOpVal(op, 'centerY', p, 0);
        const r = this.getPieceOpVal(op, 'radius', p, 50);
        const steps = 120;
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
        }
      } else if (op.type === 'rect') {
        const rx = this.getPieceOpVal(op, 'x', p, 0);
        const ry = this.getPieceOpVal(op, 'y', p, 0);
        const rl = this.getPieceOpVal(op, 'length', p, 100);
        const rw = this.getPieceOpVal(op, 'width', p, 100);
        const steps = 40;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          pts.push({ x: rx + t * rl, y: ry });
          pts.push({ x: rx + rl, y: ry + t * rw });
          pts.push({ x: rx + (1 - t) * rl, y: ry + rw });
          pts.push({ x: rx, y: ry + (1 - t) * rw });
        }
      } else if (op.type === 'path') {
        const sx = this.getPieceOpVal(op, 'startX', p, op.startPoint?.x || 0);
        const sy = this.getPieceOpVal(op, 'startY', p, op.startPoint?.y || 0);
        pts.push({ x: sx, y: sy });

        let curX = sx;
        let curY = sy;

        (op.segments || []).forEach(seg => {
          const ex = this.getPieceOpVal(seg, 'endX', p, seg.endX !== undefined ? seg.endX : curX);
          const ey = this.getPieceOpVal(seg, 'endY', p, seg.endY !== undefined ? seg.endY : curY);

          if (seg.type === 'line') {
            const steps = 20;
            for (let i = 1; i <= steps; i++) {
              const t = i / steps;
              pts.push({ x: curX + (ex - curX) * t, y: curY + (ey - curY) * t });
            }
          } else if (seg.type === 'curve') {
            const r = this.getPieceOpVal(seg, 'radius', p, seg.radius || 50);
            const dir = seg.curveDirection || 'cw';
            const arcPts = this.getArcExtrema(curX, curY, ex, ey, r, dir);
            const steps = 30;
            try {
              const center = calcArcCenter(curX, curY, ex, ey, r, dir);
              let aStart = Math.atan2(curY - center.y, curX - center.x);
              let aEnd = Math.atan2(ey - center.y, ex - center.x);
              const isCW = dir === 'cw' || dir === 'cw180';
              if (isCW && aEnd > aStart) aEnd -= Math.PI * 2;
              if (!isCW && aEnd < aStart) aEnd += Math.PI * 2;

              for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const a = aStart + (aEnd - aStart) * t;
                pts.push({ x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) });
              }
            } catch (e) {
              arcPts.forEach(pt => pts.push(pt));
            }
          }
          curX = ex;
          curY = ey;
        });
      }
    });

    const bottomProfile = new Array(numSamples).fill(Infinity);
    const topProfile = new Array(numSamples).fill(-Infinity);

    pts.forEach(pt => {
      const relX = pt.x - shiftX;
      const relY = pt.y - shiftY;
      let bucket = Math.floor((relX / w) * numSamples);
      if (bucket < 0) bucket = 0;
      if (bucket >= numSamples) bucket = numSamples - 1;

      if (relY < bottomProfile[bucket]) bottomProfile[bucket] = relY;
      if (relY > topProfile[bucket]) topProfile[bucket] = relY;
    });

    for (let i = 0; i < numSamples; i++) {
      if (!isFinite(bottomProfile[i])) {
        let prevB = 0, nextB = 0, foundPrev = false, foundNext = false;
        for (let pIdx = i - 1; pIdx >= 0; pIdx--) { if (isFinite(bottomProfile[pIdx])) { prevB = bottomProfile[pIdx]; foundPrev = true; break; } }
        for (let nIdx = i + 1; nIdx < numSamples; nIdx++) { if (isFinite(bottomProfile[nIdx])) { nextB = bottomProfile[nIdx]; foundNext = true; break; } }
        bottomProfile[i] = foundPrev ? prevB : (foundNext ? nextB : 0);
      }
      if (!isFinite(topProfile[i])) {
        let prevT = h, nextT = h, foundPrev = false, foundNext = false;
        for (let pIdx = i - 1; pIdx >= 0; pIdx--) { if (isFinite(topProfile[pIdx])) { prevT = topProfile[pIdx]; foundPrev = true; break; } }
        for (let nIdx = i + 1; nIdx < numSamples; nIdx++) { if (isFinite(topProfile[nIdx])) { nextT = topProfile[nIdx]; foundNext = true; break; } }
        topProfile[i] = foundPrev ? prevT : (foundNext ? nextT : h);
      }
      bottomProfile[i] = Math.max(0, Math.min(h, bottomProfile[i]));
      topProfile[i] = Math.max(0, Math.min(h, topProfile[i]));
    }

    return {
      w,
      h,
      shiftX,
      shiftY,
      isOrganic: true,
      bottomProfile,
      topProfile
    };
  },

  getProfileValAtRatio(profileArray, ratio) {
    if (!profileArray || profileArray.length === 0) return 0;
    const r = Math.max(0, Math.min(1, ratio));
    const idx = r * (profileArray.length - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(profileArray.length - 1, Math.ceil(idx));
    if (i0 === i1) return profileArray[i0];
    const t = idx - i0;
    return profileArray[i0] * (1 - t) + profileArray[i1] * t;
  },

  // ── True-Shape Organic Skyline Drop Nesting ─────────────────

  sheets: [],
  activeSheetIndex: 0,

  calculateNesting(piecesList, sheetW, sheetH, cutterTool, extraGap, extraCutDepth) {
    this.sheetW = sheetW || 1850;
    this.sheetH = sheetH || 2750;
    this.extraGap = extraGap !== undefined ? parseFloat(extraGap) : 2;
    this.extraCutDepth = extraCutDepth !== undefined ? parseFloat(extraCutDepth) : 0.3;
    const toolDiam = cutterTool ? cutterTool.diameter : 6;
    const margin = toolDiam + this.extraGap; // Distância mínima entre peças

    this.sheets = [];
    let currentPlaced = [];

    const numBuckets = Math.ceil(this.sheetW);
    let skyline = new Array(numBuckets).fill(margin);

    const numSamples = 100;
    const items = piecesList.map(p => {
      const normProf = this.getPieceProfiles(p, numSamples);
      return {
        piece: p,
        normProf,
        area: normProf.w * normProf.h
      };
    }).sort((a, b) => b.area - a.area);

    const findBestPlacement = (prof, currentSkyline) => {
      let bestX = -1;
      let bestY = Infinity;
      const pW = prof.w;
      const pH = prof.h;

      const maxPossibleX = Math.floor(this.sheetW - pW - margin);
      if (maxPossibleX < margin) return null;

      // Candidatos X prioritários: alinhados com a margem esquerda e peças já posicionadas
      const candidateXs = new Set();
      candidateXs.add(Math.floor(margin));
      currentPlaced.forEach(p => {
        const alignX = Math.floor(p.x);
        const nextX = Math.floor(p.x + p.w + margin);
        if (alignX >= margin && alignX <= maxPossibleX) candidateXs.add(alignX);
        if (nextX >= margin && nextX <= maxPossibleX) candidateXs.add(nextX);
      });

      // Também adiciona candidatos com passo regular de 10mm
      for (let x = Math.floor(margin); x <= maxPossibleX; x += 10) {
        candidateXs.add(x);
      }

      const sortedXs = Array.from(candidateXs).sort((a, b) => a - b);

      for (const x of sortedXs) {
        let reqY = margin;
        const startX = x;
        const endX = Math.min(numBuckets - 1, Math.floor(x + pW));

        for (let sx = startX; sx <= endX; sx++) {
          const ratio = (sx - x) / pW;
          const skyH = currentSkyline[sx] !== undefined ? currentSkyline[sx] : margin;
          const bVal = this.getProfileValAtRatio(prof.bottomProfile, ratio);
          const yAtSample = skyH + margin - bVal;
          if (yAtSample > reqY) reqY = yAtSample;
        }

        if (reqY + pH + margin <= this.sheetH) {
          // Prefere menor Y (mais abaixo), e para Ys muito próximos (diferença < 2mm), prefere menor X (mais à esquerda)
          if (reqY < bestY - 2 || (Math.abs(reqY - bestY) <= 2 && x < bestX)) {
            bestY = reqY;
            bestX = x;
          }
        }
      }

      if (bestX >= 0 && isFinite(bestY)) {
        return { x: bestX, y: bestY };
      }
      return null;
    };

    items.forEach(item => {
      const p = item.piece;
      let chosenProf = item.normProf;
      let chosenPlacement = findBestPlacement(item.normProf, skyline);

      if (!chosenPlacement) {
        if (currentPlaced.length > 0) {
          this.sheets.push({
            sheetIndex: this.sheets.length + 1,
            placedPieces: currentPlaced
          });
        }
        currentPlaced = [];
        skyline = new Array(numBuckets).fill(margin);

        chosenPlacement = findBestPlacement(item.normProf, skyline);
        if (!chosenPlacement) {
          chosenPlacement = { x: margin, y: margin };
        }
      }

      const pW = chosenProf.w;
      const pH = chosenProf.h;
      const placedX = chosenPlacement.x;
      const placedY = chosenPlacement.y;

      currentPlaced.push({
        piece: p,
        x: placedX,
        y: placedY,
        w: pW,
        h: pH,
        shiftX: chosenProf.shiftX,
        shiftY: chosenProf.shiftY,
        organicW: item.normProf.w,
        organicH: item.normProf.h,
        rotated: false
      });

      const startX = Math.floor(placedX);
      const endX = Math.min(numBuckets - 1, Math.floor(placedX + pW));

      for (let sx = startX; sx <= endX; sx++) {
        const ratio = (sx - placedX) / pW;
        const tVal = this.getProfileValAtRatio(chosenProf.topProfile, ratio);
        const topVal = placedY + tVal;
        if (topVal > skyline[sx]) {
          skyline[sx] = topVal;
        }
      }
    });

    if (currentPlaced.length > 0) {
      this.sheets.push({
        sheetIndex: this.sheets.length + 1,
        placedPieces: currentPlaced
      });
    }

    this.activeSheetIndex = 0;
    this.placedPieces = this.sheets[0] ? this.sheets[0].placedPieces : [];

    this.calcTransform();
    this.draw();
    return this.sheets;
  },

  setActiveSheet(sheetIndex) {
    if (!this.sheets || !this.sheets[sheetIndex]) return;
    this.activeSheetIndex = sheetIndex;
    this.placedPieces = this.sheets[sheetIndex].placedPieces;
    this.calcTransform();
    this.draw();
  },

  drawArcPathWithCenter(ctx, center, radius, angStart, angEnd, direction) {
    const numSteps = 36;
    for (let i = 1; i <= numSteps; i++) {
      const t = i / numSteps;
      let aEnd = angEnd;
      if (direction === 'cw' && aEnd > angStart) aEnd -= Math.PI * 2;
      if (direction === 'ccw' && aEnd < angStart) aEnd += Math.PI * 2;

      const ang = angStart + (aEnd - angStart) * t;
      const px = center.x + radius * Math.cos(ang);
      const py = center.y + radius * Math.sin(ang);
      const pt = this.toCanvas(px, py);
      ctx.lineTo(pt.x, pt.y);
    }
  },

  // ── Nesting Canvas Drawing ──────────────────────────────────

  draw() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const cw = this.canvas.width / (window.devicePixelRatio || 1);
    const ch = this.canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, cw, ch);

    // Fundo da Área de Trabalho (Respeita Tema Dark / Light)
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.fillStyle = isLight ? '#f1f5f9' : '#0b0f19';
    ctx.fillRect(0, 0, cw, ch);

    // Renderiza a Chapa Principal (1850 x 2750 mm)
    const sheetTL = this.toCanvas(0, this.sheetH);
    const sheetDrawW = this.sheetW * this.scale;
    const sheetDrawH = this.sheetH * this.scale;

    ctx.fillStyle = isLight ? '#ffffff' : 'rgba(19, 23, 32, 0.9)';
    ctx.fillRect(sheetTL.x, sheetTL.y, sheetDrawW, sheetDrawH);

    // Marca d'água de linhas de veio da chapa (sentido altura / Y / 2750mm)
    ctx.save();
    ctx.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.15)' : 'rgba(0, 180, 216, 0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([12, 8]);
    for (let gx = 100; gx < this.sheetW; gx += 100) {
      const p1 = this.toCanvas(gx, 0);
      const p2 = this.toCanvas(gx, this.sheetH);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = isLight ? '#0284c7' : '#00b4d8';
    ctx.lineWidth = 2;
    ctx.strokeRect(sheetTL.x, sheetTL.y, sheetDrawW, sheetDrawH);

    // Texto da Chapa
    const totalSheets = this.sheets && this.sheets.length > 0 ? this.sheets.length : 1;
    const currentSheetNum = (this.activeSheetIndex || 0) + 1;
    ctx.font = `600 12px 'JetBrains Mono', monospace`;
    ctx.fillStyle = isLight ? '#0284c7' : '#00b4d8';
    ctx.fillText(`CHAPA ${currentSheetNum} DE ${totalSheets} (${this.sheetW} × ${this.sheetH} mm — Veio no Sentido A / 2750mm)`, sheetTL.x + 10, sheetTL.y + 20);

    // Renderiza cada peça posicionada
    this.placedPieces.forEach((placed, idx) => {
      const pTL = this.toCanvas(placed.x, placed.y + placed.h);
      const pW = placed.w * this.scale;
      const pH = placed.h * this.scale;

      const isOrganic = !!placed.piece.isOrganic || (placed.piece.operations && placed.piece.operations.some(o => this.isOrganicContourOp(o)));

      if (!isOrganic) {
        // Corpo da peça retangular em Melamina Branca
        ctx.fillStyle = '#f5f7fa';
        ctx.fillRect(pTL.x, pTL.y, pW, pH);

        // Marca d'água do Veio da Madeira na Peça Retangular
        if (placed.piece.hasGrain) {
          ctx.save();
          ctx.strokeStyle = 'rgba(217, 119, 6, 0.3)';
          ctx.lineWidth = 1;
          ctx.setLineDash([6, 4]);

          const grainStep = 15;
          for (let gx = grainStep; gx < placed.w; gx += grainStep) {
            const ptTop = this.toCanvas(placed.x + gx, placed.y + placed.h);
            const ptBot = this.toCanvas(placed.x + gx, placed.y);
            ctx.beginPath(); ctx.moveTo(ptTop.x, ptTop.y); ctx.lineTo(ptBot.x, ptBot.y); ctx.stroke();
          }

          ctx.setLineDash([]);
          ctx.font = `600 9px 'JetBrains Mono', monospace`;
          ctx.fillStyle = '#d97706';
          ctx.fillText('🪵 VEIO', pTL.x + pW - 45, pTL.y + 14);
          ctx.restore();
        }

        ctx.strokeStyle = '#222222';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(pTL.x, pTL.y, pW, pH);

        // Nome e dimensões da peça retangular
        ctx.font = `600 11px 'JetBrains Mono', monospace`;
        ctx.fillStyle = '#111111';
        ctx.fillText(`${idx + 1}. ${placed.piece.name}`, pTL.x + 6, pTL.y + 16);
        ctx.font = `500 10px 'JetBrains Mono', monospace`;
        ctx.fillStyle = '#555555';
        ctx.fillText(`${placed.piece.width}×${placed.piece.height} mm`, pTL.x + 6, pTL.y + 30);
      } else {
        // Para peças orgânicas: SEM a caixa retangular! Desenha os contornos orgânicos preenchidos em melamina
        const ops = placed.piece.operations || [];
        ops.forEach(op => {
          if (op.type === 'park') return;
          if (this.isOrganicContourOp(op)) {
            const transOp = this.transformOpForPlacedPiece(op, placed);
            ctx.save();
            ctx.fillStyle = '#f5f7fa';
            ctx.strokeStyle = '#00e676';
            ctx.lineWidth = 1.8;

            if (transOp.type === 'circle') {
              const pt = this.toCanvas(transOp.centerX, transOp.centerY);
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, transOp.radius * this.scale, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            } else if (transOp.type === 'rect') {
              const r = Math.min(transOp.cornerRadius || 0, Math.min(transOp.length, transOp.width) / 2);
              if (r > 0) {
                const pStart = this.toCanvas(transOp.x + r, transOp.y);
                const pBR = this.toCanvas(transOp.x + transOp.length, transOp.y);
                const pTR = this.toCanvas(transOp.x + transOp.length, transOp.y + transOp.width);
                const pTL = this.toCanvas(transOp.x, transOp.y + transOp.width);
                const pBL = this.toCanvas(transOp.x, transOp.y);
                const rCanvas = r * this.scale;
                ctx.beginPath();
                ctx.moveTo(pStart.x, pStart.y);
                ctx.arcTo(pBR.x, pBR.y, pTR.x, pTR.y, rCanvas);
                ctx.arcTo(pTR.x, pTR.y, pTL.x, pTL.y, rCanvas);
                ctx.arcTo(pTL.x, pTL.y, pBL.x, pBL.y, rCanvas);
                ctx.arcTo(pBL.x, pBL.y, pStart.x, pStart.y, rCanvas);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
              } else {
                const pt = this.toCanvas(transOp.x, transOp.y + transOp.width);
                const rw = transOp.length * this.scale;
                const rh = transOp.width * this.scale;
                ctx.fillRect(pt.x, pt.y, rw, rh);
                ctx.strokeRect(pt.x, pt.y, rw, rh);
              }
            } else if (transOp.type === 'path' && transOp.startPoint) {
              const start = this.toCanvas(transOp.startPoint.x, transOp.startPoint.y);
              ctx.beginPath();
              ctx.moveTo(start.x, start.y);

              let curPt = transOp.startPoint;

              (transOp.segments || []).forEach(seg => {
                const endPt = { x: seg.endX, y: seg.endY };
                if (seg.type === 'line') {
                  const pt = this.toCanvas(endPt.x, endPt.y);
                  ctx.lineTo(pt.x, pt.y);
                } else if (seg.type === 'curve') {
                  const radius = seg.radius || 50;
                  const dir = seg.curveDirection || 'cw';
                  try {
                    const center = calcArcCenter(curPt.x, curPt.y, endPt.x, endPt.y, radius, dir);
                    const angStart = Math.atan2(curPt.y - center.y, curPt.x - center.x);
                    const angEnd = Math.atan2(endPt.y - center.y, endPt.x - center.x);
                    this.drawArcPathWithCenter(ctx, center, radius, angStart, angEnd, dir);
                  } catch (e) {
                    const pt = this.toCanvas(endPt.x, endPt.y);
                    ctx.lineTo(pt.x, pt.y);
                  }
                }
                curPt = endPt;
              });

              if (transOp.closed) { ctx.closePath(); ctx.fill(); }
              ctx.stroke();
            } else if (transOp.type === 'line') {
              const p1 = this.toCanvas(transOp.startX, transOp.startY);
              const p2 = this.toCanvas(transOp.endX, transOp.endY);
              ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
            } else if (transOp.type === 'curve') {
              const p1 = this.toCanvas(transOp.startX, transOp.startY);
              const p2 = this.toCanvas(transOp.endX, transOp.endY);
              ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
            }
            ctx.restore();
          }
        });
      }

      // Renderiza operações internas da peça no Nesting
      const ops = placed.piece.operations || [];
      ops.forEach(op => {
        if (op.type === 'park') return;
        if (isOrganic && this.isOrganicContourOp(op)) return; // Já desenhado com destaque orgânico

        const transOp = this.transformOpForPlacedPiece(op, placed);

        const isThrough = transOp.depth >= placed.piece.depth;
        const color = isThrough ? '#ff7043' : '#00e676';

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;

        if (transOp.type === 'line') {
          const p1 = this.toCanvas(transOp.startX, transOp.startY);
          const p2 = this.toCanvas(transOp.endX, transOp.endY);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        } else if (transOp.type === 'rect') {
          const pt = this.toCanvas(transOp.x, transOp.y + transOp.width);
          ctx.strokeRect(pt.x, pt.y, transOp.length * this.scale, transOp.width * this.scale);
        } else if (transOp.type === 'circle') {
          const pt = this.toCanvas(transOp.centerX, transOp.centerY);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, transOp.radius * this.scale, 0, Math.PI * 2);
          ctx.stroke();
        } else if (transOp.type === 'curve') {
          const p1 = this.toCanvas(transOp.startX, transOp.startY);
          const p2 = this.toCanvas(transOp.endX, transOp.endY);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        } else if (transOp.type === 'path' && transOp.startPoint) {
          const start = this.toCanvas(transOp.startPoint.x, transOp.startPoint.y);
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          (transOp.segments || []).forEach(seg => {
            const pt = this.toCanvas(seg.endX, seg.endY);
            ctx.lineTo(pt.x, pt.y);
          });
          if (transOp.closed) ctx.closePath();
          ctx.stroke();
        } else if (transOp.type === 'drill') {
          const holes = transOp.holes || [];
          const diameter = transOp.diameter || 8;
          holes.forEach(h => {
            const pt = this.toCanvas(h.x, h.y);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, (diameter / 2) * this.scale, 0, Math.PI * 2);
            ctx.stroke();
          });
        }
      });
    });
  },

  // ── Master Nesting G-Code Generator ─────────────────────────

  generateMasterGCode(cutterTool, safeZParam = 10, approachZParam = 2, extraCutDepthParam) {
    if (this.placedPieces.length === 0) return null;

    const sheetDepth = this.placedPieces[0].piece.depth || 15;
    const extraCut = extraCutDepthParam !== undefined ? parseFloat(extraCutDepthParam) : (this.extraCutDepth || 0.3);
    const totalCutDepth = sheetDepth + extraCut;
    const state = {
      lineNum: 0,
      lastX: null, lastY: null, lastZ: null, lastF: null, lastTool: null,
      isFirstFeed: true,
      lines: []
    };

    const actualSafeZ = sheetDepth + safeZParam;
    const actualApproachZ = sheetDepth + approachZParam;
    const pos = Storage.getToolPosition(cutterTool.id) || 1;

    // Header
    NCGenerator.addLine(state, 'o0001');
    NCGenerator.addLine(state, `( PLANO DE CORTE NESTING - CHAPA ${this.sheetW}x${this.sheetH}x${sheetDepth}mm | SOBRECORTE ${extraCut}mm )`);
    NCGenerator.addLine(state, `${NCGenerator.N(state)} G00 G21 G17 G90`);
    NCGenerator.addLine(state, `${NCGenerator.N(state)} G00 G40 G49 G80`);
    NCGenerator.addLine(state, `${NCGenerator.N(state)} G71`);
    NCGenerator.addLine(state, `${NCGenerator.N(state)} T${pos} M06`);
    NCGenerator.addLine(state, `${NCGenerator.N(state)} G00 G43Z${NCGenerator.fmtCoord(actualSafeZ)}H${pos} M8`);
    NCGenerator.addLine(state, `${NCGenerator.N(state)} S${NCGenerator.fmtSpeed(cutterTool.rpm)} M03`);

    const feedMmMin = cutterTool.feedRate * 1000;
    state.lastF = feedMmMin;
    NCGenerator.addLine(state, `${NCGenerator.N(state)} X0.000 Y0.000 F${NCGenerator.fmtFeed(feedMmMin)}`);
    state.lastTool = cutterTool.id;

    // ── ETAPA 1: USINAGENS INTERNAS DE CADA PEÇA ───────────────
    NCGenerator.addLine(state, `( --- ETAPA 1: USINAGENS INTERNAS DAS PEÇAS --- )`);
    this.placedPieces.forEach((placed, idx) => {
      NCGenerator.addLine(state, `( --- PEÇA ${idx + 1}: ${placed.piece.name} --- )`);
      const ops = placed.piece.operations || [];
      ops.forEach(op => {
        if (op.type === 'park') return;
        // Pula o contorno orgânico na Etapa 1 (pois ele será usinado na Etapa 2 como corte externo)
        if (this.isOrganicContourOp(op)) return;

        const transOp = this.transformOpForPlacedPiece(op, placed);

        const tool = Storage.getToolById(transOp.toolId) || cutterTool;
        const tPos = Storage.getToolPosition(tool.id) || pos;
        const opFeed = tool.feedRate * 1000;
        const opPlunge = tool.plungeRate * 1000;

        const passes = NCGenerator.buildDepthPasses(transOp.depth, tool.passDepth || transOp.depth);
        for (let p = 0; p < passes.length; p++) {
          const cutZ = sheetDepth - passes[p];
          if (transOp.type === 'line') NCGenerator.generateLineOp(state, transOp, tool, tPos, cutZ, opFeed, opPlunge, actualSafeZ, actualApproachZ, p > 0);
          else if (transOp.type === 'curve') NCGenerator.generateCurveOp(state, transOp, tool, tPos, cutZ, opFeed, opPlunge, actualSafeZ, actualApproachZ, p > 0);
          else if (transOp.type === 'path') NCGenerator.generatePathOp(state, transOp, tool, tPos, cutZ, opFeed, opPlunge, actualSafeZ, actualApproachZ, p > 0);
          else if (transOp.type === 'circle') NCGenerator.generateCircleOp(state, transOp, tool, tPos, cutZ, opFeed, opPlunge, actualSafeZ, actualApproachZ, p > 0);
          else if (transOp.type === 'rect') NCGenerator.generateRectOp(state, transOp, tool, tPos, cutZ, opFeed, opPlunge, actualSafeZ, actualApproachZ, p > 0);
          else if (transOp.type === 'drill') NCGenerator.generateDrillOp(state, transOp, tool, tPos, cutZ, opFeed, opPlunge, actualSafeZ, actualApproachZ, p > 0, this.sheetW, this.sheetH);
        }
        NCGenerator.emitRapid(state, null, null, actualSafeZ);
      });
    });

    // ── ETAPA 2: CORTE EXTERNO DE PERÍMETRO DE CADA PEÇA ───────
    NCGenerator.addLine(state, `( --- ETAPA 2: CORTE EXTERNO DE PERÍMETRO DAS PEÇAS (CORTE TOTAL ${totalCutDepth.toFixed(1)}mm) --- )`);
    const cutPasses = NCGenerator.buildDepthPasses(totalCutDepth, cutterTool.passDepth || 5);

    this.placedPieces.forEach((placed, idx) => {
      const isOrganicPiece = !!placed.piece.isOrganic || (placed.piece.operations && placed.piece.operations.some(o => this.isOrganicContourOp(o)));

      NCGenerator.addLine(state, `( CORTE EXTERNO PEÇA ${idx + 1}: ${placed.piece.name} ${isOrganicPiece ? '[ORGÂNICA]' : ''} )`);

      if (isOrganicPiece) {
        const organicOps = (placed.piece.operations || []).filter(o => this.isOrganicContourOp(o));
        if (organicOps.length > 0) {
          organicOps.forEach(op => {
            const transOp = this.transformOpForPlacedPiece(op, placed);
            transOp.depth = totalCutDepth;
            for (let p = 0; p < cutPasses.length; p++) {
              const cutZ = sheetDepth - cutPasses[p];
              if (transOp.type === 'line') NCGenerator.generateLineOp(state, transOp, cutterTool, pos, cutZ, feedMmMin, cutterTool.plungeRate * 1000, actualSafeZ, actualApproachZ, p > 0);
              else if (transOp.type === 'curve') NCGenerator.generateCurveOp(state, transOp, cutterTool, pos, cutZ, feedMmMin, cutterTool.plungeRate * 1000, actualSafeZ, actualApproachZ, p > 0);
              else if (transOp.type === 'path') NCGenerator.generatePathOp(state, transOp, cutterTool, pos, cutZ, feedMmMin, cutterTool.plungeRate * 1000, actualSafeZ, actualApproachZ, p > 0);
              else if (transOp.type === 'circle') NCGenerator.generateCircleOp(state, transOp, cutterTool, pos, cutZ, feedMmMin, cutterTool.plungeRate * 1000, actualSafeZ, actualApproachZ, p > 0);
              else if (transOp.type === 'rect') NCGenerator.generateRectOp(state, transOp, cutterTool, pos, cutZ, feedMmMin, cutterTool.plungeRate * 1000, actualSafeZ, actualApproachZ, p > 0);
            }
            NCGenerator.emitRapid(state, null, null, actualSafeZ);
          });
        }
      } else {
        const rectOp = {
          type: 'rect',
          x: 0,
          y: 0,
          length: placed.piece.width,
          width: placed.piece.height,
          correction: 'esquerda',
          depth: totalCutDepth
        };
        const transOp = this.transformOpForPlacedPiece(rectOp, placed);

        for (let p = 0; p < cutPasses.length; p++) {
          const cutZ = sheetDepth - cutPasses[p];
          NCGenerator.generateRectOp(state, transOp, cutterTool, pos, cutZ, feedMmMin, cutterTool.plungeRate * 1000, actualSafeZ, actualApproachZ, p > 0);
        }
        NCGenerator.emitRapid(state, null, null, actualSafeZ);
      }
    });

    // ── ETAPA 3: FINALIZAÇÃO NO PARK ───────────────────────────
    NCGenerator.generateParkOp(state, { x: 1850, y: 2750, z: 100 }, actualSafeZ);
    NCGenerator.addLine(state, `${NCGenerator.N(state)} M09`);
    NCGenerator.addLine(state, `${NCGenerator.N(state)} M30`);

    return state.lines.join('\r\n');
  }
};
