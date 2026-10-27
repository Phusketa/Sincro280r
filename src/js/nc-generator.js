// ╔═══════════════════════════════════════════════════════════════╗
// ║  NCGenerator — G-code para NC Studio ATC Arcs (mm) (*.nc)  ║
// ║  Segue exatamente o pós-processador fornecido               ║
// ╚═══════════════════════════════════════════════════════════════╝

function generate(pieceName, pieceW, pieceH, pieceD, operations, safeZParam = 10, approachZParam = 2) {
    const state = {
      lineNum: 0,
      lastX: null,
      lastY: null,
      lastZ: null,
      lastF: null,
      lastTool: null,
      isFirstFeed: true,
      lines: []
    };

    // Convenção CNC Sincro-KDT:
    // Z0 = Nível da mesa de sacrifício (Corte Total por completo)
    // Z = pieceD (E = Espessura da peça, ex: 15mm é a superfície superior da chapa)
    const actualSafeZ = pieceD + (safeZParam || 10);        // E + 10 (ex: 15 + 10 = Z25.000)
    const actualApproachZ = pieceD + (approachZParam || 2); // E + 2  (ex: 15 + 2 = Z17.000)
    const homeX = 0, homeY = 0, homeZ = actualSafeZ;

    const filename = `${pieceName}_${pieceW}x${pieceH}x${pieceD}`;

    // Operations sequence strictly follows user defined list order (1, 2, 3...)
    const sortedOps = [...operations];

    // Find first tool
    if (sortedOps.length === 0) return null;

    const firstOp = sortedOps[0];
    const firstTool = Storage.getToolById(firstOp.toolId);
    const firstPos = Storage.getToolPosition(firstOp.toolId);
    if (!firstTool || !firstPos) return null;

    // ── HEADER ────────────────────────────────────────────────
    addLine(state, 'o0001');
    addLine(state, `( ${filename} )`);
    addLine(state, `${N(state)} G00 G21 G17 G90`);
    addLine(state, `${N(state)} G00 G40 G49 G80`);
    addLine(state, `${N(state)} G71`);
    addLine(state, `${N(state)} T${firstPos} M06`);
    addLine(state, `${N(state)} G00 G43Z${fmtCoord(actualSafeZ)}H${firstPos} M8`);
    addLine(state, `${N(state)} S${fmtSpeed(firstTool.rpm)} M03`);

    const feedMmMin = firstTool.feedRate * 1000;
    state.lastF = feedMmMin;
    addLine(state, `${N(state)} G00 X${fmtCoord(homeX)} Y${fmtCoord(homeY)} F${fmtFeed(feedMmMin)}`);

    state.lastTool = firstOp.toolId;
    state.lastX = homeX;
    state.lastY = homeY;
    state.lastZ = actualSafeZ;

    let hasPark = false;

    // ── OPERATIONS ────────────────────────────────────────────
    for (let i = 0; i < sortedOps.length; i++) {
      const op = sortedOps[i];

      // Park operation handling
      if (op.type === 'park') {
        generateParkOp(state, op, actualSafeZ);
        hasPark = true;
        continue;
      }

      const tool = Storage.getToolById(op.toolId);
      const pos = Storage.getToolPosition(op.toolId);
      if (!tool || !pos) continue;

      const feedRate = tool.feedRate * 1000;
      const plungeRate = tool.plungeRate * 1000;
      const passDepth = tool.passDepth || op.depth || 5;

      // Tool change if different from last tool
      if (state.lastTool !== op.toolId) {
        addLine(state, `${N(state)} T${pos} M06`);
        addLine(state, `${N(state)} G00 G43Z${fmtCoord(actualSafeZ)}H${pos} M8`);
        addLine(state, `${N(state)} S${fmtSpeed(tool.rpm)} M03`);
        state.lastTool = op.toolId;
      }

      // Depth passes calculation
      const depth = op.depth || 5;
      const passes = buildDepthPasses(depth, passDepth);

      for (let p = 0; p < passes.length; p++) {
        const cutZ = pieceD - passes[p];
        const isRepeatPass = p > 0;

        if (op.type === 'line') {
          generateLineOp(state, op, tool, pos, cutZ, feedRate, plungeRate, actualSafeZ, actualApproachZ, isRepeatPass);
        } else if (op.type === 'curve') {
          generateCurveOp(state, op, tool, pos, cutZ, feedRate, plungeRate, actualSafeZ, actualApproachZ, isRepeatPass);
        } else if (op.type === 'path') {
          generatePathOp(state, op, tool, pos, cutZ, feedRate, plungeRate, actualSafeZ, actualApproachZ, isRepeatPass);
        } else if (op.type === 'circle') {
          generateCircleOp(state, op, tool, pos, cutZ, feedRate, plungeRate, actualSafeZ, actualApproachZ, isRepeatPass);
        } else if (op.type === 'rect') {
          generateRectOp(state, op, tool, pos, cutZ, feedRate, plungeRate, actualSafeZ, actualApproachZ, isRepeatPass);
        } else if (op.type === 'drill') {
          generateDrillOp(state, op, tool, pos, cutZ, feedRate, plungeRate, actualSafeZ, actualApproachZ, isRepeatPass, pieceW, pieceH);
        }
      }

      // Retract after operation (se ainda não estiver em safeZ)
      emitRapid(state, null, null, actualSafeZ);
    }

    if (!hasPark) {
      emitRapid(state, null, null, actualSafeZ);
      addLine(state, `${N(state)} M09`);
      addLine(state, `${N(state)} G00 X${fmtCoord(homeX)} Y${fmtCoord(homeY)}`);
    } else {
      addLine(state, `${N(state)} M09`);
    }
    addLine(state, `${N(state)} M30`);

    return state.lines.join('\r\n');
}

// ── Line Operation ────────────────────────────────────────────

function generateLineOp(state, op, tool, pos, cutZ, feedRate, plungeRate, safeZ, approachZ, isRepeatPass) {
  let startX = App.getOpVal ? App.getOpVal(op, 'startX', op.startX) : op.startX;
  let startY = App.getOpVal ? App.getOpVal(op, 'startY', op.startY) : op.startY;
  let endX = App.getOpVal ? App.getOpVal(op, 'endX', op.endX) : op.endX;
  let endY = App.getOpVal ? App.getOpVal(op, 'endY', op.endY) : op.endY;
  const toolRadius = (tool.diameter || 6) / 2;
  const toolDiameter = tool.diameter || 6;
  const gw = App.getOpVal ? App.getOpVal(op, 'grooveWidth', op.grooveWidth || toolDiameter) : (op.grooveWidth || toolDiameter);

  // Direction vector of the line
  const dx = endX - startX;
  const dy = endY - startY;
  const lineLen = Math.sqrt(dx * dx + dy * dy);

  if (lineLen <= 0.001) return;

  const perpX = -dy / lineLen;
  const perpY = dx / lineLen;

  // ── Pre-calculate tool radius offset (like Aspire) ──────────
  if (op.correction && op.correction !== 'meio') {
    const sign = op.correction === 'esquerda' ? 1 : -1;
    startX += sign * perpX * toolRadius;
    startY += sign * perpY * toolRadius;
    endX   += sign * perpX * toolRadius;
    endY   += sign * perpY * toolRadius;

    if (isRepeatPass) {
      emitRapid(state, null, null, approachZ);
    }
    emitRapid(state, startX, startY, null);
    emitRapid(state, null, null, approachZ);
    emitFirstFeed(state, null, null, cutZ, plungeRate);
    emitFeed(state, endX, endY, null, feedRate);
    return;
  }

  // ── Rasgo largo com múltiplas passadas paralelas (grooveWidth > toolDiameter) ────
  if (gw > toolDiameter + 0.05) {
    const totalOffset = (gw - toolDiameter) / 2;
    const stepOver = tool.stepOver || (toolDiameter * 0.7);
    const numIntervals = Math.max(1, Math.ceil((gw - toolDiameter) / stepOver));
    const dOffset = (2 * totalOffset) / numIntervals;

    for (let k = 0; k <= numIntervals; k++) {
      const off = -totalOffset + k * dOffset;
      const pStartX = (k % 2 === 0) ? (startX + perpX * off) : (endX + perpX * off);
      const pStartY = (k % 2 === 0) ? (startY + perpY * off) : (endY + perpY * off);
      const pEndX   = (k % 2 === 0) ? (endX + perpX * off)   : (startX + perpX * off);
      const pEndY   = (k % 2 === 0) ? (endY + perpY * off)   : (startY + perpY * off);

      if (k === 0) {
        if (isRepeatPass) {
          emitRapid(state, null, null, approachZ);
        }
        emitRapid(state, pStartX, pStartY, null);
        emitRapid(state, null, null, approachZ);
        emitFirstFeed(state, null, null, cutZ, plungeRate);
        emitFeed(state, pEndX, pEndY, null, feedRate);
      } else {
        // Stepover na extremidade sem levantar Z (movimento em avanço de corte)
        emitFeed(state, pStartX, pStartY, null, feedRate);
        emitFeed(state, pEndX, pEndY, null, feedRate);
      }
    }
    return;
  }

  // ── Linha simples normal (centro) ─────────────────────────
  if (isRepeatPass) {
    emitRapid(state, null, null, approachZ);
  }

  // Rapid to start XY (already offset)
  emitRapid(state, startX, startY, null);
  // Rapid to approach Z
  emitRapid(state, null, null, approachZ);

  // Plunge to cut depth
  emitFirstFeed(state, null, null, cutZ, plungeRate);

  // Cut to end point (already offset)
  emitFeed(state, endX, endY, null, feedRate);
}

// ── Curve Operation ───────────────────────────────────────────

function generateCurveOp(state, op, tool, pos, cutZ, feedRate, plungeRate, safeZ, approachZ, isRepeatPass) {
  const startX = App.getOpVal ? App.getOpVal(op, 'startX', op.startX) : op.startX;
  const startY = App.getOpVal ? App.getOpVal(op, 'startY', op.startY) : op.startY;
  const endX = App.getOpVal ? App.getOpVal(op, 'endX', op.endX) : op.endX;
  const endY = App.getOpVal ? App.getOpVal(op, 'endY', op.endY) : op.endY;
  let radius = App.getOpVal ? App.getOpVal(op, 'radius', op.radius) : op.radius;

  // Pre-calculate tool radius offset for curves
  // For arcs: offsetting outward increases radius, inward decreases it
  if (op.correction && op.correction !== 'meio') {
    const toolRadius = (tool.diameter || 6) / 2;
    // 'esquerda' = offset outward (increase radius for CW, decrease for CCW)
    // 'direita'  = offset inward (decrease radius for CW, increase for CCW)
    const isOutward = (op.correction === 'esquerda' && op.curveDirection === 'cw') ||
                      (op.correction === 'direita' && op.curveDirection !== 'cw');
    radius = isOutward ? radius + toolRadius : Math.max(0.1, radius - toolRadius);
  }

  if (isRepeatPass) {
    emitRapid(state, null, null, approachZ);
  }

  // Rapid to start XY
  emitRapid(state, startX, startY, null);
  // Rapid to approach Z
  emitRapid(state, null, null, approachZ);

  // Plunge
  emitFirstFeed(state, null, null, cutZ, plungeRate);

  // Arc move
  const center = calcArcCenter(startX, startY, endX, endY, radius, op.curveDirection);
  const arcI = center.x - startX;
  const arcJ = center.y - startY;
  const arcCode = op.curveDirection === 'cw' ? 'G02' : 'G03';

  // First arc move includes feed rate
  const xStr = conditionalXY(state, 'X', endX);
  const yStr = conditionalXY(state, 'Y', endY);
  const fStr = conditionalF(state, feedRate);

  if (state.isFirstFeed || fStr) {
    addLine(state, `${N(state)} ${arcCode} ${xStr} ${yStr} I${fmtCoord(arcI)} J${fmtCoord(arcJ)} F${fmtFeed(feedRate)}`);
    state.lastF = feedRate;
    state.isFirstFeed = false;
  } else {
    addLine(state, `${N(state)} ${arcCode} ${xStr} ${yStr} I${fmtCoord(arcI)} J${fmtCoord(arcJ)}`);
  }
  state.lastX = endX;
  state.lastY = endY;
}

// ── Path Operation ────────────────────────────────────────────

function generatePathOp(state, op, tool, pos, cutZ, feedRate, plungeRate, safeZ, approachZ, isRepeatPass) {
  const startX = App.getOpVal ? App.getOpVal(op, 'startX', op.startPoint?.x || 0) : (op.startPoint?.x || 0);
  const startY = App.getOpVal ? App.getOpVal(op, 'startY', op.startPoint?.y || 0) : (op.startPoint?.y || 0);

  if (isRepeatPass) {
    emitRapid(state, null, null, approachZ);
  }

  // Rapid to start XY
  emitRapid(state, startX, startY, null);
  // Rapid to approach Z
  emitRapid(state, null, null, approachZ);

  // Plunge
  emitFirstFeed(state, null, null, cutZ, plungeRate);

  // Current position tracker
  let curX = startX;
  let curY = startY;

  // Process each segment
  for (let s = 0; s < op.segments.length; s++) {
    const seg = op.segments[s];
    if (seg.type === 'line') {
      emitFeed(state, seg.endX, seg.endY, null, feedRate);
      curX = seg.endX;
      curY = seg.endY;
    } else if (seg.type === 'curve') {
      const center = calcArcCenter(curX, curY, seg.endX, seg.endY, seg.radius, seg.curveDirection);
      const arcI = center.x - curX;
      const arcJ = center.y - curY;
      const arcCode = seg.curveDirection === 'cw' ? 'G02' : 'G03';

      const xStr = conditionalXY(state, 'X', seg.endX);
      const yStr = conditionalXY(state, 'Y', seg.endY);
      const fStr = conditionalF(state, feedRate);

      if (state.isFirstFeed || fStr) {
        addLine(state, `${N(state)} ${arcCode} ${xStr} ${yStr} I${fmtCoord(arcI)} J${fmtCoord(arcJ)} F${fmtFeed(feedRate)}`);
        state.lastF = feedRate;
        state.isFirstFeed = false;
      } else {
        addLine(state, `${N(state)} ${arcCode} ${xStr} ${yStr} I${fmtCoord(arcI)} J${fmtCoord(arcJ)}`);
      }
      state.lastX = seg.endX;
      state.lastY = seg.endY;
      curX = seg.endX;
      curY = seg.endY;
    }
  }

  // Close path if needed
  if (op.closed) {
    emitFeed(state, startX, startY, null, feedRate);
  }
}

// ── Circle Operation ──────────────────────────────────────────

function generateCircleOp(state, op, tool, pos, cutZ, feedRate, plungeRate, safeZ, approachZ, isRepeatPass) {
  const cx = App.getOpVal ? App.getOpVal(op, 'centerX', op.centerX) : op.centerX;
  const cy = App.getOpVal ? App.getOpVal(op, 'centerY', op.centerY) : op.centerY;
  let r = App.getOpVal ? App.getOpVal(op, 'radius', op.radius) : op.radius;

  // ── Pre-calculate tool radius offset for circles ────────────
  // 'esquerda' = cut OUTSIDE the circle → toolpath radius = r + toolRadius
  // 'meio'     = center of tool on circle → toolpath radius = r
  // 'direita'  = cut INSIDE the circle  → toolpath radius = r - toolRadius
  const toolRadius = (tool.diameter || 6) / 2;
  let effectiveR = r;
  if (op.correction && op.correction !== 'meio') {
    if (op.correction === 'esquerda') {
      effectiveR = r + toolRadius;
    } else {
      effectiveR = Math.max(0.1, r - toolRadius);
    }
  }

  if (isRepeatPass) {
    emitRapid(state, null, null, approachZ);
  }

  if (op.isPocket) {
    // Pocketing concentric spiral pass
    const stepOver = tool.stepOver || (tool.diameter ? tool.diameter * 0.7 : 3);
    const passesCount = Math.max(1, Math.ceil(effectiveR / stepOver));

    for (let p = 1; p <= passesCount; p++) {
      const curR = Math.min(effectiveR, p * stepOver);
      const startX = cx + curR;
      const startY = cy;

      emitRapid(state, startX, startY, null);
      if (p === 1) emitRapid(state, null, null, approachZ);

      emitFirstFeed(state, null, null, cutZ, plungeRate);

      // Full 360 degree circle
      const arcI = -curR;
      const arcJ = 0;
      addLine(state, `${N(state)} G02 X${fmtCoord(startX)} Y${fmtCoord(startY)} I${fmtCoord(arcI)} J${fmtCoord(arcJ)} F${fmtFeed(feedRate)}`);
      state.lastX = startX;
      state.lastY = startY;
      state.lastF = feedRate;
    }
  } else {
    // Single profile circle pass (with pre-calculated offset)
    const startX = cx + effectiveR;
    const startY = cy;

    emitRapid(state, startX, startY, null);
    emitRapid(state, null, null, approachZ);

    emitFirstFeed(state, null, null, cutZ, plungeRate);

    const arcI = -effectiveR;
    const arcJ = 0;
    addLine(state, `${N(state)} G02 X${fmtCoord(startX)} Y${fmtCoord(startY)} I${fmtCoord(arcI)} J${fmtCoord(arcJ)} F${fmtFeed(feedRate)}`);
    state.lastX = startX;
    state.lastY = startY;
    state.lastF = feedRate;
  }
}

// ── Rect Operation ────────────────────────────────────────────

function generateRectOp(state, op, tool, pos, cutZ, feedRate, plungeRate, safeZ, approachZ, isRepeatPass) {
  let x = App.getOpVal ? App.getOpVal(op, 'x', op.x) : op.x;
  let y = App.getOpVal ? App.getOpVal(op, 'y', op.y) : op.y;
  let L = App.getOpVal ? App.getOpVal(op, 'length', op.length) : op.length;
  let W = App.getOpVal ? App.getOpVal(op, 'width', op.width) : op.width;
  const rawCr = App.getOpVal ? App.getOpVal(op, 'cornerRadius', op.cornerRadius || 0) : (op.cornerRadius || 0);
  let cr = Math.min(rawCr, Math.min(L, W) / 2);

  // ── Pre-calculate tool radius offset for rectangles ─────────
  // 'esquerda' = cut OUTSIDE → expand rect by toolRadius on all sides
  // 'direita'  = cut INSIDE  → shrink rect by toolRadius on all sides
  const toolRadius = (tool.diameter || 6) / 2;
  if (op.correction && op.correction !== 'meio') {
    if (op.correction === 'esquerda') {
      x -= toolRadius;
      y -= toolRadius;
      L += 2 * toolRadius;
      W += 2 * toolRadius;
      cr = Math.min(rawCr > 0 ? rawCr + toolRadius : 0, Math.min(L, W) / 2);
    } else {
      x += toolRadius;
      y += toolRadius;
      L = Math.max(0.1, L - 2 * toolRadius);
      W = Math.max(0.1, W - 2 * toolRadius);
      cr = Math.min(Math.max(0, rawCr - toolRadius), Math.min(L, W) / 2);
    }
  }

  if (isRepeatPass) {
    emitRapid(state, null, null, approachZ);
  }

  if (op.isPocket) {
    const stepOver = tool.stepOver || (tool.diameter ? tool.diameter * 0.7 : 3);
    const maxPasses = Math.max(1, Math.ceil(Math.min(L, W) / (2 * stepOver)));

    for (let p = 0; p < maxPasses; p++) {
      const offset = Math.min(Math.min(L / 2, W / 2) - 0.01, p * stepOver);
      const curX = x + offset;
      const curY = y + offset;
      const curL = L - 2 * offset;
      const curW = W - 2 * offset;
      if (curL <= 0 || curW <= 0) break;

      const curCr = Math.min(Math.max(0, cr - offset), Math.min(curL, curW) / 2);

      if (curCr <= 0) {
        emitRapid(state, curX, curY, null);
        if (p === 0) emitRapid(state, null, null, approachZ);

        emitFirstFeed(state, null, null, cutZ, plungeRate);

        // Clockwise climb milling: BL -> TL -> TR -> BR -> BL
        emitFeed(state, curX, curY + curW, null, feedRate);
        emitFeed(state, curX + curL, curY + curW, null, feedRate);
        emitFeed(state, curX + curL, curY, null, feedRate);
        emitFeed(state, curX, curY, null, feedRate);
      } else {
        const startX = curX;
        const startY = curY + curCr;

        emitRapid(state, startX, startY, null);
        if (p === 0) emitRapid(state, null, null, approachZ);

        emitFirstFeed(state, null, null, cutZ, plungeRate);

        emitFeed(state, curX, curY + curW - curCr, null, feedRate);
        addLine(state, `${N(state)} G02 X${fmtCoord(curX + curCr)} Y${fmtCoord(curY + curW)} I${fmtCoord(curCr)} J0`);
        state.lastX = curX + curCr; state.lastY = curY + curW;

        emitFeed(state, curX + curL - curCr, curY + curW, null, feedRate);
        addLine(state, `${N(state)} G02 X${fmtCoord(curX + curL)} Y${fmtCoord(curY + curW - curCr)} I0 J${fmtCoord(-curCr)}`);
        state.lastX = curX + curL; state.lastY = curY + curW - curCr;

        emitFeed(state, curX + curL, curY + curCr, null, feedRate);
        addLine(state, `${N(state)} G02 X${fmtCoord(curX + curL - curCr)} Y${fmtCoord(curY)} I${fmtCoord(-curCr)} J0`);
        state.lastX = curX + curL - curCr; state.lastY = curY;

        emitFeed(state, curX + curCr, curY, null, feedRate);
        addLine(state, `${N(state)} G02 X${fmtCoord(startX)} Y${fmtCoord(startY)} I0 J${fmtCoord(curCr)}`);
        state.lastX = startX; state.lastY = startY;
      }
    }
  } else if (cr <= 0) {
    // Sharp corner rectangle (already offset)
    emitRapid(state, x, y, null);
    emitRapid(state, null, null, approachZ);

    emitFirstFeed(state, null, null, cutZ, plungeRate);

    // Clockwise climb milling: BL -> TL -> TR -> BR -> BL
    emitFeed(state, x, y + W, null, feedRate);
    emitFeed(state, x + L, y + W, null, feedRate);
    emitFeed(state, x + L, y, null, feedRate);
    emitFeed(state, x, y, null, feedRate);
  } else {
    // Rounded corner rectangle (already offset)
    const startX = x;
    const startY = y + cr;

    emitRapid(state, startX, startY, null);
    emitRapid(state, null, null, approachZ);

    emitFirstFeed(state, null, null, cutZ, plungeRate);

    // Line to top-left before corner (UP)
    emitFeed(state, x, y + W - cr, null, feedRate);
    // Arc top-left corner (G02 CW)
    addLine(state, `${N(state)} G02 X${fmtCoord(x + cr)} Y${fmtCoord(y + W)} I${fmtCoord(cr)} J0`);
    state.lastX = x + cr; state.lastY = y + W;

    // Line to top-right before corner (RIGHT)
    emitFeed(state, x + L - cr, y + W, null, feedRate);
    // Arc top-right corner (G02 CW)
    addLine(state, `${N(state)} G02 X${fmtCoord(x + L)} Y${fmtCoord(y + W - cr)} I0 J${fmtCoord(-cr)}`);
    state.lastX = x + L; state.lastY = y + W - cr;

    // Line to bottom-right before corner (DOWN)
    emitFeed(state, x + L, y + cr, null, feedRate);
    // Arc bottom-right corner (G02 CW)
    addLine(state, `${N(state)} G02 X${fmtCoord(x + L - cr)} Y${fmtCoord(y)} I${fmtCoord(-cr)} J0`);
    state.lastX = x + L - cr; state.lastY = y;

    // Line to bottom-left before corner (LEFT)
    emitFeed(state, x + cr, y, null, feedRate);
    // Arc bottom-left corner back to start (G02 CW)
    addLine(state, `${N(state)} G02 X${fmtCoord(startX)} Y${fmtCoord(startY)} I0 J${fmtCoord(cr)}`);
    state.lastX = startX; state.lastY = startY;
  }
}

// ── Emit helpers ──────────────────────────────────────────────

function emitRapid(state, x, y, z) {
  const parts = [N(state), 'G00'];
  let hasCoord = false;
  if (x !== null && x !== undefined && x !== state.lastX) {
    parts.push(`X${fmtCoord(x)}`);
    state.lastX = x;
    hasCoord = true;
  }
  if (y !== null && y !== undefined && y !== state.lastY) {
    parts.push(`Y${fmtCoord(y)}`);
    state.lastY = y;
    hasCoord = true;
  }
  if (z !== null && z !== undefined && z !== state.lastZ) {
    parts.push(`Z${fmtCoord(z)}`);
    state.lastZ = z;
    hasCoord = true;
  }
  if (hasCoord) {
    addLine(state, parts.join(' '));
  }
}

function emitFirstFeed(state, x, y, z, feed) {
  const parts = [N(state), 'G01'];
  if (x !== null && x !== undefined) { parts.push(`X${fmtCoord(x)}`); state.lastX = x; }
  if (y !== null && y !== undefined) { parts.push(`Y${fmtCoord(y)}`); state.lastY = y; }
  if (z !== null && z !== undefined) { parts.push(`Z${fmtCoord(z)}`); state.lastZ = z; }
  parts.push(`F${fmtFeed(feed)}`);
  state.lastF = feed;
  state.isFirstFeed = false;
  addLine(state, parts.join(' '));
}

function emitFeed(state, x, y, z, feed) {
  const parts = [N(state), 'G01'];
  let hasCoord = false;
  if (x !== null && x !== undefined) { parts.push(`X${fmtCoord(x)}`); state.lastX = x; hasCoord = true; }
  if (y !== null && y !== undefined) { parts.push(`Y${fmtCoord(y)}`); state.lastY = y; hasCoord = true; }
  if (z !== null && z !== undefined) { parts.push(`Z${fmtCoord(z)}`); state.lastZ = z; hasCoord = true; }
  // Feed rate only if changed
  if (feed !== state.lastF) {
    parts.push(`F${fmtFeed(feed)}`);
    state.lastF = feed;
  }
  if (hasCoord) {
    addLine(state, parts.join(' '));
  }
}

// ── Format helpers ────────────────────────────────────────────

function N(state) {
  const n = `N${state.lineNum}`;
  state.lineNum += 10;
  return n;
}

function fmtCoord(val) {
  return Number(val).toFixed(3);
}

function fmtFeed(val) {
  return Number(val).toFixed(1);
}

function fmtSpeed(val) {
  return Math.round(val).toString();
}

function conditionalXY(state, axis, val) {
  const key = axis === 'X' ? 'lastX' : 'lastY';
  state[key] = val;
  return `${axis}${fmtCoord(val)}`;
}

function conditionalF(state, feed) {
  if (feed !== state.lastF) return true;
  return false;
}

function addLine(state, text) {
  state.lines.push(text);
}

// ── Arc center calculation ────────────────────────────────────
// Given start(sx,sy), end(ex,ey), radius R, direction (cw/ccw/cw180/ccw180)
// Returns the center point {x, y}
// I and J are incremental from start point

function calcArcCenter(sx, sy, ex, ey, radius, direction) {
  const dx = ex - sx;
  const dy = ey - sy;
  const chordLen = Math.sqrt(dx * dx + dy * dy);

  // If chord is longer than diameter, use half chord as radius
  let R = Math.abs(radius);
  const halfChord = chordLen / 2;
  if (R < halfChord) R = halfChord;

  // Distance from midpoint to center
  const h = Math.sqrt(R * R - halfChord * halfChord);

  // Midpoint
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;

  // Perpendicular unit vector to chord direction
  // Right perpendicular: (dy, -dx) / chordLen
  const perpX = dy / chordLen;
  const perpY = -dx / chordLen;

  // For CW (G02 / Direita): center to the right of travel direction
  // For CCW (G03 / Esquerda): center to the left
  // Major arcs (cw180 / ccw180) invert the sign of h
  if (direction === 'cw') {
    return { x: mx + h * perpX, y: my + h * perpY };
  } else if (direction === 'ccw') {
    return { x: mx - h * perpX, y: my - h * perpY };
  } else if (direction === 'cw180') {
    return { x: mx - h * perpX, y: my - h * perpY };
  } else if (direction === 'ccw180') {
    return { x: mx + h * perpX, y: my + h * perpY };
  } else {
    return { x: mx + h * perpX, y: my + h * perpY };
  }
}

// ── Depth passes ──────────────────────────────────────────────
// Returns array of cumulative depths for each pass

function buildDepthPasses(totalDepth, passDepth) {
  const d = Math.max(0.1, parseFloat(totalDepth) || 0);
  if (!passDepth || passDepth <= 0) return [d];
  const passes = [];
  let remaining = d;
  while (remaining > 0) {
    const cut = Math.min(passDepth, remaining);
    passes.push(d - remaining + cut);
    remaining -= cut;
  }
  return passes.length > 0 ? passes : [d];
}

// ── Park Operation (Machine Positioning) ──────────────────────

function generateParkOp(state, op, actualSafeZ) {
  const px = op.x !== undefined ? op.x : 1850;
  const py = op.y !== undefined ? op.y : 2750;
  const pz = op.z !== undefined ? op.z : 100;
  addLine(state, `( --- PARK POSITIONING --- )`);
  addLine(state, `${N(state)} G00 Z${fmtCoord(pz)}`);
  addLine(state, `${N(state)} G00 X${fmtCoord(px)} Y${fmtCoord(py)}`);
  state.lastX = px;
  state.lastY = py;
  state.lastZ = pz;
}

// ── Drill Operation (Furação) ─────────────────────────────────

function generateDrillOp(state, op, tool, pos, cutZ, feedRate, plungeRate, safeZ, approachZ, isRepeatPass, pieceW, pieceH) {
  const holes = op.holes || getDrillHolesLocal(op, pieceW, pieceH);

  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i];
    
    // Rapid to hole center XY
    emitRapid(state, hole.x, hole.y, null);
    // Rapid to approach Z
    emitRapid(state, null, null, approachZ);
    // Plunge Z to cut depth
    emitFirstFeed(state, null, null, cutZ, plungeRate);
    // Retract Z to approach Z
    emitRapid(state, null, null, approachZ);
  }
}

function getDrillHolesLocal(op, pieceW, pieceH) {
  if (typeof PieceEditor !== 'undefined' && PieceEditor.getDrillHoles) {
    return PieceEditor.getDrillHoles(op, pieceW, pieceH);
  }
  const pw = pieceW || 800;
  const ph = pieceH || 500;
  const startX = App.getOpVal ? App.getOpVal(op, 'x', op.x) : (op.x || 0);
  const startY = App.getOpVal ? App.getOpVal(op, 'y', op.y) : (op.y || 0);
  const qty = Math.max(1, parseInt(App.getOpVal ? App.getOpVal(op, 'qty', op.qty) : op.qty) || 1);
  const dx = qty > 1 ? (App.getOpVal ? App.getOpVal(op, 'dx', op.dx) : (op.dx || 0)) : 0;
  const dy = qty > 1 ? (App.getOpVal ? App.getOpVal(op, 'dy', op.dy) : (op.dy || 0)) : 0;
  const mirrorX = !!op.mirrorX;
  const mirrorY = !!op.mirrorY;

  const holes = [];
  for (let k = 0; k < qty; k++) {
    const instX = startX + k * dx;
    const instY = startY + k * dy;
    holes.push({ x: instX, y: instY });
    if (mirrorX) holes.push({ x: pw - instX, y: instY });
    if (mirrorY) holes.push({ x: instX, y: ph - instY });
    if (mirrorX && mirrorY) holes.push({ x: pw - instX, y: ph - instY });
  }
  return holes;
}

var NCGenerator = {
  generate,
  generateLineOp,
  generateCurveOp,
  generatePathOp,
  generateCircleOp,
  generateRectOp,
  generateParkOp,
  generateDrillOp,
  addLine,
  N,
  fmtCoord,
  fmtFeed,
  fmtSpeed,
  emitRapid,
  emitFirstFeed,
  emitFeed,
  buildDepthPasses
};
