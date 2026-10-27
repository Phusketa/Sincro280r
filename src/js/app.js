// ╔═══════════════════════════════════════════════════════════════╗
// ║  App — Controlador principal Sincro280r NC Generator        ║
// ╚═══════════════════════════════════════════════════════════════╝

var App = {
  operations: [],
  selectedOpIndex: -1,
  editingOpIndex: -1,     // Tracking index when editing existing operation
  currentModalTool: null, // 'line', 'curve', 'path', 'circle', 'rect'
  pathBuilding: null,     // Path state while building
  livePreviewOp: null,    // Dynamic real-time preview operation

  // ── Initialize ──────────────────────────────────────────────

  init() {
    try { this.customVariables = Storage.getCustomVariables(); } catch (e) { console.error(e); }

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Piece dimension inputs
    ['piece-width', 'piece-height', 'piece-depth'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.updatePieceDimensions());
      }
    });

    // Setup draggable pop-up modal header
    this.setupModalDraggable();

    // Real-time live preview input listener on operation modal
    const modalEl = document.getElementById('op-modal');
    if (modalEl) {
      modalEl.addEventListener('input', () => this.updateLivePreview());
      modalEl.addEventListener('change', () => this.updateLivePreview());
    }

    const arrayModalEl = document.getElementById('array-copy-modal');
    if (arrayModalEl) {
      arrayModalEl.addEventListener('input', () => this.updateArrayCopyPreview());
      arrayModalEl.addEventListener('change', () => this.updateArrayCopyPreview());
    }

    // Initialize modules safely
    try { LicenseManager.init(); } catch (e) { console.error(e); }
    try { ToolsManager.init(); } catch (e) { console.error(e); }
    try { PieceEditor.init(); } catch (e) { console.error(e); }
    try { NestingEngine.init(); } catch (e) { console.error(e); }
    try { this.applyTheme(Storage.getTheme()); } catch (e) { console.error(e); }
    try { this.updateLicenseBadge(); } catch (e) { console.error(e); }
    try { this.updateSettingsLicenseUI(); } catch (e) { console.error(e); }
    try { this.applyDemoModeRestrictions(); } catch (e) { console.error(e); }
    try { this.refreshToolSelects(); } catch (e) { console.error(e); }
    try { this.updatePieceDimensions(); } catch (e) { console.error(e); }
    try { this.renderVariablesUI(); } catch (e) { console.error(e); }
    try { this.renderNestingProjects(); } catch (e) { console.error(e); }
  },

  // ── Draggable Modal Window Handler ──────────────────────────

  setupModalDraggable() {
    document.querySelectorAll('.op-modal-dialog').forEach(dialog => {
      const header = dialog.querySelector('.op-modal-header');
      if (!header || header.dataset.dragInit) return;
      header.dataset.dragInit = 'true';

      let isDragging = false;
      let startX = 0, startY = 0;
      let initialLeft = 0, initialTop = 0;

      header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.op-modal-close')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = dialog.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        document.body.style.userSelect = 'none';
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        const maxLeft = window.innerWidth - dialog.offsetWidth - 10;
        const maxTop = window.innerHeight - dialog.offsetHeight - 10;
        newLeft = Math.max(10, Math.min(maxLeft, newLeft));
        newTop = Math.max(10, Math.min(maxTop, newTop));

        dialog.style.left = `${newLeft}px`;
        dialog.style.top = `${newTop}px`;
        dialog.style.transform = 'none';
      });

      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          document.body.style.userSelect = '';
        }
      });
    });
  },

  customVariables: {},

  // ── Project Variables Engine ────────────────────────────────

  getVariablesContext() {
    const pw = this.parseInputVal('piece-width', 800);
    const ph = this.parseInputVal('piece-height', 500);
    const pd = this.parseInputVal('piece-depth', 15);

    const ctx = {
      L: pw,
      A: ph,
      E: pd
    };

    if (this.customVariables) {
      for (const [k, rawExpr] of Object.entries(this.customVariables)) {
        const keyUpper = k.toUpperCase();
        ctx[keyUpper] = this.evalExprRaw(rawExpr, ctx);
      }
    }

    return ctx;
  },

  evalExprRaw(strVal, ctx) {
    if (strVal === null || strVal === undefined) return 0;
    if (typeof strVal === 'number') return strVal;
    let s = String(strVal).trim();
    if (s === '') return 0;

    const num = Number(s);
    if (!isNaN(num)) return num;

    const keys = Object.keys(ctx).sort((a, b) => b.length - a.length);
    let expr = s;
    for (const k of keys) {
      const reg = new RegExp(`\\b${k}\\b`, 'gi');
      expr = expr.replace(reg, `(${ctx[k]})`);
    }

    try {
      if (!/^[0-9\.\+\-\*\/\(\)\s]+$/.test(expr)) return 0;
      const res = new Function(`"use strict"; return (${expr});`)();
      return (typeof res === 'number' && !isNaN(res) && isFinite(res)) ? res : 0;
    } catch (e) {
      return 0;
    }
  },

  evalExpr(val, fallback = 0) {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'number') return val;
    let str = String(val).trim();
    if (str === '') return fallback;

    const num = Number(str);
    if (!isNaN(num)) return num;

    const ctx = this.getVariablesContext();
    return this.evalExprRaw(str, ctx);
  },

  getRawInputVal(id, fallback = '0') {
    const el = document.getElementById(id);
    if (!el || el.value.trim() === '') return String(fallback);
    return el.value.trim();
  },

  parseInputVal(id, fallback = 0) {
    const el = document.getElementById(id);
    if (!el || el.value.trim() === '') return fallback;
    return this.evalExpr(el.value, fallback);
  },

  getOpVal(op, key, fallback = 0) {
    if (!op) return fallback;
    const rawKey = 'raw' + key.charAt(0).toUpperCase() + key.slice(1);
    const val = op[rawKey] !== undefined ? op[rawKey] : op[key];
    return this.evalExpr(val, fallback);
  },

  editingVarName: null,

  addCustomVariable() {
    const nameEl = document.getElementById('new-var-name');
    const valEl = document.getElementById('new-var-val');
    if (!nameEl || !valEl) return;

    let name = nameEl.value.trim().toUpperCase();
    let rawVal = valEl.value.trim();

    if (!name) {
      showToast('Por favor, informe a letra da variável.', 'error');
      return;
    }

    // Reserved letters: L, A, E, Z
    if (['L', 'A', 'E', 'Z'].includes(name)) {
      showToast(`A letra '${name}' é reservada pelo sistema (L=Largura, A=Altura, E=Espessura, Z=Reservado) e não pode ser alterada.`, 'error');
      return;
    }

    if (!/^[A-Z][A-Z0-9]*$/.test(name)) {
      showToast('Nome de variável inválido. Use letras (Ex: C, B, D).', 'error');
      return;
    }

    if (!rawVal) {
      showToast('Por favor, informe um valor ou expressão para a variável.', 'error');
      return;
    }

    if (this.editingVarName && this.editingVarName !== name) {
      delete this.customVariables[this.editingVarName];
    }

    this.customVariables[name] = rawVal;
    this.editingVarName = null;
    Storage.saveCustomVariables(this.customVariables);

    nameEl.value = '';
    valEl.value = '';
    const btn = document.getElementById('btn-save-var');
    if (btn) btn.textContent = '+';

    this.renderVariablesUI();
    PieceEditor.draw();
    showToast(`Variável ${name} = ${rawVal} salva!`, 'success');
  },

  editCustomVariable(name) {
    if (!this.customVariables[name]) return;
    const rawVal = this.customVariables[name];

    const nameEl = document.getElementById('new-var-name');
    const valEl = document.getElementById('new-var-val');
    const btn = document.getElementById('btn-save-var');

    if (nameEl) nameEl.value = name;
    if (valEl) {
      valEl.value = rawVal;
      valEl.focus();
    }
    if (btn) btn.textContent = '💾';

    this.editingVarName = name;
    showToast(`Editando variável ${name}...`, 'info');
  },

  deleteCustomVariable(name) {
    delete this.customVariables[name];
    Storage.saveCustomVariables(this.customVariables);
    if (this.editingVarName === name) {
      this.editingVarName = null;
      const nameEl = document.getElementById('new-var-name');
      const valEl = document.getElementById('new-var-val');
      const btn = document.getElementById('btn-save-var');
      if (nameEl) nameEl.value = '';
      if (valEl) valEl.value = '';
      if (btn) btn.textContent = '+';
    }
    this.renderVariablesUI();
    PieceEditor.draw();
    showToast(`Variável ${name} removida.`, 'info');
  },

  renderVariablesUI() {
    const ctx = this.getVariablesContext();
    const elL = document.getElementById('var-val-L');
    const elA = document.getElementById('var-val-A');
    const elE = document.getElementById('var-val-E');

    if (elL) elL.textContent = `${ctx.L} mm`;
    if (elA) elA.textContent = `${ctx.A} mm`;
    if (elE) elE.textContent = `${ctx.E} mm`;

    const tbody = document.getElementById('vars-table-body');
    if (!tbody) return;

    // Remove old custom rows while keeping system fixed rows L, A, E
    tbody.querySelectorAll('.var-row-custom').forEach(r => r.remove());

    // Append custom variables rows
    const entries = Object.entries(this.customVariables);
    entries.forEach(([name, rawExpr]) => {
      const evalVal = ctx[name] !== undefined ? ctx[name] : this.evalExpr(rawExpr);
      const tr = document.createElement('tr');
      tr.className = 'var-row-custom';
      tr.innerHTML = `
        <td style="color: #00e676; font-weight: 700;">${name}</td>
        <td style="font-family: monospace;">${rawExpr} <span style="color: #888; font-size: 10px;">(${evalVal} mm)</span></td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="var-action-btn" onclick="App.editCustomVariable('${name}')" title="Editar Variável">✏️</button>
          <button class="var-action-btn del" onclick="App.deleteCustomVariable('${name}')" title="Excluir Variável">✕</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  // ── Live Vectorization Dynamic Preview Handler ─────────────

  updateLivePreview() {
    if (!this.currentModalTool) {
      this.livePreviewOp = null;
      PieceEditor.draw();
      return;
    }

    const sx = this.parseInputVal('modal-sx', 0);
    const sy = this.parseInputVal('modal-sy', 0);
    const ex = this.parseInputVal('modal-ex', 100);
    const ey = this.parseInputVal('modal-ey', 0);
    const w = this.parseInputVal('modal-groove-w', 6);
    const d = this.parseInputVal('modal-groove-d', 5);
    const corr = document.getElementById('modal-correction').value || 'meio';

    if (this.currentModalTool === 'line') {
      this.livePreviewOp = {
        type: 'line',
        correction: corr,
        startX: sx, startY: sy,
        endX: ex, endY: ey,
        grooveWidth: w, depth: d
      };
    } else if (this.currentModalTool === 'curve') {
      const r = this.parseInputVal('modal-radius', 50);
      const dir = document.getElementById('modal-dir').value || 'cw';
      this.livePreviewOp = {
        type: 'curve',
        correction: corr,
        startX: sx, startY: sy,
        endX: ex, endY: ey,
        radius: r, curveDirection: dir,
        grooveWidth: w, depth: d
      };
    } else if (this.currentModalTool === 'circle') {
      const cx = this.parseInputVal('modal-circle-cx', 0);
      const cy = this.parseInputVal('modal-circle-cy', 0);
      const r = this.parseInputVal('modal-circle-r', 50);
      const pocket = document.getElementById('modal-circle-pocket')?.checked || false;
      this.livePreviewOp = {
        type: 'circle',
        correction: corr,
        centerX: cx, centerY: cy,
        radius: r, isPocket: pocket,
        grooveWidth: w, depth: d
      };
    } else if (this.currentModalTool === 'rect') {
      const rx = this.parseInputVal('modal-rect-x', 0);
      const ry = this.parseInputVal('modal-rect-y', 0);
      const rl = this.parseInputVal('modal-rect-l', 100);
      const rw = this.parseInputVal('modal-rect-w', 100);
      const rr = this.parseInputVal('modal-rect-r', 0);
      const pocket = document.getElementById('modal-rect-pocket')?.checked || false;
      this.livePreviewOp = {
        type: 'rect',
        correction: corr,
        x: rx, y: ry,
        length: rl, width: rw,
        cornerRadius: rr,
        isPocket: pocket,
        grooveWidth: w, depth: d
      };
    } else if (this.currentModalTool === 'drill') {
      const dx = this.parseInputVal('modal-drill-x', 50);
      const dy = this.parseInputVal('modal-drill-y', 50);
      const selEl = document.getElementById('modal-drill-diameter');
      const diameter = selEl ? parseFloat(selEl.value) || 8 : 8;
      const depth = this.parseInputVal('modal-drill-depth', 15);
      const qty = Math.max(1, parseInt(this.parseInputVal('modal-drill-qty', 1)) || 1);
      const stepX = qty > 1 ? this.parseInputVal('modal-drill-dx', 32) : 0;
      const stepY = qty > 1 ? this.parseInputVal('modal-drill-dy', 0) : 0;
      const mirrorX = document.getElementById('modal-drill-mirror-x')?.checked || false;
      const mirrorY = document.getElementById('modal-drill-mirror-y')?.checked || false;

      this.livePreviewOp = {
        type: 'drill',
        x: dx, y: dy,
        diameter, depth,
        qty, dx: stepX, dy: stepY,
        mirrorX, mirrorY
      };
    } else if (this.currentModalTool === 'path') {
      if (this.pathBuilding) {
        const pb = this.pathBuilding;
        const w = this.parseInputVal('path-groove-w', 6);
        const d = this.parseInputVal('path-groove-d', 5);
        const toolId = document.getElementById('path-tool-select')?.value;

        // Base start point
        let startPt = {
          x: this.evalExpr(pb.startPoint.x),
          y: this.evalExpr(pb.startPoint.y)
        };

        // Base segments list
        let tempSegs = (pb.segments || []).map(s => ({
          type: s.type,
          endX: this.evalExpr(s.endX),
          endY: this.evalExpr(s.endY),
          radius: s.radius ? this.evalExpr(s.radius) : 50,
          curveDirection: s.curveDirection || 'cw'
        }));

        // Read active input field values for live preview as user types
        const xInput = document.getElementById('pseg-x')?.value;
        const yInput = document.getElementById('pseg-y')?.value;
        const rInput = document.getElementById('pseg-radius')?.value;

        if (pb.selectedSegIndex === 0) {
          // Live editing Ponto Inicial (ID 0)
          if (xInput !== undefined && yInput !== undefined && xInput.trim() !== '' && yInput.trim() !== '') {
            startPt = {
              x: this.evalExpr(xInput),
              y: this.evalExpr(yInput)
            };
          }
        } else if (pb.selectedSegIndex === -1) {
          // Live adding new segment as user types
          if (xInput !== undefined && yInput !== undefined && (xInput.trim() !== '' || yInput.trim() !== '')) {
            const draftX = this.evalExpr(xInput || '0');
            const draftY = this.evalExpr(yInput || '0');
            if (pb.activeType === 'line') {
              tempSegs.push({ type: 'line', endX: draftX, endY: draftY });
            } else if (pb.activeType === 'curve') {
              const draftR = this.evalExpr(rInput || '50');
              tempSegs.push({ type: 'curve', endX: draftX, endY: draftY, radius: draftR, curveDirection: pb.activeDir || 'cw' });
            }
          }
        } else if (pb.selectedSegIndex > 0) {
          // Live editing existing segment
          const idx = pb.selectedSegIndex - 1;
          if (tempSegs[idx] && xInput !== undefined && yInput !== undefined) {
            tempSegs[idx].endX = this.evalExpr(xInput || '0');
            tempSegs[idx].endY = this.evalExpr(yInput || '0');
            if (tempSegs[idx].type === 'curve' && rInput !== undefined) {
              tempSegs[idx].radius = this.evalExpr(rInput || '50');
              tempSegs[idx].curveDirection = pb.activeDir || 'cw';
            }
          }
        }

        const closedEl = document.getElementById('path-closed');
        this.livePreviewOp = {
          type: 'path',
          correction: pb.correction || 'meio',
          startPoint: startPt,
          segments: tempSegs,
          closed: closedEl ? closedEl.checked : false,
          grooveWidth: w,
          depth: d,
          toolId: toolId
        };
      }
    }

    PieceEditor.draw();
  },

  // ── Tab Switching ───────────────────────────────────────────

  switchTab(tabId) {
    const status = LicenseManager.getLicenseStatus();
    const isDemoMode = !status.isActivated && !status.isTrial;

    if (isDemoMode && (tabId === 'nesting-tab' || tabId === 'viewer-tab')) {
      showToast('No modo DEMO, as abas Nesting e Visualizador NC ficam desativadas. Ative sua licença para liberar.', 'error');
      this.openLicenseModal();
      return;
    }

    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

    if (tabId === 'piece-tab') {
      PieceEditor.resizeCanvas();
    } else if (tabId === 'tools-tab') {
      setTimeout(() => Tool3DRenderer.resizeCanvas(), 50);
    } else if (tabId === 'nesting-tab') {
      setTimeout(() => {
        NestingEngine.resizeCanvas();
        this.renderNestingProjects();
      }, 50);
    } else if (tabId === 'viewer-tab') {
      setTimeout(() => {
        NCViewer.init();
        NCViewer.resizeCanvas();
      }, 50);
    } else if (tabId === 'settings-tab') {
      this.updateSettingsLicenseUI();
    }
  },

  loadNestingToViewer() {
    const status = LicenseManager.getLicenseStatus();
    if (!status.isActivated && !status.isTrial) {
      showToast('No modo DEMO, o Visualizador NC fica desativado.', 'error');
      this.openLicenseModal();
      return;
    }
    const toolId = document.getElementById('nesting-cutter-select')?.value;
    const tool = Storage.getToolById(toolId);
    if (!tool) {
      showToast('Selecione a fresa de corte no Nesting antes de visualizar.', 'warning');
      return;
    }
    const ncText = NestingEngine.generateMasterGCode(tool, 10, 2);
    if (!ncText) {
      showToast('Execute o cálculo do Plano de Corte antes de visualizar.', 'warning');
      return;
    }
    NCViewer.loadNCText(ncText, `Plano_Nesting_${NestingEngine.sheetW}x${NestingEngine.sheetH}.NC`);
    this.switchTab('viewer-tab');
    showToast('G-Code do Nesting carregado no Visualizador!', 'success');
  },

  loadEditorPieceToViewer() {
    const status = LicenseManager.getLicenseStatus();
    if (!status.isActivated && !status.isTrial) {
      showToast('No modo DEMO, o Visualizador NC fica desativado.', 'error');
      this.openLicenseModal();
      return;
    }
    const pw = this.parseInputVal('piece-width', 800);
    const ph = this.parseInputVal('piece-height', 500);
    const pd = this.parseInputVal('piece-depth', 15);
    const name = document.getElementById('piece-name')?.value || 'peca';
    const safeZ = this.parseInputVal('safe-z', 10);
    const approachZ = this.parseInputVal('approach-z', 2);

    const ncText = NCGenerator.generate(name, pw, ph, pd, this.operations, safeZ, approachZ);
    if (!ncText) {
      showToast('Nenhuma operação válida para gerar o código G.', 'warning');
      return;
    }
    NCViewer.loadNCText(ncText, `${name}_${pw}x${ph}x${pd}.NC`);
    this.switchTab('viewer-tab');
    showToast(`Peça "${name}" carregada no Visualizador!`, 'success');
  },

  // ── Piece Dimensions ───────────────────────────────────────

  togglePieceGrain() {
    const status = LicenseManager.getLicenseStatus();
    const isDemoMode = !status.isActivated && !status.isTrial;
    if (isDemoMode) {
      document.getElementById('piece-grain').checked = false;
      showToast('No modo DEMO, o marcação de veio da madeira fica desativada.', 'error');
      this.openLicenseModal();
      return;
    }
    const isChecked = document.getElementById('piece-grain')?.checked || false;
    PieceEditor.hasGrain = isChecked;
    PieceEditor.draw();
  },

  updatePieceDimensions() {
    let w = this.parseInputVal('piece-width', 800);
    let h = this.parseInputVal('piece-height', 500);
    const d = this.parseInputVal('piece-depth', 15);
    const hasGrain = document.getElementById('piece-grain')?.checked || false;

    if (w > 1850) {
      showToast('Limite do eixo X (L) excedido! O limite físico da máquina é 1850mm.', 'warning');
      w = 1850;
      document.getElementById('piece-width').value = 1850;
    }
    if (h > 2750) {
      showToast('Limite do eixo Y (A) excedido! O limite físico da máquina é 2750mm.', 'warning');
      h = 2750;
      document.getElementById('piece-height').value = 2750;
    }

    PieceEditor.setPieceDimensions(w, h, d, hasGrain);
    this.updateCanvasInfo();
    this.renderVariablesUI();
    this.renderOperationsList();
    PieceEditor.draw();
  },

  updateCanvasInfo() {
    const w = document.getElementById('piece-width').value || 800;
    const h = document.getElementById('piece-height').value || 500;
    const d = document.getElementById('piece-depth').value || 15;
    document.getElementById('canvas-dims').textContent = `${w} × ${h} × ${d}`;
    document.getElementById('canvas-ops').textContent = this.operations.length;
  },

  // ── Tool Selection & Pop-up Modal ────────────────────────────

  openToolModal(toolType, editIndex = -1) {
    this.currentModalTool = toolType;
    this.editingOpIndex = editIndex;

    const modal = document.getElementById('op-modal');
    const dialog = document.querySelector('.op-modal-dialog');
    const opGrid = document.querySelector('#op-modal .op-modal-grid');
    const title = document.getElementById('op-modal-title');
    const lineCoordsFields = document.getElementById('modal-line-coords-fields');
    const curveFields = document.getElementById('modal-curve-fields');
    const pathFields = document.getElementById('modal-path-fields');
    const circleFields = document.getElementById('modal-circle-fields');
    const rectFields = document.getElementById('modal-rect-fields');
    const drillFields = document.getElementById('modal-drill-fields');
    const icon = document.getElementById('op-modal-icon');
    const isEdit = editIndex >= 0;

    this.refreshToolSelects();

    // Default visibility hide all specific sections
    if (lineCoordsFields) lineCoordsFields.classList.add('hidden');
    if (curveFields) curveFields.classList.add('hidden');
    if (pathFields) pathFields.classList.add('hidden');
    if (circleFields) circleFields.classList.add('hidden');
    if (rectFields) rectFields.classList.add('hidden');
    if (drillFields) drillFields.classList.add('hidden');

    if (toolType === 'line') {
      if (dialog) dialog.classList.remove('wide-dialog');
      if (opGrid) opGrid.classList.remove('hidden');
      if (title) title.textContent = isEdit ? 'Editar Linha' : 'Adicionar Linha';
      if (icon) icon.textContent = '╱';
      if (lineCoordsFields) lineCoordsFields.classList.remove('hidden');
    } else if (toolType === 'curve') {
      if (dialog) dialog.classList.remove('wide-dialog');
      if (opGrid) opGrid.classList.remove('hidden');
      if (title) title.textContent = isEdit ? 'Editar Curva' : 'Adicionar Curva';
      if (icon) icon.textContent = '◠';
      if (lineCoordsFields) lineCoordsFields.classList.remove('hidden');
      if (curveFields) curveFields.classList.remove('hidden');
    } else if (toolType === 'path') {
      if (dialog) dialog.classList.add('wide-dialog');
      if (opGrid) opGrid.classList.add('hidden');
      if (title) title.textContent = isEdit ? 'Editar Caminho' : 'Adicionar Caminho';
      if (icon) icon.textContent = '⬡';
      if (pathFields) pathFields.classList.remove('hidden');

      const selTool = document.getElementById('path-tool-select');
      if (selTool) selTool.innerHTML = this.buildToolOptionsHTML();

      if (isEdit && this.operations[editIndex]) {
        const op = this.operations[editIndex];
        this.pathBuilding = {
          toolId: op.toolId,
          grooveWidth: op.rawGrooveWidth !== undefined ? op.rawGrooveWidth : (op.grooveWidth || 6),
          depth: op.rawDepth !== undefined ? op.rawDepth : (op.depth || 5),
          correction: op.correction || 'meio',
          closed: !!op.closed,
          selectedSegIndex: 0,
          activeType: 'line',
          activeDir: 'cw',
          startPoint: {
            x: op.rawStartX !== undefined ? op.rawStartX : (op.startPoint?.x !== undefined ? op.startPoint.x : (op.startX !== undefined ? op.startX : 0)),
            y: op.rawStartY !== undefined ? op.rawStartY : (op.startPoint?.y !== undefined ? op.startPoint.y : (op.startY !== undefined ? op.startY : 0))
          },
          segments: JSON.parse(JSON.stringify(op.segments || []))
        };
      } else {
        this.pathBuilding = {
          toolId: selTool ? selTool.value : 't1',
          grooveWidth: 6,
          depth: 5,
          correction: 'meio',
          closed: false,
          selectedSegIndex: 0,
          activeType: 'line',
          activeDir: 'cw',
          startPoint: { x: 0, y: 0 },
          segments: []
        };
      }

      const gwEl = document.getElementById('path-groove-w');
      const gdEl = document.getElementById('path-groove-d');
      const closedEl = document.getElementById('path-closed');
      const pathOrganicContainer = document.getElementById('path-organic-container');
      const pathOrganicCb = document.getElementById('path-is-organic');
      const editOp = (isEdit && this.operations[editIndex]) ? this.operations[editIndex] : null;

      if (gwEl) gwEl.value = this.pathBuilding.grooveWidth;
      if (gdEl) gdEl.value = this.pathBuilding.depth;
      if (selTool && this.pathBuilding.toolId) selTool.value = this.pathBuilding.toolId;
      if (closedEl) closedEl.checked = !!this.pathBuilding.closed;

      const isPathClosed = !!this.pathBuilding.closed;
      if (pathOrganicContainer) pathOrganicContainer.style.display = isPathClosed ? 'flex' : 'none';
      if (pathOrganicCb) {
        pathOrganicCb.disabled = !isPathClosed;
        pathOrganicCb.checked = isPathClosed && editOp ? !!editOp.isOrganicContour : false;
      }

      this.pathSelectCorrection(this.pathBuilding.correction);
      this.renderPathBuilderUI();
    } else if (toolType === 'circle') {
      if (dialog) dialog.classList.remove('wide-dialog');
      if (opGrid) opGrid.classList.remove('hidden');
      if (title) title.textContent = isEdit ? 'Editar Círculo' : 'Adicionar Círculo';
      if (icon) icon.textContent = '◯';
      if (circleFields) circleFields.classList.remove('hidden');
    } else if (toolType === 'rect') {
      if (dialog) dialog.classList.remove('wide-dialog');
      if (opGrid) opGrid.classList.remove('hidden');
      if (title) title.textContent = isEdit ? 'Editar Retângulo' : 'Adicionar Retângulo';
      if (icon) icon.textContent = '▭';
      if (rectFields) rectFields.classList.remove('hidden');
    } else if (toolType === 'drill') {
      if (dialog) dialog.classList.remove('wide-dialog');
      if (opGrid) opGrid.classList.remove('hidden');
      if (title) title.textContent = isEdit ? 'Editar Furação' : 'Adicionar Furação';
      if (icon) icon.textContent = '🎯';
      if (drillFields) drillFields.classList.remove('hidden');
      this.populateDrillDiameters();
    }

    const modalCols = document.querySelectorAll('#op-modal .op-modal-col');
    if (toolType === 'drill') {
      if (modalCols[1]) modalCols[1].style.display = 'none';
      if (modalCols[0]) modalCols[0].style.flex = '1';
    } else {
      if (modalCols[1]) modalCols[1].style.display = '';
      if (modalCols[0]) modalCols[0].style.flex = '';
    }

    // Populate existing data if editing non-path tools
    if (isEdit && this.operations[editIndex] && toolType !== 'path') {
      const op = this.operations[editIndex];
      this.setModalCorrection(op.correction || 'meio');
      const gwEl = document.getElementById('modal-groove-w');
      const gdEl = document.getElementById('modal-groove-d');
      if (gwEl) gwEl.value = op.rawGrooveWidth !== undefined ? op.rawGrooveWidth : (op.grooveWidth !== undefined ? op.grooveWidth : 6);
      if (gdEl) gdEl.value = op.rawDepth !== undefined ? op.rawDepth : (op.depth !== undefined ? op.depth : 5);

      const selTool = document.getElementById('modal-tool-select');
      if (selTool && op.toolId) selTool.value = op.toolId;

      if (op.type === 'line' || op.type === 'curve') {
        const sxEl = document.getElementById('modal-sx');
        const syEl = document.getElementById('modal-sy');
        const exEl = document.getElementById('modal-ex');
        const eyEl = document.getElementById('modal-ey');
        if (sxEl) sxEl.value = op.rawStartX !== undefined ? op.rawStartX : (op.startX !== undefined ? op.startX : 0);
        if (syEl) syEl.value = op.rawStartY !== undefined ? op.rawStartY : (op.startY !== undefined ? op.startY : 0);
        if (exEl) exEl.value = op.rawEndX !== undefined ? op.rawEndX : (op.endX !== undefined ? op.endX : 100);
        if (eyEl) eyEl.value = op.rawEndY !== undefined ? op.rawEndY : (op.endY !== undefined ? op.endY : 0);
      }

      if (op.type === 'curve') {
        const rEl = document.getElementById('modal-radius');
        const dirEl = document.getElementById('modal-dir');
        if (rEl) rEl.value = op.rawRadius !== undefined ? op.rawRadius : (op.radius !== undefined ? op.radius : 50);
        if (dirEl) dirEl.value = op.curveDirection || 'cw';
      } else if (op.type === 'circle') {
        const cxEl = document.getElementById('modal-circle-cx');
        const cyEl = document.getElementById('modal-circle-cy');
        const rEl = document.getElementById('modal-circle-r');
        if (cxEl) cxEl.value = op.rawCenterX !== undefined ? op.rawCenterX : (op.centerX !== undefined ? op.centerX : 0);
        if (cyEl) cyEl.value = op.rawCenterY !== undefined ? op.rawCenterY : (op.centerY !== undefined ? op.centerY : 0);
        if (rEl) rEl.value = op.rawRadius !== undefined ? op.rawRadius : (op.radius !== undefined ? op.radius : 50);
        const pCheck = document.getElementById('modal-circle-pocket');
        if (pCheck) pCheck.checked = !!op.isPocket;
      } else if (op.type === 'rect') {
        const rxEl = document.getElementById('modal-rect-x');
        const ryEl = document.getElementById('modal-rect-y');
        const rlEl = document.getElementById('modal-rect-l');
        const rwEl = document.getElementById('modal-rect-w');
        const rrEl = document.getElementById('modal-rect-r');
        if (rxEl) rxEl.value = op.rawX !== undefined ? op.rawX : (op.x !== undefined ? op.x : 0);
        if (ryEl) ryEl.value = op.rawY !== undefined ? op.rawY : (op.y !== undefined ? op.y : 0);
        if (rlEl) rlEl.value = op.rawLength !== undefined ? op.rawLength : (op.length !== undefined ? op.length : 100);
        if (rwEl) rwEl.value = op.rawWidth !== undefined ? op.rawWidth : (op.width !== undefined ? op.width : 100);
        if (rrEl) rrEl.value = op.rawCornerRadius !== undefined ? op.rawCornerRadius : (op.cornerRadius !== undefined ? op.cornerRadius : 0);
        const pCheck = document.getElementById('modal-rect-pocket');
        if (pCheck) pCheck.checked = !!op.isPocket;
      } else if (op.type === 'drill') {
        const dxEl = document.getElementById('modal-drill-x');
        const dyEl = document.getElementById('modal-drill-y');
        const diamEl = document.getElementById('modal-drill-diameter');
        const dpEl = document.getElementById('modal-drill-depth');
        const qtyEl = document.getElementById('modal-drill-qty');
        const stepXEl = document.getElementById('modal-drill-dx');
        const stepYEl = document.getElementById('modal-drill-dy');
        const mxEl = document.getElementById('modal-drill-mirror-x');
        const myEl = document.getElementById('modal-drill-mirror-y');

        if (dxEl) dxEl.value = op.rawX !== undefined ? op.rawX : (op.x !== undefined ? op.x : 50);
        if (dyEl) dyEl.value = op.rawY !== undefined ? op.rawY : (op.y !== undefined ? op.y : 50);
        if (diamEl) diamEl.value = op.rawDiameter !== undefined ? op.rawDiameter : (op.diameter !== undefined ? op.diameter : 8);
        if (dpEl) dpEl.value = op.rawDepth !== undefined ? op.rawDepth : (op.depth !== undefined ? op.depth : 15);
        if (qtyEl) qtyEl.value = op.rawQty !== undefined ? op.rawQty : (op.qty !== undefined ? op.qty : 1);
        if (stepXEl) stepXEl.value = op.rawDx !== undefined ? op.rawDx : (op.dx !== undefined ? op.dx : 32);
        if (stepYEl) stepYEl.value = op.rawDy !== undefined ? op.rawDy : (op.dy !== undefined ? op.dy : 0);
        if (mxEl) mxEl.checked = !!op.mirrorX;
        if (myEl) myEl.checked = !!op.mirrorY;

        this.updateDrillQtyState();
      }

      const organicCb = document.getElementById('modal-is-organic');
      if (organicCb) organicCb.checked = !!op.isOrganicContour;
    } else {
      const organicCb = document.getElementById('modal-is-organic');
      if (organicCb) organicCb.checked = false;
      const pCheckRect = document.getElementById('modal-rect-pocket');
      if (pCheckRect) pCheckRect.checked = false;
    }

    const organicContainer = document.getElementById('modal-organic-container');
    const organicCb = document.getElementById('modal-is-organic');
    let canBeOrganic = false;

    if (toolType === 'circle' || toolType === 'rect') {
      canBeOrganic = true;
    } else if (toolType === 'path') {
      const editOp = (isEdit && this.operations[editIndex]) ? this.operations[editIndex] : null;
      canBeOrganic = editOp ? !!editOp.closed : (this.pathBuilding ? !!this.pathBuilding.closed : false);
    }

    if (organicContainer) {
      organicContainer.style.display = canBeOrganic ? 'flex' : 'none';
    }
    if (organicCb) {
      organicCb.disabled = !canBeOrganic;
      if (!canBeOrganic) organicCb.checked = false;
    }

    if (dialog) {
      const modalWidth = toolType === 'path' ? 780 : 530;
      const defaultLeft = Math.max(20, Math.round((window.innerWidth - modalWidth) / 2));
      const defaultTop = Math.max(40, Math.round((window.innerHeight - 500) / 2));
      dialog.style.left = `${defaultLeft}px`;
      dialog.style.top = `${defaultTop}px`;
    }

    if (modal) modal.classList.add('open');
    try {
      this.updateLivePreview();
    } catch (e) {
      console.warn('Erro ao atualizar preview:', e);
    }
  },

  closeToolModal() {
    const modal = document.getElementById('op-modal');
    if (modal) modal.classList.remove('open');
    const dialog = document.querySelector('#op-modal .op-modal-dialog');
    if (dialog) dialog.classList.remove('wide-dialog');
    const opGrid = document.querySelector('#op-modal .op-modal-grid');
    if (opGrid) opGrid.classList.remove('hidden');
    const modalCols = document.querySelectorAll('#op-modal .op-modal-col');
    if (modalCols[1]) modalCols[1].style.display = '';
    if (modalCols[0]) modalCols[0].style.flex = '';
    this.currentModalTool = null;
    this.editingOpIndex = -1;
    this.pathBuilding = null;
    this.livePreviewOp = null;
    PieceEditor.draw();
  },

  setModalCorrection(val) {
    document.getElementById('modal-correction').value = val;
    document.querySelectorAll('.correction-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === val);
    });
    this.updateLivePreview();
  },

  submitToolModal() {
    if (this.currentModalTool === 'line') {
      this.addLine();
    } else if (this.currentModalTool === 'curve') {
      this.addCurve();
    } else if (this.currentModalTool === 'path') {
      this.pathFinish();
    } else if (this.currentModalTool === 'circle') {
      this.addCircle();
    } else if (this.currentModalTool === 'rect') {
      this.addRect();
    } else if (this.currentModalTool === 'drill') {
      this.addDrill();
    }
  },

  populateDrillDiameters() {
    const sel = document.getElementById('modal-drill-diameter');
    if (!sel) return;

    const mag = Storage.getMagazine();
    const activeDrillTools = [];

    for (let pos = 21; pos <= 30; pos++) {
      const toolId = mag[pos];
      if (toolId) {
        const tool = Storage.getToolById(toolId);
        if (tool && tool.type === 'broca') {
          activeDrillTools.push({ slot: pos, tool });
        }
      }
    }

    if (activeDrillTools.length === 0) {
      sel.innerHTML = '<option value="">(Nenhuma broca ativa no cabeçote T21-T30)</option>';
      sel.disabled = true;
      return;
    }

    sel.disabled = false;
    let html = '';
    activeDrillTools.forEach(item => {
      html += `<option value="${item.tool.diameter}" data-tool-id="${item.tool.id}">Ø ${item.tool.diameter}mm — ${item.tool.name} (T${item.slot})</option>`;
    });
    sel.innerHTML = html;
  },

  onDrillDiameterChange() {
    const selEl = document.getElementById('modal-drill-diameter');
    if (!selEl || selEl.disabled) return;
    this.updateLivePreview();
  },

  updateDrillQtyState() {
    const qtyInput = document.getElementById('modal-drill-qty')?.value;
    const qty = parseInt(this.evalExpr(qtyInput || '1')) || 1;
    const dxEl = document.getElementById('modal-drill-dx');
    const dyEl = document.getElementById('modal-drill-dy');

    const isDisabled = qty <= 1;
    if (dxEl) dxEl.disabled = isDisabled;
    if (dyEl) dyEl.disabled = isDisabled;
  },

  addDrill() {
    const selEl = document.getElementById('modal-drill-diameter');
    if (!selEl || selEl.disabled || !selEl.value) {
      showToast('Nenhuma broca ativa disponível no cabeçote (T21 a T30). Cadastre uma broca no Magazine.', 'error');
      return;
    }

    const selectedOpt = selEl.options[selEl.selectedIndex];
    const toolId = selectedOpt ? selectedOpt.getAttribute('data-tool-id') : null;
    const diameter = parseFloat(selEl.value) || 8;

    if (!toolId) {
      showToast('Ferramenta do cabeçote de furação inválida.', 'error');
      return;
    }

    const isEdit = this.editingOpIndex >= 0;
    const rawX = this.getRawInputVal('modal-drill-x', '50');
    const rawY = this.getRawInputVal('modal-drill-y', '50');
    const rawDepth = this.getRawInputVal('modal-drill-depth', '15');
    const rawQty = this.getRawInputVal('modal-drill-qty', '1');
    const rawDx = this.getRawInputVal('modal-drill-dx', '32');
    const rawDy = this.getRawInputVal('modal-drill-dy', '0');
    const mirrorX = document.getElementById('modal-drill-mirror-x')?.checked || false;
    const mirrorY = document.getElementById('modal-drill-mirror-y')?.checked || false;

    const op = {
      id: isEdit ? this.operations[this.editingOpIndex].id : Storage.generateId(),
      type: 'drill',
      toolId,
      diameter,
      rawDiameter: String(diameter),
      rawX, x: this.evalExpr(rawX),
      rawY, y: this.evalExpr(rawY),
      rawDepth, depth: this.evalExpr(rawDepth),
      rawQty, qty: Math.max(1, parseInt(this.evalExpr(rawQty)) || 1),
      rawDx, dx: this.evalExpr(rawDx),
      rawDy, dy: this.evalExpr(rawDy),
      mirrorX, mirrorY
    };

    if (isEdit) {
      this.operations[this.editingOpIndex] = op;
    } else {
      this.operations.push(op);
    }

    this.ensureParkAtEnd();
    this.renderOperationsList();
    PieceEditor.draw();
    this.updateCanvasInfo();
    this.closeToolModal();
    showToast(isEdit ? 'Furação atualizada!' : 'Furação adicionada!', 'success');
  },

  // ── Refresh Tool Selects ────────────────────────────────────

  buildToolOptionsHTML() {
    const tools = Storage.getTools();
    tools.forEach(t => Storage.autoAssignToolToMagazine(t.id));
    const mag = Storage.getMagazine();

    let options = '<option value="">— Selecione a Fresa —</option>';
    for (let pos = 1; pos <= 14; pos++) {
      const toolId = mag[pos];
      if (toolId) {
        const tool = Storage.getToolById(toolId);
        if (tool) {
          options += `<option value="${tool.id}">T${pos}: ${tool.name} (Ø${tool.diameter}mm)</option>`;
        }
      }
    }
    return options;
  },

  refreshToolSelects() {
    const options = this.buildToolOptionsHTML();
    const mag = Storage.getMagazine();

    let firstVal = null;
    for (let pos = 1; pos <= 14; pos++) {
      if (mag[pos]) { firstVal = mag[pos]; break; }
    }

    ['modal-tool-select', 'path-tool-select', 'nesting-cutter-select', 'ripado-tool-select'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel) {
        const currentVal = sel.value;
        sel.innerHTML = options;
        if (currentVal && Array.from(sel.options).some(o => o.value === currentVal)) {
          sel.value = currentVal;
        } else if (firstVal) {
          sel.value = firstVal;
        }
      }
    });
  },

  // ── Add / Save Line Operation ───────────────────────────────

  addLine() {
    const toolId = document.getElementById('modal-tool-select').value;
    if (!toolId) { showToast('Selecione uma fresa.', 'error'); return; }
    const pos = Storage.getToolPosition(toolId);
    if (!pos) { showToast('Fresa não está no magazine.', 'error'); return; }

    const isEdit = this.editingOpIndex >= 0;
    const rawSx = this.getRawInputVal('modal-sx', '0');
    const rawSy = this.getRawInputVal('modal-sy', '0');
    const rawEx = this.getRawInputVal('modal-ex', '100');
    const rawEy = this.getRawInputVal('modal-ey', '0');
    const rawGw = this.getRawInputVal('modal-groove-w', '6');
    const rawDp = this.getRawInputVal('modal-groove-d', '5');

    const op = {
      id: isEdit ? this.operations[this.editingOpIndex].id : Storage.generateId(),
      type: 'line',
      toolId,
      correction: document.getElementById('modal-correction').value,
      rawGrooveWidth: rawGw, grooveWidth: this.evalExpr(rawGw),
      rawDepth: rawDp, depth: this.evalExpr(rawDp),
      rawStartX: rawSx, startX: this.evalExpr(rawSx),
      rawStartY: rawSy, startY: this.evalExpr(rawSy),
      rawEndX: rawEx, endX: this.evalExpr(rawEx),
      rawEndY: rawEy, endY: this.evalExpr(rawEy)
    };

    if (isEdit) {
      this.operations[this.editingOpIndex] = op;
    } else {
      this.operations.push(op);
    }

    this.syncOrganicOpState(op);

    this.ensureParkAtEnd();
    this.renderOperationsList();
    PieceEditor.draw();
    this.updateCanvasInfo();
    this.closeToolModal();
    showToast(isEdit ? 'Linha atualizada!' : 'Linha adicionada!', 'success');
  },

  onModalOrganicChange() {
    const cb = document.getElementById('modal-is-organic');
    if (cb && cb.checked) {
      const pd = document.getElementById('piece-depth')?.value || 15;
      const extraCut = document.getElementById('nesting-extra-cut')?.value || 0.3;
      const gdEl = document.getElementById('modal-groove-d');
      if (gdEl) gdEl.value = `${pd} + ${extraCut}`;
    }
  },

  onPathOrganicChange() {
    const cb = document.getElementById('path-is-organic');
    if (cb && cb.checked) {
      const pd = document.getElementById('piece-depth')?.value || 15;
      const extraCut = document.getElementById('nesting-extra-cut')?.value || 0.3;
      const gdEl = document.getElementById('path-groove-d');
      if (gdEl) gdEl.value = `${pd} + ${extraCut}`;
    }
  },

  updateOrganicPieceState() {
    const manualOrganic = document.getElementById('piece-organic')?.checked || false;
    const hasOrganicOp = (this.operations || []).some(o => !!o.isOrganicContour && (o.type === 'circle' || o.type === 'rect' || (o.type === 'path' && !!o.closed)));
    const isOrganic = manualOrganic || hasOrganicOp;

    if (typeof PieceEditor !== 'undefined') {
      PieceEditor.isOrganic = isOrganic;
    }
    return isOrganic;
  },

  syncOrganicOpState(targetOp) {
    let isOrganic = false;
    if (targetOp.type === 'path') {
      isOrganic = !!(targetOp.closed && document.getElementById('path-is-organic')?.checked);
    } else {
      isOrganic = !!document.getElementById('modal-is-organic')?.checked;
    }

    // Apenas Círculo, Retângulo ou Caminho Fechado podem ser contornos de peça orgânica
    const canBeOrganic = targetOp.type === 'circle' || targetOp.type === 'rect' || (targetOp.type === 'path' && !!targetOp.closed);
    if (!canBeOrganic) {
      isOrganic = false;
    }

    targetOp.isOrganicContour = isOrganic;

    if (isOrganic) {
      this.operations.forEach(o => {
        if (o.id !== targetOp.id) o.isOrganicContour = false;
      });
    }

    this.updateOrganicPieceState();
  },

  // ── Add / Save Curve Operation ──────────────────────────────

  addCurve() {
    const toolId = document.getElementById('modal-tool-select').value;
    if (!toolId) { showToast('Selecione uma fresa.', 'error'); return; }
    const pos = Storage.getToolPosition(toolId);
    if (!pos) { showToast('Fresa não está no magazine.', 'error'); return; }

    const isEdit = this.editingOpIndex >= 0;
    const rawSx = this.getRawInputVal('modal-sx', '0');
    const rawSy = this.getRawInputVal('modal-sy', '0');
    const rawEx = this.getRawInputVal('modal-ex', '100');
    const rawEy = this.getRawInputVal('modal-ey', '100');
    const rawR = this.getRawInputVal('modal-radius', '50');
    const rawGw = this.getRawInputVal('modal-groove-w', '6');
    const rawDp = this.getRawInputVal('modal-groove-d', '5');

    const op = {
      id: isEdit ? this.operations[this.editingOpIndex].id : Storage.generateId(),
      type: 'curve',
      toolId,
      correction: document.getElementById('modal-correction').value,
      rawGrooveWidth: rawGw, grooveWidth: this.evalExpr(rawGw),
      rawDepth: rawDp, depth: this.evalExpr(rawDp),
      rawStartX: rawSx, startX: this.evalExpr(rawSx),
      rawStartY: rawSy, startY: this.evalExpr(rawSy),
      rawEndX: rawEx, endX: this.evalExpr(rawEx),
      rawEndY: rawEy, endY: this.evalExpr(rawEy),
      rawRadius: rawR, radius: this.evalExpr(rawR),
      curveDirection: document.getElementById('modal-dir').value || 'cw'
    };

    if (isEdit) {
      this.operations[this.editingOpIndex] = op;
    } else {
      this.operations.push(op);
    }

    this.syncOrganicOpState(op);

    this.ensureParkAtEnd();
    this.renderOperationsList();
    PieceEditor.draw();
    this.updateCanvasInfo();
    this.closeToolModal();
    showToast(isEdit ? 'Curva atualizada!' : 'Curva adicionada!', 'success');
  },

  // ── 3-Column Interactive Vector Path Builder ──────────────────

  renderPathBuilderUI() {
    if (!this.pathBuilding) return;
    const pb = this.pathBuilding;

    // ── Coluna 1: Lista de Sequência de Pontos ────────────────
    const listEl = document.getElementById('path-points-list');
    if (listEl) {
      let html = `
        <div class="path-point-row ${pb.selectedSegIndex === 0 ? 'selected' : ''}" onclick="App.pathSelectSegRow(0)">
          <span class="pt-id">0</span>
          <span class="pt-desc">Ponto (${pb.startPoint.x}, ${pb.startPoint.y})</span>
        </div>
      `;

      (pb.segments || []).forEach((seg, idx) => {
        const rowIdx = idx + 1;
        const isSel = pb.selectedSegIndex === rowIdx;
        let desc = '';
        if (seg.type === 'line') {
          desc = `Linha (${seg.endX}, ${seg.endY})`;
        } else if (seg.type === 'curve') {
          const dirChar = seg.curveDirection === 'ccw' ? '↺' : '↻';
          desc = `Arco (${seg.endX}, ${seg.endY}, r${seg.radius} ${dirChar})`;
        }
        html += `
          <div class="path-point-row ${isSel ? 'selected' : ''}" onclick="App.pathSelectSegRow(${rowIdx})">
            <span class="pt-id">${rowIdx}</span>
            <span class="pt-desc">${desc}</span>
          </div>
        `;
      });

      listEl.innerHTML = html;
    }

    const delBtn = document.getElementById('path-del-seg-btn');
    if (delBtn) delBtn.disabled = pb.selectedSegIndex <= 0;

    // ── Coluna 2: Formulário do Elemento Atual ────────────────
    const titleEl = document.getElementById('path-seg-card-title');
    const saveBtn = document.getElementById('path-save-seg-btn');
    const lineBtn = document.getElementById('path-type-line-btn');
    const curveBtn = document.getElementById('path-type-curve-btn');
    const extraCurveFields = document.getElementById('path-curve-extra-fields');

    const inputX = document.getElementById('pseg-x');
    const inputY = document.getElementById('pseg-y');
    const inputRadius = document.getElementById('pseg-radius');

    if (pb.selectedSegIndex === 0) {
      // Editar Ponto Inicial (ID 0)
      if (titleEl) titleEl.textContent = '📍 Ponto Inicial (ID 0)';
      if (inputX) inputX.value = pb.startPoint.x;
      if (inputY) inputY.value = pb.startPoint.y;
      if (extraCurveFields) extraCurveFields.classList.add('hidden');
      if (lineBtn) lineBtn.classList.remove('active');
      if (curveBtn) curveBtn.classList.remove('active');
      if (saveBtn) saveBtn.textContent = 'Modificar Ponto';
    } else if (pb.selectedSegIndex === -1) {
      // Adicionar Novo Segmento
      const nextId = pb.segments.length + 1;
      let lastX = pb.startPoint.x;
      let lastY = pb.startPoint.y;
      if (pb.segments.length > 0) {
        const lastSeg = pb.segments[pb.segments.length - 1];
        lastX = lastSeg.endX;
        lastY = lastSeg.endY;
      }

      if (pb.activeType === 'line') {
        if (titleEl) titleEl.textContent = `➕ Nova Linha (ID ${nextId})`;
        if (lineBtn) lineBtn.classList.add('active');
        if (curveBtn) curveBtn.classList.remove('active');
        if (extraCurveFields) extraCurveFields.classList.add('hidden');
        if (inputX) inputX.value = lastX;
        if (inputY) inputY.value = lastY;
        if (saveBtn) saveBtn.textContent = '+ Adicionar Linha';
      } else {
        if (titleEl) titleEl.textContent = `➕ Novo Arco (ID ${nextId})`;
        if (lineBtn) lineBtn.classList.remove('active');
        if (curveBtn) curveBtn.classList.add('active');
        if (extraCurveFields) extraCurveFields.classList.remove('hidden');
        if (inputX) inputX.value = lastX;
        if (inputY) inputY.value = lastY;
        if (inputRadius) inputRadius.value = 50;
        this.pathSelectDir(pb.activeDir || 'cw');
        if (saveBtn) saveBtn.textContent = '+ Adicionar Arco';
      }
    } else if (pb.selectedSegIndex > 0) {
      // Editar Segmento Existente
      const segIndex = pb.selectedSegIndex - 1;
      const seg = pb.segments[segIndex];
      if (seg) {
        if (titleEl) titleEl.textContent = `✏️ Editar Elemento (ID ${pb.selectedSegIndex})`;
        if (inputX) inputX.value = seg.endX;
        if (inputY) inputY.value = seg.endY;

        if (seg.type === 'line') {
          if (lineBtn) lineBtn.classList.add('active');
          if (curveBtn) curveBtn.classList.remove('active');
          if (extraCurveFields) extraCurveFields.classList.add('hidden');
        } else if (seg.type === 'curve') {
          if (lineBtn) lineBtn.classList.remove('active');
          if (curveBtn) curveBtn.classList.add('active');
          if (extraCurveFields) extraCurveFields.classList.remove('hidden');
          if (inputRadius) inputRadius.value = seg.radius || 50;
          this.pathSelectDir(seg.curveDirection || 'cw');
        }
        if (saveBtn) saveBtn.textContent = 'Modificar Elemento';
      }
    }
  },

  pathSelectSegRow(rowIdx) {
    if (!this.pathBuilding) return;
    this.pathBuilding.selectedSegIndex = rowIdx;
    this.renderPathBuilderUI();
    this.updateLivePreview();
  },

  pathSelectSegType(type) {
    if (!this.pathBuilding) return;
    this.pathBuilding.activeType = type;
    this.pathBuilding.selectedSegIndex = -1; // Reset to adding new
    this.renderPathBuilderUI();
    this.updateLivePreview();
  },

  pathSelectDir(dir) {
    if (!this.pathBuilding) return;
    this.pathBuilding.activeDir = dir;
    const cwBtn = document.getElementById('pseg-dir-cw');
    const ccwBtn = document.getElementById('pseg-dir-ccw');
    if (cwBtn) cwBtn.classList.toggle('active', dir === 'cw');
    if (ccwBtn) ccwBtn.classList.toggle('active', dir === 'ccw');
    this.updateLivePreview();
  },

  pathSelectCorrection(corr) {
    if (!this.pathBuilding) return;
    this.pathBuilding.correction = corr;
    const btnLeft = document.getElementById('path-corr-left');
    const btnMid = document.getElementById('path-corr-mid');
    const btnRight = document.getElementById('path-corr-right');
    if (btnLeft) btnLeft.classList.toggle('active', corr === 'esquerda');
    if (btnMid) btnMid.classList.toggle('active', corr === 'meio');
    if (btnRight) btnRight.classList.toggle('active', corr === 'direita');
    this.updateLivePreview();
  },

  pathToggleClosed(isClosed) {
    if (!this.pathBuilding) return;
    this.pathBuilding.closed = !!isClosed;

    const organicContainer = document.getElementById('path-organic-container');
    const organicCb = document.getElementById('path-is-organic');
    if (organicContainer) {
      organicContainer.style.display = isClosed ? 'flex' : 'none';
    }
    if (organicCb) {
      organicCb.disabled = !isClosed;
      if (!isClosed && organicCb.checked) {
        organicCb.checked = false;
        showToast('Contorno orgânico desativado pois o caminho não está fechado.', 'info');
      }
    }
    this.updateLivePreview();
  },

  pathSaveCurrentSeg() {
    if (!this.pathBuilding) return;
    const pb = this.pathBuilding;
    const xVal = this.getRawInputVal('pseg-x', '0');
    const yVal = this.getRawInputVal('pseg-y', '0');
    const rVal = this.getRawInputVal('pseg-radius', '50');

    if (pb.selectedSegIndex === 0) {
      pb.startPoint = { x: xVal, y: yVal };
      showToast('Ponto inicial modificado!', 'info');
    } else if (pb.selectedSegIndex === -1) {
      if (pb.activeType === 'line') {
        pb.segments.push({
          type: 'line',
          endX: xVal,
          endY: yVal
        });
      } else if (pb.activeType === 'curve') {
        pb.segments.push({
          type: 'curve',
          endX: xVal,
          endY: yVal,
          radius: rVal,
          curveDirection: pb.activeDir || 'cw'
        });
      }
      showToast('Segmento adicionado!', 'info');
    } else if (pb.selectedSegIndex > 0) {
      const idx = pb.selectedSegIndex - 1;
      const seg = pb.segments[idx];
      if (seg) {
        seg.endX = xVal;
        seg.endY = yVal;
        if (seg.type === 'curve') {
          seg.radius = rVal;
          seg.curveDirection = pb.activeDir || 'cw';
        }
        showToast('Elemento modificado!', 'info');
      }
    }

    this.renderPathBuilderUI();
    this.updateLivePreview();
  },

  pathDeleteSelectedSeg() {
    if (!this.pathBuilding || this.pathBuilding.selectedSegIndex <= 0) return;
    const idx = this.pathBuilding.selectedSegIndex - 1;
    this.pathBuilding.segments.splice(idx, 1);
    this.pathBuilding.selectedSegIndex = -1;
    this.renderPathBuilderUI();
    this.updateLivePreview();
    showToast('Elemento excluído.', 'info');
  },

  pathFinish() {
    if (!this.pathBuilding || this.pathBuilding.segments.length === 0) {
      showToast('Adicione pelo menos um segmento (linha ou arco).', 'error');
      return;
    }

    const isEdit = this.editingOpIndex >= 0;
    const selTool = document.getElementById('path-tool-select');
    const toolId = selTool ? selTool.value : 't1';
    if (!toolId) { showToast('Selecione uma fresa para o caminho.', 'error'); return; }

    const op = {
      id: isEdit ? this.operations[this.editingOpIndex].id : Storage.generateId(),
      type: 'path',
      toolId: toolId,
      correction: this.pathBuilding.correction || 'meio',
      grooveWidth: this.parseInputVal('path-groove-w', 6),
      depth: this.parseInputVal('path-groove-d', 5),
      rawGrooveWidth: this.getRawInputVal('path-groove-w', '6'),
      rawDepth: this.getRawInputVal('path-groove-d', '5'),
      startPoint: {
        x: this.evalExpr(this.pathBuilding.startPoint.x),
        y: this.evalExpr(this.pathBuilding.startPoint.y)
      },
      rawStartX: this.pathBuilding.startPoint.x,
      rawStartY: this.pathBuilding.startPoint.y,
      segments: JSON.parse(JSON.stringify(this.pathBuilding.segments)),
      closed: !!this.pathBuilding.closed,
      isOrganicContour: !!(this.pathBuilding.closed && document.getElementById('path-is-organic')?.checked)
    };

    if (isEdit) {
      this.operations[this.editingOpIndex] = op;
    } else {
      this.operations.push(op);
    }

    this.syncOrganicOpState(op);

    this.pathBuilding = null;
    this.ensureParkAtEnd();
    this.renderOperationsList();
    PieceEditor.draw();
    this.updateCanvasInfo();
    this.closeToolModal();
    showToast(isEdit ? 'Caminho modificado!' : 'Caminho adicionado!', 'success');
  },

  // ── Add / Save Circle Operation ─────────────────────────────

  addCircle() {
    const toolId = document.getElementById('modal-tool-select').value;
    if (!toolId) { showToast('Selecione uma fresa.', 'error'); return; }
    const pos = Storage.getToolPosition(toolId);
    if (!pos) { showToast('Fresa não está no magazine.', 'error'); return; }

    const isEdit = this.editingOpIndex >= 0;
    const rawCx = this.getRawInputVal('modal-circle-cx', '0');
    const rawCy = this.getRawInputVal('modal-circle-cy', '0');
    const rawR = this.getRawInputVal('modal-circle-r', '50');
    const rawGw = this.getRawInputVal('modal-groove-w', '6');
    const rawDp = this.getRawInputVal('modal-groove-d', '5');

    const op = {
      id: isEdit ? this.operations[this.editingOpIndex].id : Storage.generateId(),
      type: 'circle',
      toolId,
      correction: document.getElementById('modal-correction').value,
      rawGrooveWidth: rawGw, grooveWidth: this.evalExpr(rawGw),
      rawDepth: rawDp, depth: this.evalExpr(rawDp),
      rawCenterX: rawCx, centerX: this.evalExpr(rawCx),
      rawCenterY: rawCy, centerY: this.evalExpr(rawCy),
      rawRadius: rawR, radius: this.evalExpr(rawR),
      isPocket: document.getElementById('modal-circle-pocket')?.checked || false
    };

    if (isEdit) {
      this.operations[this.editingOpIndex] = op;
    } else {
      this.operations.push(op);
    }

    this.syncOrganicOpState(op);

    this.ensureParkAtEnd();
    this.renderOperationsList();
    PieceEditor.draw();
    this.updateCanvasInfo();
    this.closeToolModal();
    showToast(isEdit ? 'Círculo atualizado!' : 'Círculo adicionado!', 'success');
  },

  // ── Add / Save Rect Operation ───────────────────────────────

  addRect() {
    const toolId = document.getElementById('modal-tool-select').value;
    if (!toolId) { showToast('Selecione uma fresa.', 'error'); return; }
    const pos = Storage.getToolPosition(toolId);
    if (!pos) { showToast('Fresa não está no magazine.', 'error'); return; }

    const isEdit = this.editingOpIndex >= 0;
    const rawRx = this.getRawInputVal('modal-rect-x', '0');
    const rawRy = this.getRawInputVal('modal-rect-y', '0');
    const rawRl = this.getRawInputVal('modal-rect-l', '100');
    const rawRw = this.getRawInputVal('modal-rect-w', '100');
    const rawRr = this.getRawInputVal('modal-rect-r', '0');
    const rawGw = this.getRawInputVal('modal-groove-w', '6');
    const rawDp = this.getRawInputVal('modal-groove-d', '5');
    const pocketEl = document.getElementById('modal-rect-pocket');
    const isPocket = pocketEl ? pocketEl.checked : false;

    const op = {
      id: isEdit ? this.operations[this.editingOpIndex].id : Storage.generateId(),
      type: 'rect',
      toolId,
      correction: document.getElementById('modal-correction').value,
      isPocket: isPocket,
      rawGrooveWidth: rawGw, grooveWidth: this.evalExpr(rawGw),
      rawDepth: rawDp, depth: Math.max(0.1, this.evalExpr(rawDp) || 5),
      rawX: rawRx, x: this.evalExpr(rawRx),
      rawY: rawRy, y: this.evalExpr(rawRy),
      rawLength: rawRl, length: this.evalExpr(rawRl),
      rawWidth: rawRw, width: this.evalExpr(rawRw),
      rawCornerRadius: rawRr, cornerRadius: this.evalExpr(rawRr)
    };

    if (isEdit) {
      this.operations[this.editingOpIndex] = op;
    } else {
      this.operations.push(op);
    }

    this.syncOrganicOpState(op);

    this.ensureParkAtEnd();
    this.renderOperationsList();
    PieceEditor.draw();
    this.updateCanvasInfo();
    this.closeToolModal();
    showToast(isEdit ? 'Retângulo atualizado!' : 'Retângulo adicionado!', 'success');
  },

  // ── Add Park Operation ──────────────────────────────────────

  addPark() {
    const hasPark = this.operations.some(op => op.type === 'park');
    if (hasPark) {
      showToast('A operação Park já existe nas operações.', 'error');
      return;
    }
    const op = {
      id: Storage.generateId(),
      type: 'park',
      x: 1850,
      y: 2750,
      z: 100
    };
    this.operations.push(op);
    this.ensureParkAtEnd();
    this.renderOperationsList();
    PieceEditor.draw();
    this.updateCanvasInfo();
    showToast('Operação Park adicionada ao final!', 'success');
  },

  ensureParkAtEnd() {
    const parkIndex = this.operations.findIndex(op => op.type === 'park');
    if (parkIndex >= 0 && parkIndex !== this.operations.length - 1) {
      const [parkOp] = this.operations.splice(parkIndex, 1);
      this.operations.push(parkOp);
    }
  },

  updatePathUI() {
    if (!this.pathBuilding) return;

    let curX = this.pathBuilding.startX;
    let curY = this.pathBuilding.startY;
    for (const seg of this.pathBuilding.segments) {
      curX = seg.endX;
      curY = seg.endY;
    }
    const ptEl = document.getElementById('path-current-pt');
    if (ptEl) ptEl.textContent = `Ponto atual: X${curX.toFixed(3)} Y${curY.toFixed(3)}`;

    const container = document.getElementById('path-segments-list');
    if (!container) return;

    if (this.pathBuilding.segments.length === 0) {
      container.innerHTML = '<div class="text-muted text-sm" style="padding:4px 0;">Nenhum segmento ainda.</div>';
      return;
    }

    let html = '';
    for (let i = 0; i < this.pathBuilding.segments.length; i++) {
      const seg = this.pathBuilding.segments[i];
      const label = seg.type === 'line' ? 'LINHA' : 'CURVA';
      const info = `→ X${seg.endX} Y${seg.endY}`;
      html += `
        <div class="path-segment-item">
          <span class="seg-type">${label}</span>
          <span>${info}</span>
          <button class="seg-del" onclick="App.pathDeleteSeg(${i})" title="Remover">✕</button>
        </div>`;
    }
    container.innerHTML = html;
  },

  // ── Operations Reordering & Editing ─────────────────────────

  moveOpUp(index) {
    if (index <= 0 || index >= this.operations.length) return;
    if (this.operations[index].type === 'park') return;
    const temp = this.operations[index];
    this.operations[index] = this.operations[index - 1];
    this.operations[index - 1] = temp;
    if (this.selectedOpIndex === index) this.selectedOpIndex = index - 1;
    else if (this.selectedOpIndex === index - 1) this.selectedOpIndex = index;
    this.ensureParkAtEnd();
    this.renderOperationsList();
    PieceEditor.draw();
    showToast('Ordem alterada.', 'info');
  },

  moveOpDown(index) {
    if (index < 0 || index >= this.operations.length - 1) return;
    if (this.operations[index].type === 'park') return;
    const nextOp = this.operations[index + 1];
    if (nextOp && nextOp.type === 'park') return; // Cannot move past Park
    const temp = this.operations[index];
    this.operations[index] = this.operations[index + 1];
    this.operations[index + 1] = temp;
    if (this.selectedOpIndex === index) this.selectedOpIndex = index + 1;
    else if (this.selectedOpIndex === index + 1) this.selectedOpIndex = index;
    this.ensureParkAtEnd();
    this.renderOperationsList();
    PieceEditor.draw();
    showToast('Ordem alterada.', 'info');
  },

  editOp(index) {
    if (index < 0 || index >= this.operations.length) return;
    const op = this.operations[index];
    if (op.type === 'park') return;
    this.openToolModal(op.type, index);
  },

  // ── Operations List ─────────────────────────────────────────

  renderOperationsList() {
    this.updateOrganicPieceState();
    const container = document.getElementById('operations-list');
    const empty = document.getElementById('ops-empty');
    const clearAllBtn = document.getElementById('btn-clear-all-ops');

    if (clearAllBtn) {
      clearAllBtn.style.display = this.operations.length > 0 ? 'inline-flex' : 'none';
    }

    if (this.operations.length === 0) {
      empty.classList.remove('hidden');
      container.querySelectorAll('.op-item').forEach(el => el.remove());
      return;
    }

    empty.classList.add('hidden');
    let html = '';

    for (let i = 0; i < this.operations.length; i++) {
      const op = this.operations[i];
      const tool = Storage.getToolById(op.toolId);
      const pos = Storage.getToolPosition(op.toolId);
      let toolName = tool ? `T${pos} ${tool.name}` : 'Sem fresa';

      let label = '';
      if (op.type === 'line') label = `Linha`;
      else if (op.type === 'curve') label = `Curva`;
      else if (op.type === 'path') label = `Caminho (${op.segments.length} seg)`;
      else if (op.type === 'circle') label = `Círculo (R${op.radius})`;
      else if (op.type === 'rect') label = `Retângulo (${op.length}x${op.width})`;
      else if (op.type === 'drill') {
        const mirrors = [];
        if (op.mirrorX) mirrors.push('Espelho X');
        if (op.mirrorY) mirrors.push('Espelho Y');
        const mirrorStr = mirrors.length > 0 ? ` [${mirrors.join(', ')}]` : '';
        const qtyStr = op.qty > 1 ? ` (x${op.qty})` : '';
        label = `Furação Ø${op.diameter}mm${qtyStr}${mirrorStr}`;
        if (!tool && op.diameter) toolName = `Broca Ø${op.diameter}mm (Cabeçote)`;
      }
      else if (op.type === 'park') {
        label = `Park (Estacionar)`;
        toolName = `X${op.x} Y${op.y} Z${op.z}`;
      }

      if (op.isOrganicContour) {
        label += ` <span style="font-size: 9px; background: rgba(0,230,118,0.15); color: #00e676; padding: 1px 4px; border-radius: 3px; border: 1px solid rgba(0,230,118,0.3); font-weight: 700;">🌿 ORGÂNICO</span>`;
      }

      const selected = this.selectedOpIndex === i ? ' selected' : '';
      const isPark = op.type === 'park';

      html += `
        <div class="op-item${selected}" onclick="App.selectOp(${i})">
          <!-- Linha 1: Ícone + Nome Completo -->
          <div class="op-item-line1">
            <span class="op-badge ${op.type}"></span>
            <span class="op-name">${label}</span>
          </div>
          <!-- Linha 2: Número + Teclas de Ação -->
          <div class="op-item-line2">
            <span class="op-number">${i + 1}.</span>
            <div class="op-actions" onclick="event.stopPropagation()">
              ${isPark ? '' : `<button class="op-action-btn" onclick="App.openArrayCopyModal(${i})" title="Repetição em Matriz Retangular (X/Y)">❖</button>`}
              ${isPark ? '' : `<button class="op-action-btn" onclick="App.openSaveToLibraryModal(${i})" title="Salvar na Biblioteca">⭐</button>`}
              ${isPark ? '' : `<button class="op-action-btn" onclick="App.moveOpUp(${i})" title="Subir" ${i === 0 ? 'disabled' : ''}>▲</button>`}
              ${isPark ? '' : `<button class="op-action-btn" onclick="App.moveOpDown(${i})" title="Descer" ${i === this.operations.length - 1 || (this.operations[i+1] && this.operations[i+1].type === 'park') ? 'disabled' : ''}>▼</button>`}
              ${isPark ? '' : `<button class="op-action-btn" onclick="App.editOp(${i})" title="Editar">✏️</button>`}
              <button class="op-action-btn del" onclick="App.deleteOp(${i})" title="Excluir">✕</button>
            </div>
          </div>
          <!-- Linha 3: Especificação da Fresa -->
          <div class="op-item-line3">
            ${toolName}
          </div>
        </div>`;
    }

    const emptyEl = empty.cloneNode(true);
    container.innerHTML = html;
    container.appendChild(emptyEl);
  },

  // ── Operations Sub-tabs & Library Management ────────────────

  currentOpsSubtab: 'active',
  savingOpIndexToLib: -1,

  switchOpsSubtab(subtab) {
    this.currentOpsSubtab = subtab;
    const btnActive = document.getElementById('btn-ops-subtab-active');
    const btnLib = document.getElementById('btn-ops-subtab-library');
    const contentActive = document.getElementById('ops-subtab-content-active');
    const contentLib = document.getElementById('ops-subtab-content-library');

    if (subtab === 'active') {
      if (btnActive) { btnActive.classList.add('active'); btnActive.style.background = 'var(--bg-tertiary)'; btnActive.style.color = 'var(--accent)'; }
      if (btnLib) { btnLib.classList.remove('active'); btnLib.style.background = 'transparent'; btnLib.style.color = 'var(--text-muted)'; }
      if (contentActive) contentActive.classList.remove('hidden');
      if (contentLib) contentLib.classList.add('hidden');
    } else {
      if (btnLib) { btnLib.classList.add('active'); btnLib.style.background = 'var(--bg-tertiary)'; btnLib.style.color = 'var(--accent)'; }
      if (btnActive) { btnActive.classList.remove('active'); btnActive.style.background = 'transparent'; btnActive.style.color = 'var(--text-muted)'; }
      if (contentLib) contentLib.classList.remove('hidden');
      if (contentActive) contentActive.classList.add('hidden');
      this.renderLibraryUI();
    }
  },

  openNewLibraryFolderModal() {
    const modal = document.getElementById('new-library-folder-modal');
    const input = document.getElementById('new-lib-folder-name');
    if (input) input.value = '';
    if (modal) modal.classList.add('open');
    setTimeout(() => { if (input) input.focus(); }, 100);
  },

  closeNewLibraryFolderModal() {
    const modal = document.getElementById('new-library-folder-modal');
    if (modal) modal.classList.remove('open');
  },

  submitCreateLibraryFolder() {
    const input = document.getElementById('new-lib-folder-name');
    const name = input ? input.value.trim() : '';
    if (!name) {
      showToast('Digite um nome para a pasta.', 'warning');
      return;
    }
    const lib = Storage.createLibraryFolder(name);
    this.closeNewLibraryFolderModal();
    this.renderLibraryUI();

    // Atualiza o select do modal de salvar operação se estiver aberto
    const folderSelect = document.getElementById('save-lib-folder-select');
    if (folderSelect && lib && lib.folders) {
      folderSelect.innerHTML = lib.folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
      const newCreated = lib.folders[lib.folders.length - 1];
      if (newCreated) folderSelect.value = newCreated.id;
    }

    showToast(`Pasta "${name}" criada com sucesso!`, 'success');
  },

  promptCreateLibraryFolder() {
    this.openNewLibraryFolderModal();
  },

  deleteLibraryFolder(folderId) {
    const lib = Storage.getLibrary();
    const folder = lib.folders.find(f => f.id === folderId);
    const name = folder ? folder.name : 'Pasta';
    if (!confirm(`Deseja excluir a pasta "${name}" e todos os modelos nela?`)) return;

    Storage.deleteLibraryFolder(folderId);
    this.renderLibraryUI();
    showToast(`Pasta "${name}" excluída.`, 'info');
  },

  openSaveToLibraryModal(opIndex) {
    const status = LicenseManager.getLicenseStatus();
    if (!status.isActivated && !status.isTrial) {
      showToast('No modo DEMO, o salvamento de operações na biblioteca fica desativado.', 'error');
      this.openLicenseModal();
      return;
    }
    if (opIndex < 0 || opIndex >= this.operations.length) return;
    const op = this.operations[opIndex];
    if (op.type === 'park') return;

    this.savingOpIndexToLib = opIndex;

    const summaryEl = document.getElementById('save-lib-op-summary');
    const folderSelect = document.getElementById('save-lib-folder-select');
    const nameInput = document.getElementById('save-lib-op-name');

    let opTypeName = op.type.toUpperCase();
    if (summaryEl) summaryEl.textContent = `Operação: ${opTypeName} (${op.correction || 'meio'}, Profundidade: ${op.rawDepth || op.depth}mm)`;

    const lib = Storage.getLibrary();
    if (folderSelect) {
      folderSelect.innerHTML = lib.folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    }

    if (nameInput) {
      nameInput.value = `${opTypeName} Modelo`;
      nameInput.focus();
    }

    const modal = document.getElementById('op-save-lib-modal');
    if (modal) modal.classList.add('open');
  },

  closeSaveToLibraryModal() {
    const modal = document.getElementById('op-save-lib-modal');
    if (modal) modal.classList.remove('open');
    this.savingOpIndexToLib = -1;
  },

  submitSaveToLibrary() {
    if (this.savingOpIndexToLib < 0 || this.savingOpIndexToLib >= this.operations.length) return;
    const op = this.operations[this.savingOpIndexToLib];
    const folderSelect = document.getElementById('save-lib-folder-select');
    const nameInput = document.getElementById('save-lib-op-name');

    const folderId = folderSelect ? folderSelect.value : null;
    const modelName = nameInput ? nameInput.value.trim() : 'Operação Modelo';

    if (!modelName) {
      showToast('Informe o nome do modelo.', 'error');
      return;
    }

    Storage.saveOpToLibrary(folderId, modelName, op);
    this.closeSaveToLibraryModal();
    showToast(`Operação "${modelName}" salva na Biblioteca!`, 'success');
  },

  renderLibraryUI() {
    const container = document.getElementById('library-folders-container');
    if (!container) return;

    const lib = Storage.getLibrary();
    if (!lib.folders || lib.folders.length === 0) {
      container.innerHTML = '<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 12px;">Nenhuma pasta criada. Clique em + Nova Pasta.</div>';
      return;
    }

    let html = '';
    lib.folders.forEach(folder => {
      const opsInFolder = lib.savedOps.filter(o => o.folderId === folder.id);

      html += `
        <div class="library-folder-card" style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 8px; margin-bottom: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="font-size: 11px; font-weight: 700; color: var(--accent);">📁 ${folder.name} <span style="font-size: 9px; color: #888; font-weight: normal;">(${opsInFolder.length})</span></div>
            ${folder.id !== 'f_default' ? `<button onclick="App.deleteLibraryFolder('${folder.id}')" style="background: none; border: none; color: var(--red); cursor: pointer; font-size: 11px;" title="Excluir Pasta">✕</button>` : ''}
          </div>

          <div class="library-ops-list" style="display: flex; flex-direction: column; gap: 4px;">
            ${opsInFolder.length === 0 ? '<div style="font-size: 10px; color: #666; font-style: italic; padding: 2px 0;">Sem operações salvas nesta pasta.</div>' : ''}
            ${opsInFolder.map(opItem => `
              <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 5px 6px; border-radius: 4px; border-left: 2px solid var(--accent);">
                <div style="font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px;">
                  <strong>${opItem.name}</strong>
                  <div style="font-size: 9px; color: #888;">${opItem.opData.type.toUpperCase()}</div>
                </div>
                <div style="display: flex; gap: 4px;">
                  <button class="btn btn-primary" onclick="App.useLibraryOp('${opItem.id}')" style="padding: 2px 6px; font-size: 10px;" title="Usar esta operação na peça">➕ Usar</button>
                  <button class="var-action-btn del" onclick="App.deleteLibraryOp('${opItem.id}')" title="Excluir Modelo">✕</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  useLibraryOp(libOpId) {
    const lib = Storage.getLibrary();
    const item = lib.savedOps.find(o => o.id === libOpId);
    if (!item) return;

    const newOp = JSON.parse(JSON.stringify(item.opData));
    newOp.id = Storage.generateId();

    if (newOp.rawStartX !== undefined) newOp.startX = this.evalExpr(newOp.rawStartX);
    if (newOp.rawStartY !== undefined) newOp.startY = this.evalExpr(newOp.rawStartY);
    if (newOp.rawEndX !== undefined) newOp.endX = this.evalExpr(newOp.rawEndX);
    if (newOp.rawEndY !== undefined) newOp.endY = this.evalExpr(newOp.rawEndY);
    if (newOp.rawRadius !== undefined) newOp.radius = this.evalExpr(newOp.rawRadius);
    if (newOp.rawDepth !== undefined) newOp.depth = this.evalExpr(newOp.rawDepth);
    if (newOp.rawGrooveWidth !== undefined) newOp.grooveWidth = this.evalExpr(newOp.rawGrooveWidth);
    if (newOp.rawCenterX !== undefined) newOp.centerX = this.evalExpr(newOp.rawCenterX);
    if (newOp.rawCenterY !== undefined) newOp.centerY = this.evalExpr(newOp.rawCenterY);
    if (newOp.rawX !== undefined) newOp.x = this.evalExpr(newOp.rawX);
    if (newOp.rawY !== undefined) newOp.y = this.evalExpr(newOp.rawY);
    if (newOp.rawLength !== undefined) newOp.length = this.evalExpr(newOp.rawLength);
    if (newOp.rawWidth !== undefined) newOp.width = this.evalExpr(newOp.rawWidth);

    this.operations.push(newOp);
    this.ensureParkAtEnd();
    this.renderOperationsList();
    PieceEditor.draw();
    this.updateCanvasInfo();
    showToast(`Modelo "${item.name}" adicionado à peça!`, 'success');
  },

  deleteLibraryOp(libOpId) {
    Storage.deleteOpFromLibrary(libOpId);
    this.renderLibraryUI();
    showToast('Modelo removido da biblioteca.', 'info');
  },

  selectOp(index) {
    this.selectedOpIndex = this.selectedOpIndex === index ? -1 : index;
    this.renderOperationsList();
    PieceEditor.draw();
  },

  deleteOp(index) {
    this.operations.splice(index, 1);
    if (this.selectedOpIndex >= this.operations.length) {
      this.selectedOpIndex = -1;
    }
    this.renderOperationsList();
    PieceEditor.draw();
    this.updateCanvasInfo();
    showToast('Operação removida.', 'info');
  },

  clearAllOperations() {
    if (!this.operations || this.operations.length === 0) {
      showToast('Nenhuma operação para excluir.', 'info');
      return;
    }
    if (confirm('Deseja realmente excluir TODAS as operações da peça?')) {
      this.operations = [];
      this.selectedOpIndex = -1;
      this.renderOperationsList();
      PieceEditor.draw();
      this.updateCanvasInfo();
      showToast('Todas as operações foram removidas.', 'info');
    }
  },

  // ── Save NC File ────────────────────────────────────────────

  async saveNC() {
    const status = LicenseManager.getLicenseStatus();
    if (!status.isActivated && !status.isTrial) {
      showToast('No modo DEMO, a exportação de arquivos .NC fica desativada. Ative sua licença.', 'error');
      this.openLicenseModal();
      return;
    }

    if (this.operations.length === 0) {
      showToast('Adicione pelo menos uma operação.', 'error');
      return;
    }

    for (const op of this.operations) {
      if (op.type === 'park') continue;
      const tool = Storage.getToolById(op.toolId);
      const pos = Storage.getToolPosition(op.toolId);
      if (!tool || !pos) {
        showToast(`Operação com fresa inválida ou não posicionada no magazine.`, 'error');
        return;
      }
    }

    const pieceName = document.getElementById('piece-name').value.trim() || 'sem_nome';
    const pieceW = parseInt(document.getElementById('piece-width').value) || 800;
    const pieceH = parseInt(document.getElementById('piece-height').value) || 500;
    const pieceD = parseInt(document.getElementById('piece-depth').value) || 15;
    const safeZ = parseFloat(document.getElementById('safe-z').value) || 10;
    const approachZ = parseFloat(document.getElementById('approach-z').value) || 2;

    const gcode = NCGenerator.generate(
      pieceName, pieceW, pieceH, pieceD,
      this.operations, safeZ, approachZ
    );

    if (!gcode) {
      showToast('Erro ao gerar G-code. Verifique as ferramentas.', 'error');
      return;
    }

    const defaultName = `${pieceName}_${pieceW}x${pieceH}x${pieceD}.nc`;
    const exportDir = Storage.getExportPath();
    const autoDirect = Storage.getAutoSaveDirect();

    try {
      if (window.api && typeof window.api.saveFile === 'function') {
        const filePath = await window.api.saveFile(defaultName, gcode, exportDir, autoDirect);
        if (filePath) {
          showToast(`🟢 Arquivo salvo com sucesso: ${filePath}`, 'success');
        }
      } else {
        const blob = new Blob([gcode], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Arquivo gerado: ${defaultName}`, 'success');
      }
    } catch (err) {
      showToast(`Erro ao salvar arquivo: ${err.message || err}`, 'error');
      console.error(err);
    }
  },

  // ── Save Piece to Project Folder ────────────────────────────

  openSavePieceModal() {
    const status = LicenseManager.getLicenseStatus();
    if (!status.isActivated && !status.isTrial) {
      showToast('No modo DEMO, o salvamento de peças fica desativado. Ative sua licença.', 'error');
      this.openLicenseModal();
      return;
    }
    const modal = document.getElementById('save-piece-modal');
    const folderInput = document.getElementById('save-piece-folder-name');
    const pieceNameInput = document.getElementById('save-piece-name');
    const currentPieceName = document.getElementById('piece-name').value || 'sem_nome';

    if (pieceNameInput) pieceNameInput.value = currentPieceName;
    if (folderInput && !folderInput.value) folderInput.value = '815454';

    if (modal) modal.classList.add('open');
  },

  closeSavePieceModal() {
    const modal = document.getElementById('save-piece-modal');
    if (modal) modal.classList.remove('open');
  },

  submitSavePiece() {
    const folderName = document.getElementById('save-piece-folder-name').value.trim();
    const pieceName = document.getElementById('save-piece-name').value.trim();

    if (!folderName || !pieceName) {
      showToast('Por favor, informe a pasta e o nome da peça.', 'error');
      return;
    }

    const pieceW = this.parseInputVal('piece-width', 800);
    const pieceH = this.parseInputVal('piece-height', 500);
    const pieceD = this.parseInputVal('piece-depth', 15);

    const evaluatedOps = (this.operations || []).map(op => {
      const copy = JSON.parse(JSON.stringify(op));
      const ctx = { L: pieceW, A: pieceH, E: pieceD, ...(this.customVariables || {}) };

      if (copy.rawStartX !== undefined) copy.startX = this.evalExprRaw(copy.rawStartX, ctx);
      if (copy.rawStartY !== undefined) copy.startY = this.evalExprRaw(copy.rawStartY, ctx);
      if (copy.rawEndX !== undefined) copy.endX = this.evalExprRaw(copy.rawEndX, ctx);
      if (copy.rawEndY !== undefined) copy.endY = this.evalExprRaw(copy.rawEndY, ctx);
      if (copy.rawRadius !== undefined) copy.radius = this.evalExprRaw(copy.rawRadius, ctx);
      if (copy.rawDepth !== undefined) copy.depth = this.evalExprRaw(copy.rawDepth, ctx);
      if (copy.rawGrooveWidth !== undefined) copy.grooveWidth = this.evalExprRaw(copy.rawGrooveWidth, ctx);
      if (copy.rawCenterX !== undefined) copy.centerX = this.evalExprRaw(copy.rawCenterX, ctx);
      if (copy.rawCenterY !== undefined) copy.centerY = this.evalExprRaw(copy.rawCenterY, ctx);
      if (copy.rawX !== undefined) copy.x = this.evalExprRaw(copy.rawX, ctx);
      if (copy.rawY !== undefined) copy.y = this.evalExprRaw(copy.rawY, ctx);
      if (copy.rawLength !== undefined) copy.length = this.evalExprRaw(copy.rawLength, ctx);
      if (copy.rawWidth !== undefined) copy.width = this.evalExprRaw(copy.rawWidth, ctx);

      return copy;
    });

    const hasGrain = document.getElementById('piece-grain')?.checked || false;
    const isOrganic = document.getElementById('piece-organic')?.checked || false;

    const pieceData = {
      width: pieceW,
      height: pieceH,
      depth: pieceD,
      hasGrain: hasGrain,
      isOrganic: isOrganic || evaluatedOps.some(o => !!o.isOrganicContour),
      operations: evaluatedOps,
      customVariables: JSON.parse(JSON.stringify(this.customVariables || {}))
    };

    Storage.saveProjectPiece(folderName, pieceName, pieceData);
    this.closeSavePieceModal();
    this.renderNestingProjects();
    showToast(`Peça "${pieceName}" salva na pasta "${folderName}"!`, 'success');
  },

  togglePieceGrain() {
    const cb = document.getElementById('piece-grain');
    const hasGrain = cb ? cb.checked : false;
    if (typeof PieceEditor !== 'undefined') {
      PieceEditor.hasGrain = hasGrain;
      PieceEditor.draw();
    }
  },

  togglePieceOrganic() {
    this.updateOrganicPieceState();
    if (typeof PieceEditor !== 'undefined') {
      PieceEditor.draw();
    }
  },

  // ── Nesting Project & Pieces Manager ────────────────────────

  // ── Nesting Project & Pieces Manager ────────────────────────

  expandedFolders: new Set(),
  selectedPieceIds: new Set(),

  toggleFolderAccordion(folderName) {
    const key = folderName.toLowerCase();
    if (this.expandedFolders.has(key)) {
      this.expandedFolders.delete(key);
    } else {
      this.expandedFolders.add(key);
    }
    this.renderNestingProjects();
  },

  expandAllNestingFolders() {
    const projects = Storage.getProjects();
    (projects.folders || []).forEach(f => this.expandedFolders.add(f.name.toLowerCase()));
    this.renderNestingProjects();
  },

  collapseAllNestingFolders() {
    this.expandedFolders.clear();
    this.renderNestingProjects();
  },

  selectAllNestingPieces() {
    const projects = Storage.getProjects();
    (projects.folders || []).forEach(f => {
      (f.pieces || []).forEach(p => this.selectedPieceIds.add(p.id));
    });
    this.renderNestingProjects();
  },

  deselectAllNestingPieces() {
    this.selectedPieceIds.clear();
    this.renderNestingProjects();
  },

  toggleFolderSelection(folderName, isChecked) {
    const projects = Storage.getProjects();
    const folder = projects.folders.find(f => f.name.toLowerCase() === folderName.toLowerCase());
    if (folder && folder.pieces) {
      folder.pieces.forEach(p => {
        if (isChecked) {
          this.selectedPieceIds.add(p.id);
        } else {
          this.selectedPieceIds.delete(p.id);
        }
      });
    }
    this.renderNestingProjects();
  },

  togglePieceSelection(pieceId, isChecked) {
    if (isChecked) {
      this.selectedPieceIds.add(pieceId);
    } else {
      this.selectedPieceIds.delete(pieceId);
    }
    this.renderNestingProjects();
  },

  updatePieceQty(folderName, pieceId, newQty) {
    const qty = Math.max(1, parseInt(newQty) || 1);
    Storage.updateProjectPieceQty(folderName, pieceId, qty);
  },

  renderNestingProjects() {
    const container = document.getElementById('nesting-pieces-container');
    const searchVal = (document.getElementById('nesting-search-input')?.value || '').trim().toLowerCase();
    if (!container) return;

    const projects = Storage.getProjects();
    if (!projects.folders || projects.folders.length === 0) {
      container.innerHTML = `
        <div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 20px;">
          Nenhum projeto salvo.<br>Clique em "💾 Salvar Peça" para cadastrar peças por pasta.
        </div>
      `;
      return;
    }

    let filteredFolders = projects.folders;
    if (searchVal) {
      filteredFolders = projects.folders.filter(f => f.name.toLowerCase().includes(searchVal));
    }

    if (filteredFolders.length === 0) {
      container.innerHTML = `
        <div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 20px;">
          Nenhuma pasta encontrada para "${searchVal}".
        </div>
      `;
      return;
    }

    let html = '';
    filteredFolders.forEach(folder => {
      const folderKey = folder.name.toLowerCase();
      const isExpanded = this.expandedFolders.has(folderKey);
      const pieces = folder.pieces || [];
      const totalPieces = pieces.length;

      const checkedCount = pieces.filter(p => this.selectedPieceIds.has(p.id)).length;
      const isFolderChecked = totalPieces > 0 && checkedCount === totalPieces;
      const isFolderPartial = checkedCount > 0 && checkedCount < totalPieces;

      // Group pieces in folder by thickness E
      const groups = {};
      pieces.forEach(p => {
        const key = `${p.depth}mm`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
      });

      html += `
        <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 10px; margin-bottom: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;" onclick="App.toggleFolderAccordion('${folder.name}')">
            <div style="display: flex; align-items: center; gap: 6px;">
              <input type="checkbox" 
                     class="nesting-folder-checkbox" 
                     data-folder="${folder.name}" 
                     ${isFolderChecked ? 'checked' : ''} 
                     ${isFolderPartial ? 'style="opacity: 0.8;"' : ''}
                     onclick="event.stopPropagation()" 
                     onchange="App.toggleFolderSelection('${folder.name}', this.checked)" 
                     title="Selecionar / Desmarcar todas as peças desta pasta">
              <span style="font-size: 12px; font-weight: 700; color: var(--accent);">
                ${isExpanded ? '▼' : '▶'} 📁 Pasta: ${folder.name}
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 10px; color: ${checkedCount > 0 ? '#00e676' : 'var(--text-muted)'}; background: var(--bg-input); padding: 2px 6px; border-radius: 10px; font-weight: 600;">
                ${checkedCount}/${totalPieces} sel.
              </span>
              <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); App.toggleFolderAccordion('${folder.name}')" style="font-size: 10px; padding: 2px 6px;">
                ${isExpanded ? '▲ Recolher' : '▼ Expandir'}
              </button>
              <button class="var-action-btn del" onclick="event.stopPropagation(); App.deleteProjectFolder('${folder.name}')" title="Excluir Pasta">✕</button>
            </div>
          </div>

          <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border); display: ${isExpanded ? 'block' : 'none'};">
      `;

      Object.entries(groups).forEach(([thick, pcs]) => {
        html += `
          <div style="margin-bottom: 8px; border-left: 2px solid var(--accent); padding-left: 8px;">
            <div style="font-size: 10px; font-weight: 700; color: #00e676; margin-bottom: 4px;">⚡ Espessura E = ${thick} (${pcs.length} tipos)</div>
            ${pcs.map(p => {
              const isChecked = this.selectedPieceIds.has(p.id);
              return `
              <div class="nesting-piece-row" style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); padding: 5px 8px; margin-bottom: 4px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05); ${!isChecked ? 'opacity: 0.55;' : ''}">
                <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer; flex: 1;">
                  <input type="checkbox" 
                         class="nesting-piece-checkbox" 
                         data-folder="${folder.name}" 
                         data-piece-id="${p.id}" 
                         ${isChecked ? 'checked' : ''}
                         onchange="App.togglePieceSelection('${p.id}', this.checked)"
                         onclick="event.stopPropagation()">
                  <strong>${p.name}</strong> 
                  <span style="font-size: 9px; color: #8a92a8;">(${p.width}×${p.height}×${p.depth}mm)</span>
                  ${p.hasGrain ? '<span style="font-size: 9px; color: #d97706; font-weight: bold; background: rgba(217, 119, 6, 0.15); padding: 1px 4px; border-radius: 3px;" title="Veio Fixo / Sem Rotação">🪵 Veio</span>' : ''}
                </label>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 10px; color: var(--text-muted); font-weight: 600;">Qtd:</span>
                  <input type="number" 
                         class="nesting-piece-qty" 
                         data-folder="${folder.name}" 
                         data-piece-id="${p.id}" 
                         value="${p.qty || 1}" 
                         min="1" max="999" 
                         style="width: 46px; padding: 2px 4px; font-size: 11px; text-align: center; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-input); color: var(--accent); font-weight: bold;" 
                         onchange="App.updatePieceQty('${folder.name}', '${p.id}', this.value)" 
                         onclick="event.stopPropagation()"
                         title="Quantidade de cópias desta peça para o plano de corte">
                  <button class="var-action-btn del" onclick="event.stopPropagation(); App.deleteProjectPiece('${folder.name}', '${p.id}')" title="Excluir Peça">✕</button>
                </div>
              </div>
            `;}).join('')}
          </div>
        `;
      });

      html += `</div></div>`;
    });

    container.innerHTML = html;
  },

  deleteProjectFolder(folderName) {
    if (confirm(`Deseja excluir a pasta "${folderName}" e todas as peças contidas nela?`)) {
      Storage.deleteProjectFolder(folderName);
      this.renderNestingProjects();
      showToast(`Pasta "${folderName}" excluída.`, 'info');
    }
  },

  deleteProjectPiece(folderName, pieceId) {
    Storage.deleteProjectPiece(folderName, pieceId);
    this.renderNestingProjects();
    showToast('Peça removida.', 'info');
  },

  runNestingCalculation() {
    const projects = Storage.getProjects();
    if (!projects.folders || projects.folders.length === 0) {
      showToast('Nenhum projeto ou peça cadastrada para Nesting.', 'error');
      return;
    }

    const selectedPieces = [];

    projects.folders.forEach(folder => {
      (folder.pieces || []).forEach(piece => {
        if (this.selectedPieceIds.has(piece.id)) {
          const qty = piece.qty || 1;
          for (let i = 0; i < qty; i++) {
            selectedPieces.push({
              ...piece,
              id: `${piece.id}_inst_${i + 1}`,
              originalId: piece.id,
              instanceIndex: i + 1,
              name: qty > 1 ? `${piece.name} (#${i + 1}/${qty})` : piece.name
            });
          }
        }
      });
    });

    if (selectedPieces.length === 0) {
      showToast('Nenhuma peça selecionada. Marque uma pasta ou peça para o plano de corte.', 'error');
      return;
    }

    const thicknesses = new Set(selectedPieces.map(p => p.depth));
    if (thicknesses.size > 1) {
      showToast('Atenção: Selecione apenas peças da mesma espessura para o mesmo plano de corte.', 'error');
      return;
    }

    const sheetW = this.parseInputVal('nesting-sheet-w', 1850);
    const sheetH = this.parseInputVal('nesting-sheet-h', 2750);
    const toolId = document.getElementById('nesting-cutter-select').value;
    const extraGap = this.parseInputVal('nesting-gap', 2);
    const extraCutDepth = this.parseInputVal('nesting-extra-cut', 0.3);

    const tool = Storage.getToolById(toolId);
    if (!tool) {
      showToast('Selecione a fresa de corte da máquina.', 'error');
      return;
    }

    const sheets = NestingEngine.calculateNesting(selectedPieces, sheetW, sheetH, tool, extraGap, extraCutDepth);
    this.renderSheetTabs(sheets);
    const totalPlaced = sheets.reduce((sum, s) => sum + s.placedPieces.length, 0);
    showToast(`Plano de Corte gerado com ${totalPlaced} peças em ${sheets.length} chapa${sheets.length > 1 ? 's' : ''}!`, 'success');
  },

  renderSheetTabs(sheets) {
    const bar = document.getElementById('nesting-sheet-tabs-bar');
    const container = document.getElementById('nesting-sheet-tabs-container');
    if (!bar || !container) return;

    if (!sheets || sheets.length <= 1) {
      bar.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    bar.style.display = 'flex';
    let html = '';
    sheets.forEach((sheet, idx) => {
      const isActive = idx === NestingEngine.activeSheetIndex;
      html += `
        <button class="btn ${isActive ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="App.switchNestingSheet(${idx})" style="padding: 4px 10px; font-size: 11px;">
          📄 Chapa ${idx + 1} (${sheet.placedPieces.length} pçs)
        </button>
      `;
    });
    container.innerHTML = html;
  },

  switchNestingSheet(sheetIndex) {
    NestingEngine.setActiveSheet(sheetIndex);
    this.renderSheetTabs(NestingEngine.sheets);
  },

  async saveNestingNC() {
    const status = LicenseManager.getLicenseStatus();
    if (!status.isActivated && !status.isTrial) {
      this.openLicenseModal();
      showToast('O período de Trial expirou. Ative sua licença para exportar o arquivo .NC', 'error');
      return;
    }

    const toolId = document.getElementById('nesting-cutter-select').value;
    const tool = Storage.getToolById(toolId);
    if (!tool) {
      showToast('Selecione a fresa de corte da máquina.', 'error');
      return;
    }

    try {
      const extraCutDepth = this.parseInputVal('nesting-extra-cut', 0.3);
      const ncText = NestingEngine.generateMasterGCode(tool, 10, 2, extraCutDepth);
      if (!ncText) {
        showToast('Execute o cálculo do Plano de Corte antes de gerar o código G.', 'error');
        return;
      }

      const totalSheets = NestingEngine.sheets ? NestingEngine.sheets.length : 1;
      const currentSheetNum = (NestingEngine.activeSheetIndex || 0) + 1;
      const suffix = totalSheets > 1 ? `_Chapa_${currentSheetNum}_de_${totalSheets}` : '';
      const filename = `Plano_Nesting_${NestingEngine.sheetW}x${NestingEngine.sheetH}${suffix}.NC`;
      const exportDir = Storage.getExportPath();
      const autoDirect = Storage.getAutoSaveDirect();

      if (window.api && typeof window.api.saveFile === 'function') {
        const filePath = await window.api.saveFile(filename, ncText, exportDir, autoDirect);
        if (filePath) {
          showToast(`🟢 Plano Nesting salvo com sucesso: ${filePath}`, 'success');
        }
      } else {
        const blob = new Blob([ncText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Arquivo Master ${filename} exportado com sucesso!`, 'success');
      }
    } catch (err) {
      showToast(`Erro ao gerar G-Code do Nesting: ${err.message || err}`, 'error');
      console.error('Erro em saveNestingNC:', err);
    }
  },

  // ── License UI Management ───────────────────────────────────

  updateLicenseBadge() {
    const badge = document.getElementById('license-badge');
    if (!badge) return;
    const status = LicenseManager.getLicenseStatus();

    // Se for Licença Vitalícia ativada, oculta a badge do cabeçalho superior (aparece apenas nas Configurações)
    if (status.isActivated && (status.code === 'VIT' || status.type === 'Vitalícia')) {
      badge.style.display = 'none';
    } else {
      badge.style.display = 'inline-flex';
      badge.textContent = status.statusText;
      badge.style.background = `${status.badgeColor}22`;
      badge.style.borderColor = `${status.badgeColor}55`;
      badge.style.color = status.badgeColor;
    }

    this.applyDemoModeRestrictions();
  },

  applyDemoModeRestrictions() {
    const status = LicenseManager.getLicenseStatus();
    const isDemoMode = !status.isActivated && !status.isTrial;

    // 1. Desativar Abas Nesting e Viewer
    const nestingTabBtn = document.querySelector('.tab-btn[data-tab="nesting-tab"]');
    const viewerTabBtn = document.querySelector('.tab-btn[data-tab="viewer-tab"]');
    if (nestingTabBtn) {
      nestingTabBtn.style.opacity = isDemoMode ? '0.45' : '1';
      nestingTabBtn.title = isDemoMode ? 'Nesting (Desativado no Modo DEMO)' : '';
    }
    if (viewerTabBtn) {
      viewerTabBtn.style.opacity = isDemoMode ? '0.45' : '1';
      viewerTabBtn.title = isDemoMode ? 'Visualizador NC (Desativado no Modo DEMO)' : '';
    }

    // 2. Desativar Checkbox do Veio da Madeira
    const grainCb = document.getElementById('piece-grain');
    if (grainCb) {
      grainCb.disabled = isDemoMode;
      if (isDemoMode) {
        grainCb.checked = false;
        if (typeof PieceEditor !== 'undefined') PieceEditor.hasGrain = false;
      }
    }

    // 3. Desativar Botão Salvar Peça no Projeto
    const savePieceBtn = document.getElementById('btn-save-piece');
    if (savePieceBtn) {
      savePieceBtn.disabled = isDemoMode;
      savePieceBtn.style.opacity = isDemoMode ? '0.45' : '1';
      savePieceBtn.title = isDemoMode ? 'Salvar Peça (Desativado no Modo DEMO)' : '';
    }

    // 4. Desativar Botão Salvar .NC
    const saveNcBtn = document.getElementById('btn-save-nc');
    if (saveNcBtn) {
      saveNcBtn.style.opacity = isDemoMode ? '0.5' : '1';
    }

    // 5. Desativar Sub-aba de Operações Salvas (Biblioteca)
    const libOpsSubtabBtn = document.getElementById('btn-ops-subtab-library');
    if (libOpsSubtabBtn) {
      libOpsSubtabBtn.style.opacity = isDemoMode ? '0.45' : '1';
      libOpsSubtabBtn.title = isDemoMode ? 'Operações Salvas (Desativado no Modo DEMO)' : '';
    }

    // 6. Atualizar Magazine Slot T1 vs T2..T14
    if (typeof ToolsManager !== 'undefined' && ToolsManager.renderMagazine) {
      ToolsManager.renderMagazine();
    }
  },

  // ── Settings & Theme Controller ────────────────────────────

  applyTheme(theme) {
    const activeTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', activeTheme);
    Storage.saveTheme(activeTheme);

    const cardDark = document.getElementById('theme-card-dark');
    const cardLight = document.getElementById('theme-card-light');
    const badgeDark = document.getElementById('theme-badge-dark');
    const badgeLight = document.getElementById('theme-badge-light');

    if (cardDark) cardDark.classList.toggle('active', activeTheme === 'dark');
    if (cardLight) cardLight.classList.toggle('active', activeTheme === 'light');
    if (badgeDark) badgeDark.style.display = activeTheme === 'dark' ? 'inline-block' : 'none';
    if (badgeLight) badgeLight.style.display = activeTheme === 'light' ? 'inline-block' : 'none';

    if (typeof PieceEditor !== 'undefined') PieceEditor.draw();
    if (typeof NestingEngine !== 'undefined') NestingEngine.draw();
  },

  setTheme(theme) {
    this.applyTheme(theme);
    showToast(`Tema alterado para ${theme === 'light' ? '☀️ Light Mode (Claro)' : '🌙 Dark Mode (Escuro)'}!`, 'info');
  },

  updateSettingsLicenseUI() {
    const midEl = document.getElementById('settings-machine-id');
    if (midEl) midEl.value = LicenseManager.getMachineId();

    const status = LicenseManager.getLicenseStatus();
    const textEl = document.getElementById('settings-license-status-text');
    const badgeEl = document.getElementById('settings-license-status-badge');

    if (textEl) textEl.textContent = status.statusText || 'Trial Ativo';
    if (badgeEl) {
      badgeEl.style.background = status.badgeColor || '#00e676';
      badgeEl.style.color = '#000000';
      if (status.isActivated) {
        badgeEl.textContent = status.type ? `Licença ${status.type}` : 'Licença Ativa';
      } else if (status.isTrial) {
        badgeEl.textContent = `${status.daysLeft} Dias de Teste`;
      } else {
        badgeEl.textContent = 'DEMO / Expirado';
      }
    }
    this.updateSettingsExportPathUI();
  },

  copySettingsMachineId() {
    const mid = LicenseManager.copyMachineId();
    showToast(`ID do Computador (${mid}) copiado para a área de transferência!`, 'success');
  },

  activateSettingsKey() {
    const keyInput = document.getElementById('settings-license-key')?.value || '';
    if (!keyInput.trim()) {
      showToast('Informe a chave de ativação.', 'error');
      return;
    }
    const res = LicenseManager.activateKey(keyInput);
    if (res.success) {
      showToast(res.message, 'success');
      this.updateLicenseBadge();
      this.updateSettingsLicenseUI();
      this.applyDemoModeRestrictions();
      const keyEl = document.getElementById('settings-license-key');
      if (keyEl) keyEl.value = '';
    } else {
      showToast(res.message, 'error');
    }
  },

  async selectSettingsExportFolder() {
    if (window.api && typeof window.api.selectFolder === 'function') {
      const folderPath = await window.api.selectFolder();
      if (folderPath) {
        Storage.saveExportPath(folderPath);
        this.updateSettingsExportPathUI();
        showToast(`Pasta de exportação definida: ${folderPath}`, 'success');
      }
    } else {
      showToast('Seleção de pasta disponível no aplicativo Desktop.', 'warning');
    }
  },

  clearSettingsExportFolder() {
    Storage.saveExportPath('');
    this.updateSettingsExportPathUI();
    showToast('Pasta padrão de exportação removida.', 'info');
  },

  toggleAutoSaveDirect(enabled) {
    Storage.saveAutoSaveDirect(enabled);
    showToast(enabled ? 'Salvamento direto ativado!' : 'Salvamento direto desativado.', 'info');
  },

  updateSettingsExportPathUI() {
    const pathEl = document.getElementById('settings-export-path');
    const autoCb = document.getElementById('settings-auto-save-direct');
    if (pathEl) pathEl.value = Storage.getExportPath();
    if (autoCb) autoCb.checked = Storage.getAutoSaveDirect();
  },

  openLicenseModal() {
    this.switchTab('settings-tab');
  },

  closeLicenseModal() {
    const modal = document.getElementById('license-modal');
    if (modal) {
      modal.classList.remove('open');
      modal.classList.remove('active');
    }
  },

  copyMachineId() {
    const mid = LicenseManager.copyMachineId();
    showToast(`ID da Máquina ${mid} copiado!`, 'success');
  },

  submitLicenseActivation() {
    const keyInput = document.getElementById('license-modal-input')?.value;
    if (!keyInput) {
      showToast('Por favor, informe a chave de ativação.', 'error');
      return;
    }

    const res = LicenseManager.activateKey(keyInput);
    if (res.success) {
      this.updateLicenseBadge();
      this.closeLicenseModal();
      showToast(res.message, 'success');
    } else {
      showToast(res.message, 'error');
    }
  },

  // ── Array Copy (Matriz Retangular X/Y) ──────────────────────

  targetOpIndexForArray: null,

  // ── Array Copy (Matriz Retangular X/Y) ──────────────────────

  targetOpIndexForArray: null,

  openArrayCopyModal(opIndex = null) {
    if (opIndex !== null && typeof opIndex === 'number') {
      this.selectedOpIndex = opIndex;
    }

    if (this.selectedOpIndex === null || this.selectedOpIndex < 0 || !this.operations[this.selectedOpIndex]) {
      showToast('Selecione uma operação/vetor no desenho para criar a matriz.', 'error');
      return;
    }

    const op = this.operations[this.selectedOpIndex];
    if (op.type === 'park') {
      showToast('Não é possível criar matriz de um ponto de Park.', 'error');
      return;
    }

    this.targetOpIndexForArray = this.selectedOpIndex;

    const modal = document.getElementById('array-copy-modal');
    const dialog = document.getElementById('array-copy-dialog');
    if (modal) {
      if (dialog && (!dialog.style.left || dialog.style.left === '0px')) {
        const defaultLeft = Math.max(20, Math.round((window.innerWidth - 440) / 2));
        const defaultTop = Math.max(60, Math.round((window.innerHeight - 380) / 2));
        dialog.style.left = `${defaultLeft}px`;
        dialog.style.top = `${defaultTop}px`;
      }

      modal.classList.add('open');
      modal.classList.add('active');
      this.setupModalDraggable();
      this.updateArrayCopyPreview();
    }
  },

  closeArrayCopyModal() {
    const modal = document.getElementById('array-copy-modal');
    if (modal) {
      modal.classList.remove('open');
      modal.classList.remove('active');
    }
    PieceEditor.previewArrayOps = null;
    PieceEditor.draw();
  },

  updateArrayCopyPreview() {
    if (this.targetOpIndexForArray === null || !this.operations[this.targetOpIndexForArray]) return;

    const countX = Math.max(1, parseInt(document.getElementById('array-count-x')?.value || '1'));
    const countY = Math.max(1, parseInt(document.getElementById('array-count-y')?.value || '1'));
    const distX = parseFloat(document.getElementById('array-dist-x')?.value || '0');
    const distY = parseFloat(document.getElementById('array-dist-y')?.value || '0');

    const totalElements = countX * countY;
    const totalCopies = Math.max(0, totalElements - 1);

    const infoEl = document.getElementById('array-copy-preview-info');
    if (infoEl) {
      infoEl.innerHTML = `💡 Total na matriz: <strong>${totalElements} elementos</strong> (1 original + ${totalCopies} cópia${totalCopies !== 1 ? 's' : ''})`;
    }

    const baseOp = this.operations[this.targetOpIndexForArray];
    const previewOps = [];

    for (let r = 0; r < countY; r++) {
      for (let c = 0; c < countX; c++) {
        if (r === 0 && c === 0) continue;
        const offsetX = c * distX;
        const offsetY = r * distY;
        const cloned = this.cloneOpWithOffset(baseOp, offsetX, offsetY);
        previewOps.push(cloned);
      }
    }

    PieceEditor.previewArrayOps = previewOps;
    PieceEditor.draw();
  },

  applyArrayCopy() {
    if (this.targetOpIndexForArray === null || !this.operations[this.targetOpIndexForArray]) {
      showToast('Nenhuma operação selecionada para a matriz.', 'error');
      return;
    }

    const baseOp = this.operations[this.targetOpIndexForArray];

    const countX = Math.max(1, parseInt(document.getElementById('array-count-x')?.value || '1'));
    const countY = Math.max(1, parseInt(document.getElementById('array-count-y')?.value || '1'));
    const distX = parseFloat(document.getElementById('array-dist-x')?.value || '0');
    const distY = parseFloat(document.getElementById('array-dist-y')?.value || '0');

    if (countX === 1 && countY === 1) {
      showToast('Defina a quantidade em X ou Y maior que 1.', 'info');
      this.closeArrayCopyModal();
      return;
    }

    let createdCount = 0;

    for (let r = 0; r < countY; r++) {
      for (let c = 0; c < countX; c++) {
        if (r === 0 && c === 0) continue; // Pula a operação original

        const offsetX = c * distX;
        const offsetY = r * distY;

        const newOp = this.cloneOpWithOffset(baseOp, offsetX, offsetY);
        this.operations.push(newOp);
        createdCount++;
      }
    }

    PieceEditor.previewArrayOps = null;
    this.ensureParkAtEnd();
    this.renderOperationsList();
    PieceEditor.draw();
    this.updateCanvasInfo();
    this.closeArrayCopyModal();
    showToast(`Matriz gerada com sucesso! ${createdCount} novas cópias criadas (${countX * countY} elementos no total).`, 'success');
  },

  // ── Ripado / Matriz de Rasgos Generator ────────────────────

  ripadoOrientation: 'vertical',

  openRipadoModal() {
    const modal = document.getElementById('ripado-modal');
    const dialog = document.getElementById('ripado-dialog');
    const toolSelect = document.getElementById('ripado-tool-select');

    this.refreshToolSelects();

    if (toolSelect && toolSelect.options.length > 0 && !toolSelect.value) {
      toolSelect.selectedIndex = 0;
    }

    if (dialog && modal) {
      const defaultLeft = Math.max(20, Math.round((window.innerWidth - 480) / 2));
      const defaultTop = Math.max(40, Math.round((window.innerHeight - 520) / 2));
      dialog.style.left = `${defaultLeft}px`;
      dialog.style.top = `${defaultTop}px`;

      modal.classList.add('open');
      modal.classList.add('active');
      this.setupModalDraggable();
      this.updateRipadoPreview();
    }
  },

  closeRipadoModal() {
    const modal = document.getElementById('ripado-modal');
    if (modal) {
      modal.classList.remove('open');
      modal.classList.remove('active');
    }
    if (typeof PieceEditor !== 'undefined') {
      PieceEditor.previewArrayOps = null;
      PieceEditor.draw();
    }
  },

  setRipadoOrientation(dir) {
    this.ripadoOrientation = dir;
    const btnVert = document.getElementById('ripado-dir-vert');
    const btnHoriz = document.getElementById('ripado-dir-horiz');
    if (btnVert) btnVert.classList.toggle('active', dir === 'vertical');
    if (btnHoriz) btnHoriz.classList.toggle('active', dir === 'horizontal');
    this.updateRipadoPreview();
  },

  onRipadoZigzagChange(changedMode) {
    const cbSimple = document.getElementById('ripado-zigzag-simple');
    const cbContinuous = document.getElementById('ripado-zigzag-continuous');
    const cbHalves = document.getElementById('ripado-zigzag-halves');

    if (changedMode === 'simple' && cbSimple?.checked) {
      if (cbContinuous) cbContinuous.checked = false;
    } else if (changedMode === 'continuous' && cbContinuous?.checked) {
      if (cbSimple) cbSimple.checked = false;
      if (cbHalves) cbHalves.checked = false;
    } else if (changedMode === 'halves' && cbHalves?.checked) {
      if (cbContinuous) cbContinuous.checked = false;
    }
    this.updateRipadoPreview();
  },

  getRipadoGrooveOrder(count, isHalves) {
    const order = [];
    if (!isHalves || count <= 1) {
      for (let i = 0; i < count; i++) order.push(i);
    } else {
      const firstHalfCount = Math.ceil(count / 2);
      for (let i = 0; i < firstHalfCount; i++) {
        order.push(i);
      }
      for (let i = count - 1; i >= firstHalfCount; i--) {
        order.push(i);
      }
    }
    return order;
  },

  calcRipadoPositions(pieceW, pieceH, l1, l2, a1, a2, count, width, isVert) {
    const totalSpan = isVert ? (pieceW - l1 - l2) : (pieceH - a1 - a2);
    const totalGroovesWidth = count * width;
    const freeSpaceTotal = totalSpan - totalGroovesWidth;

    let gap = 0;
    if (count > 1) {
      gap = freeSpaceTotal / (count - 1);
    } else {
      gap = freeSpaceTotal / 2;
    }

    const positions = [];
    for (let i = 0; i < count; i++) {
      let centerPos = 0;
      if (count === 1) {
        centerPos = (isVert ? l1 : a1) + gap + (width / 2);
      } else {
        centerPos = (isVert ? l1 : a1) + (width / 2) + i * (width + gap);
      }
      positions.push(centerPos);
    }

    return { totalSpan, totalGroovesWidth, freeSpaceTotal, gap, positions };
  },

  getWideGroovePathPoints(isVert, centerPos, l1, l2, a1, a2, pieceW, pieceH, width, toolDiameter, isFlipped) {
    const r = toolDiameter / 2;
    const delta = (width - toolDiameter) / 2;
    const grooveLen = isVert ? (pieceH - a1 - a2) : (pieceW - l1 - l2);
    const step1Dist = Math.min(3 * toolDiameter + 2, Math.max(8, grooveLen * 0.4));
    const step7Dist = Math.min(1 * toolDiameter + 4, Math.max(4, grooveLen * 0.2));

    if (!isVert) { // Horizontal
      const xStart = l1 + r;
      const xEnd = pieceW - l2 - r;
      const yCenter = centerPos;
      const yBottom = yCenter - delta;
      const yTop = yCenter + delta;

      if (!isFlipped) {
        const step1X = xEnd - step1Dist;
        const step7X = xEnd - step7Dist;

        return [
          { x: step1X, y: yCenter },
          { x: step1X, y: yTop },
          { x: xEnd,   y: yTop },
          { x: xEnd,   y: yBottom },
          { x: xStart, y: yBottom },
          { x: xStart, y: yTop },
          { x: step7X, y: yTop },
          { x: step7X, y: yCenter },
          { x: step1X, y: yCenter }
        ];
      } else {
        const step1X = xStart + step1Dist;
        const step7X = xStart + step7Dist;

        return [
          { x: step1X, y: yCenter },
          { x: step1X, y: yBottom },
          { x: xStart, y: yBottom },
          { x: xStart, y: yTop },
          { x: xEnd,   y: yTop },
          { x: xEnd,   y: yBottom },
          { x: step7X, y: yBottom },
          { x: step7X, y: yCenter },
          { x: step1X, y: yCenter }
        ];
      }
    } else { // Vertical
      const yStart = a1 + r;
      const yEnd = pieceH - a2 - r;
      const xCenter = centerPos;
      const xLeft = xCenter - delta;
      const xRight = xCenter + delta;

      if (!isFlipped) {
        const step1Y = yEnd - step1Dist;
        const step7Y = yEnd - step7Dist;

        return [
          { x: xCenter, y: step1Y },
          { x: xRight,  y: step1Y },
          { x: xRight,  y: yEnd },
          { x: xLeft,   y: yEnd },
          { x: xLeft,   y: yStart },
          { x: xRight,  y: yStart },
          { x: xRight,  y: step7Y },
          { x: xCenter, y: step7Y },
          { x: xCenter, y: step1Y }
        ];
      } else {
        const step1Y = yStart + step1Dist;
        const step7Y = yStart + step7Dist;

        return [
          { x: xCenter, y: step1Y },
          { x: xLeft,   y: step1Y },
          { x: xLeft,   y: yStart },
          { x: xRight,  y: yStart },
          { x: xRight,  y: yEnd },
          { x: xLeft,   y: yEnd },
          { x: xLeft,   y: step7Y },
          { x: xCenter, y: step7Y },
          { x: xCenter, y: step1Y }
        ];
      }
    }
  },

  updateRipadoPreview() {
    const pieceW = this.parseInputVal('piece-width', 800);
    const pieceH = this.parseInputVal('piece-height', 500);

    const l1 = this.parseInputVal('ripado-l1', 50);
    const l2 = this.parseInputVal('ripado-l2', 50);
    const a1 = this.parseInputVal('ripado-a1', 0);
    const a2 = this.parseInputVal('ripado-a2', 0);

    const count = Math.max(1, parseInt(document.getElementById('ripado-count')?.value || '5') || 1);
    const width = this.parseInputVal('ripado-width', 10);
    const depth = this.parseInputVal('ripado-depth', 5);
    const toolSelect = document.getElementById('ripado-tool-select');
    const toolId = toolSelect ? toolSelect.value : 't1';

    const tool = Storage.getToolById(toolId);
    const toolDiameter = tool ? (tool.diameter || 6) : 6;
    const isWideGroove = width > toolDiameter;

    const isHalves = !!document.getElementById('ripado-zigzag-halves')?.checked;
    const isSimple = !!document.getElementById('ripado-zigzag-simple')?.checked;
    const isContinuous = !!document.getElementById('ripado-zigzag-continuous')?.checked;
    const isPocket = !!document.getElementById('ripado-pocket')?.checked;
    const isPocketActive = isPocket && isWideGroove;

    const isVert = this.ripadoOrientation === 'vertical';
    const calc = this.calcRipadoPositions(pieceW, pieceH, l1, l2, a1, a2, count, width, isVert);

    const resEl = document.getElementById('ripado-calc-result');
    if (width < toolDiameter) {
      if (resEl) {
        resEl.style.color = '#ff5252';
        resEl.style.background = 'rgba(255, 82, 82, 0.1)';
        resEl.style.borderColor = 'rgba(255, 82, 82, 0.3)';
        resEl.innerHTML = `⚠️ A largura do rasgo (${width}mm) não pode ser menor que o diâmetro da fresa selecionada (Ø${toolDiameter}mm)!`;
      }
      if (typeof PieceEditor !== 'undefined') {
        PieceEditor.previewArrayOps = null;
        PieceEditor.draw();
      }
      return;
    }

    if (resEl) {
      if (calc.freeSpaceTotal < 0) {
        resEl.style.color = '#ff5252';
        resEl.style.background = 'rgba(255, 82, 82, 0.1)';
        resEl.style.borderColor = 'rgba(255, 82, 82, 0.3)';
        resEl.innerHTML = `⚠️ A largura total dos rasgos (${calc.totalGroovesWidth}mm) excede a área útil (${calc.totalSpan}mm)!`;
        if (typeof PieceEditor !== 'undefined') {
          PieceEditor.previewArrayOps = null;
          PieceEditor.draw();
        }
        return;
      } else {
        resEl.style.color = '#00e676';
        resEl.style.background = 'rgba(0, 230, 118, 0.1)';
        resEl.style.borderColor = 'rgba(0, 230, 118, 0.3)';
        const modes = [];
        if (isSimple) modes.push('Zigzag Alternado');
        if (isHalves) modes.push('Por Metades');
        const modeText = isContinuous ? ' | Caminho Contínuo (Com Amarração)' : (modes.length > 0 ? ` | ${modes.join(' + ')}` : '');
        let wideText = '';
        if (isPocketActive) {
          const pInfo = this.getRipadoPocketPathPoints(isVert, calc.positions[0], l1, l2, a1, a2, pieceW, pieceH, width, toolDiameter, false);
          wideText = ` | 🔲 Esvaziamento (${pInfo.numPasses} passadas | Rasgo ${width}mm > Fresa Ø${toolDiameter}mm)`;
        } else if (isWideGroove) {
          wideText = ` | ⚡ Percurso Contorno (${width}mm > Fresa Ø${toolDiameter}mm)`;
        }
        const gapText = count > 1 ? `Vão Livre entre rasgos: <strong>${calc.gap.toFixed(1)} mm</strong>` : `Vão Livre lateral: <strong>${calc.gap.toFixed(1)} mm</strong>`;
        resEl.innerHTML = `📏 ${gapText} (${count} rasgo${count > 1 ? 's' : ''}${modeText}${wideText} | Vão útil: ${calc.totalSpan}mm)`;
      }
    }

    // ── Live Preview em tempo real no Canvas 2D/3D ───────────
    const previewOps = [];

    if (isPocketActive) {
      if (isContinuous) {
        const pInfo0 = this.getRipadoPocketPathPoints(isVert, calc.positions[0], l1, l2, a1, a2, pieceW, pieceH, width, toolDiameter, false);
        const startX = pInfo0.pts[0].x;
        const startY = pInfo0.pts[0].y;
        const segments = [];

        for (let i = 0; i < count; i++) {
          const isFlipped = isSimple && (i % 2 === 1);
          const pInfo = this.getRipadoPocketPathPoints(isVert, calc.positions[i], l1, l2, a1, a2, pieceW, pieceH, width, toolDiameter, isFlipped);
          const pts = pInfo.pts;

          if (i === 0) {
            for (let pIdx = 1; pIdx < pts.length; pIdx++) {
              segments.push({ type: 'line', endX: pts[pIdx].x, endY: pts[pIdx].y });
            }
          } else {
            segments.push({ type: 'line', endX: pts[0].x, endY: pts[0].y });
            for (let pIdx = 1; pIdx < pts.length; pIdx++) {
              segments.push({ type: 'line', endX: pts[pIdx].x, endY: pts[pIdx].y });
            }
          }
        }

        previewOps.push({
          id: 'preview_ripado_path',
          type: 'path',
          toolId,
          correction: 'meio',
          closed: false,
          isPocket: true,
          startPoint: { x: startX, y: startY },
          segments,
          grooveWidth: width,
          depth
        });
      } else {
        const order = this.getRipadoGrooveOrder(count, isHalves);

        for (let k = 0; k < count; k++) {
          const i = order[k];
          const centerPos = calc.positions[i];
          const isFlipped = isSimple && (k % 2 === 1);

          const pInfo = this.getRipadoPocketPathPoints(isVert, centerPos, l1, l2, a1, a2, pieceW, pieceH, width, toolDiameter, isFlipped);
          const pts = pInfo.pts;
          const segments = [];
          for (let pIdx = 1; pIdx < pts.length; pIdx++) {
            segments.push({ type: 'line', endX: pts[pIdx].x, endY: pts[pIdx].y });
          }

          if (isHalves && k === count - 1) {
            previewOps.push({
              id: `preview_ripado_${i}_1`,
              type: 'path',
              toolId,
              correction: 'meio',
              closed: false,
              isPocket: true,
              startPoint: { x: pts[0].x, y: pts[0].y },
              segments,
              grooveWidth: width,
              depth: depth / 2
            });
            previewOps.push({
              id: `preview_ripado_${i}_2`,
              type: 'path',
              toolId,
              correction: 'meio',
              closed: false,
              isPocket: true,
              startPoint: { x: pts[0].x, y: pts[0].y },
              segments,
              grooveWidth: width,
              depth
            });
          } else {
            previewOps.push({
              id: `preview_ripado_${i}`,
              type: 'path',
              toolId,
              correction: 'meio',
              closed: false,
              isPocket: true,
              startPoint: { x: pts[0].x, y: pts[0].y },
              segments,
              grooveWidth: width,
              depth
            });
          }
        }
      }
    } else if (isContinuous) {
      // ── Caminho Contínuo em ZigZag (Path) ────────────────
      const r = toolDiameter / 2;
      if (isVert) {
        const startX = calc.positions[0];
        const startY = a1 + r;
        const segments = [];

        for (let i = 0; i < count; i++) {
          const posX = calc.positions[i];
          if (i === 0) {
            segments.push({ type: 'line', endX: posX, endY: pieceH - a2 - r });
          } else {
            if (i % 2 === 1) { // Desce
              segments.push({ type: 'line', endX: posX, endY: pieceH - a2 - r });
              segments.push({ type: 'line', endX: posX, endY: a1 + r });
            } else { // Sobe
              segments.push({ type: 'line', endX: posX, endY: a1 + r });
              segments.push({ type: 'line', endX: posX, endY: pieceH - a2 - r });
            }
          }
        }

        previewOps.push({
          id: 'preview_ripado_path',
          type: 'path',
          toolId,
          correction: 'meio',
          closed: false,
          startPoint: { x: startX, y: startY },
          segments,
          grooveWidth: width,
          depth
        });
      } else { // Horizontal
        const startX = l1 + r;
        const startY = calc.positions[0];
        const segments = [];

        for (let i = 0; i < count; i++) {
          const posY = calc.positions[i];
          if (i === 0) {
            segments.push({ type: 'line', endX: pieceW - l2 - r, endY: posY });
          } else {
            if (i % 2 === 1) { // Direita -> Esquerda
              segments.push({ type: 'line', endX: pieceW - l2 - r, endY: posY });
              segments.push({ type: 'line', endX: l1 + r, endY: posY });
            } else { // Esquerda -> Direita
              segments.push({ type: 'line', endX: l1 + r, endY: posY });
              segments.push({ type: 'line', endX: pieceW - l2 - r, endY: posY });
            }
          }
        }

        previewOps.push({
          id: 'preview_ripado_path',
          type: 'path',
          toolId,
          correction: 'meio',
          closed: false,
          startPoint: { x: startX, y: startY },
          segments,
          grooveWidth: width,
          depth
        });
      }
    } else if (isWideGroove) {
      // ── Rasgos Largos Individuais (Contorno 8 Seg) ─────────
      const order = this.getRipadoGrooveOrder(count, isHalves);

      for (let k = 0; k < count; k++) {
        const i = order[k];
        const centerPos = calc.positions[i];
        const isFlipped = isSimple && (k % 2 === 1);

        const pts = this.getWideGroovePathPoints(isVert, centerPos, l1, l2, a1, a2, pieceW, pieceH, width, toolDiameter, isFlipped);
        const segments = [];
        for (let pIdx = 1; pIdx < pts.length; pIdx++) {
          segments.push({ type: 'line', endX: pts[pIdx].x, endY: pts[pIdx].y });
        }

        if (isHalves && k === count - 1) {
          previewOps.push({
            id: `preview_ripado_${i}_1`,
            type: 'path',
            toolId,
            correction: 'meio',
            closed: false,
            startPoint: { x: pts[0].x, y: pts[0].y },
            segments,
            grooveWidth: width,
            depth: depth / 2
          });
          previewOps.push({
            id: `preview_ripado_${i}_2`,
            type: 'path',
            toolId,
            correction: 'meio',
            closed: false,
            startPoint: { x: pts[0].x, y: pts[0].y },
            segments,
            grooveWidth: width,
            depth
          });
        } else {
          previewOps.push({
            id: `preview_ripado_${i}`,
            type: 'path',
            toolId,
            correction: 'meio',
            closed: false,
            startPoint: { x: pts[0].x, y: pts[0].y },
            segments,
            grooveWidth: width,
            depth
          });
        }
      }
    } else {
      // ── Linhas Individuais de Largura Igual à Fresa (com desconto de raio) ──
      const r = toolDiameter / 2;
      const order = this.getRipadoGrooveOrder(count, isHalves);

      for (let k = 0; k < count; k++) {
        const i = order[k];
        const centerPos = calc.positions[i];
        let sx, sy, ex, ey;

        const isFlipped = isSimple && (k % 2 === 1);

        if (isVert) {
          if (isFlipped) { // Descendo
            sx = centerPos; sy = pieceH - a2 - r; ex = centerPos; ey = a1 + r;
          } else { // Subindo
            sx = centerPos; sy = a1 + r; ex = centerPos; ey = pieceH - a2 - r;
          }
        } else { // Horizontal
          if (isFlipped) { // Direita -> Esquerda
            sx = pieceW - l2 - r; sy = centerPos; ex = l1 + r; ey = centerPos;
          } else { // Esquerda -> Direita
            sx = l1 + r; sy = centerPos; ex = pieceW - l2 - r; ey = centerPos;
          }
        }

        if (isHalves && k === count - 1) {
          previewOps.push({
            id: `preview_ripado_${i}_1`,
            type: 'line',
            toolId,
            correction: 'meio',
            startX: sx,
            startY: sy,
            endX: ex,
            endY: ey,
            grooveWidth: width,
            depth: depth / 2
          });
          previewOps.push({
            id: `preview_ripado_${i}_2`,
            type: 'line',
            toolId,
            correction: 'meio',
            startX: sx,
            startY: sy,
            endX: ex,
            endY: ey,
            grooveWidth: width,
            depth
          });
        } else {
          previewOps.push({
            id: `preview_ripado_${i}`,
            type: 'line',
            toolId,
            correction: 'meio',
            startX: sx,
            startY: sy,
            endX: ex,
            endY: ey,
            grooveWidth: width,
            depth
          });
        }
      }
    }

    if (typeof PieceEditor !== 'undefined') {
      PieceEditor.previewArrayOps = previewOps;
      PieceEditor.draw();
    }
  },

  generateRipado() {
    if (typeof PieceEditor !== 'undefined') {
      PieceEditor.previewArrayOps = null;
    }
    const pieceW = this.parseInputVal('piece-width', 800);
    const pieceH = this.parseInputVal('piece-height', 500);

    const l1 = this.parseInputVal('ripado-l1', 50);
    const l2 = this.parseInputVal('ripado-l2', 50);
    const a1 = this.parseInputVal('ripado-a1', 0);
    const a2 = this.parseInputVal('ripado-a2', 0);

    const count = Math.max(1, parseInt(document.getElementById('ripado-count')?.value || '5') || 1);
    const width = this.parseInputVal('ripado-width', 10);
    const depth = this.parseInputVal('ripado-depth', 5);
    const rawL1 = this.getRawInputVal('ripado-l1', '50');
    const rawL2 = this.getRawInputVal('ripado-l2', '50');
    const rawA1 = this.getRawInputVal('ripado-a1', '0');
    const rawA2 = this.getRawInputVal('ripado-a2', '0');
    const rawWidth = this.getRawInputVal('ripado-width', '10');
    const rawDepth = this.getRawInputVal('ripado-depth', '5');

    const toolSelect = document.getElementById('ripado-tool-select');
    const toolId = toolSelect ? toolSelect.value : 't1';
    if (!toolId) { showToast('Selecione uma fresa para os rasgos.', 'error'); return; }

    const tool = Storage.getToolById(toolId);
    const toolDiameter = tool ? (tool.diameter || 6) : 6;
    const isWideGroove = width > toolDiameter;

    if (width < toolDiameter) {
      showToast(`A largura do rasgo (${width}mm) não pode ser menor que o diâmetro da fresa selecionada (Ø${toolDiameter}mm)!`, 'error');
      return;
    }

    const isHalves = !!document.getElementById('ripado-zigzag-halves')?.checked;
    const isSimple = !!document.getElementById('ripado-zigzag-simple')?.checked;
    const isContinuous = !!document.getElementById('ripado-zigzag-continuous')?.checked;
    const isPocket = !!document.getElementById('ripado-pocket')?.checked;
    const isPocketActive = isPocket && isWideGroove;

    const isVert = this.ripadoOrientation === 'vertical';
    const calc = this.calcRipadoPositions(pieceW, pieceH, l1, l2, a1, a2, count, width, isVert);

    if (calc.freeSpaceTotal < 0) {
      showToast('Reduza a quantidade ou largura dos rasgos. O total excede a área útil!', 'error');
      return;
    }

    if (isPocketActive) {
      const numPasses = this.getRipadoPocketPathPoints(isVert, calc.positions[0], l1, l2, a1, a2, pieceW, pieceH, width, toolDiameter, false).numPasses;

      if (isContinuous) {
        const pInfo0 = this.getRipadoPocketPathPoints(isVert, calc.positions[0], l1, l2, a1, a2, pieceW, pieceH, width, toolDiameter, false);
        const startX = pInfo0.pts[0].x;
        const startY = pInfo0.pts[0].y;
        const segments = [];

        for (let i = 0; i < count; i++) {
          const isFlipped = isSimple && (i % 2 === 1);
          const pInfo = this.getRipadoPocketPathPoints(isVert, calc.positions[i], l1, l2, a1, a2, pieceW, pieceH, width, toolDiameter, isFlipped);
          const pts = pInfo.pts;

          if (i === 0) {
            for (let pIdx = 1; pIdx < pts.length; pIdx++) {
              segments.push({ type: 'line', endX: pts[pIdx].x, endY: pts[pIdx].y });
            }
          } else {
            segments.push({ type: 'line', endX: pts[0].x, endY: pts[0].y });
            for (let pIdx = 1; pIdx < pts.length; pIdx++) {
              segments.push({ type: 'line', endX: pts[pIdx].x, endY: pts[pIdx].y });
            }
          }
        }

        const op = {
          id: Storage.generateId(),
          type: 'path',
          toolId,
          correction: 'meio',
          closed: false,
          isPocket: true,
          startPoint: { x: startX, y: startY },
          segments,
          grooveWidth: width,
          depth: depth,
          rawGrooveWidth: rawWidth,
          rawDepth: rawDepth,
          label: `Ripado Contínuo Esvaziamento ${width}mm (Fresa Ø${toolDiameter}mm, ${numPasses} passadas/rasgo)`
        };

        this.operations.push(op);
      } else {
        const order = this.getRipadoGrooveOrder(count, isHalves);

        for (let k = 0; k < count; k++) {
          const i = order[k];
          const centerPos = calc.positions[i];
          const isFlipped = isSimple && (k % 2 === 1);

          const pInfo = this.getRipadoPocketPathPoints(isVert, centerPos, l1, l2, a1, a2, pieceW, pieceH, width, toolDiameter, isFlipped);
          const pts = pInfo.pts;
          const segments = [];
          for (let pIdx = 1; pIdx < pts.length; pIdx++) {
            segments.push({ type: 'line', endX: pts[pIdx].x, endY: pts[pIdx].y });
          }

          if (isHalves && k === count - 1) {
            const halfDepth = depth / 2;
            const halfRawDepth = rawDepth ? `(${rawDepth}) / 2` : undefined;

            const op1 = {
              id: Storage.generateId(),
              type: 'path',
              toolId,
              correction: 'meio',
              closed: false,
              isPocket: true,
              startPoint: { x: pts[0].x, y: pts[0].y },
              segments,
              grooveWidth: width,
              depth: halfDepth,
              rawGrooveWidth: rawWidth,
              rawDepth: halfRawDepth,
              label: `Rasgo ${i + 1} Esvaziamento ${width}mm (1ª Passada / Metade: ${halfDepth}mm)`
            };
            this.operations.push(op1);

            const op2 = {
              id: Storage.generateId(),
              type: 'path',
              toolId,
              correction: 'meio',
              closed: false,
              isPocket: true,
              startPoint: { x: pts[0].x, y: pts[0].y },
              segments,
              grooveWidth: width,
              depth: depth,
              rawGrooveWidth: rawWidth,
              rawDepth: rawDepth,
              label: `Rasgo ${i + 1} Esvaziamento ${width}mm (2ª Passada / Total: ${depth}mm)`
            };
            this.operations.push(op2);
          } else {
            const op = {
              id: Storage.generateId(),
              type: 'path',
              toolId,
              correction: 'meio',
              closed: false,
              isPocket: true,
              startPoint: { x: pts[0].x, y: pts[0].y },
              segments,
              grooveWidth: width,
              depth: depth,
              rawGrooveWidth: rawWidth,
              rawDepth: rawDepth,
              label: `Rasgo ${i + 1} Esvaziamento ${width}mm (Fresa Ø${toolDiameter}mm, ${numPasses} passadas)`
            };
            this.operations.push(op);
          }
        }
      }

      this.ensureParkAtEnd();
      this.renderOperationsList();
      PieceEditor.draw();
      this.updateCanvasInfo();
      this.closeRipadoModal();
      showToast(`Ripado gerado! Esvaziamento de ${width}mm com fresa de Ø${toolDiameter}mm (${count} rasgo${count > 1 ? 's' : ''}, ${numPasses} passadas/rasgo).`, 'success');
      return;
    }

    if (isContinuous) {
      // ── Gerar 1 Única Operação de Caminho Contínuo (Path) ───
      const r = toolDiameter / 2;
      let startX, startY, rawStartX, rawStartY;
      const segments = [];

      if (isVert) {
        startX = calc.positions[0];
        startY = a1 + r;
        rawStartX = count === 1 ? `(${rawL1}) + (${calc.gap.toFixed(2)}) + (${rawWidth}/2)` : `(${rawL1}) + (${rawWidth}/2)`;
        rawStartY = `(${rawA1}) + ${r}`;

        for (let i = 0; i < count; i++) {
          const posX = calc.positions[i];
          const rawPosX = count === 1 ? rawStartX : `(${rawL1}) + (${rawWidth}/2) + (${i}) * (${(width + calc.gap).toFixed(2)})`;

          if (i === 0) {
            segments.push({ type: 'line', endX: posX, endY: pieceH - a2 - r, rawEndX: rawPosX, rawEndY: `A - (${rawA2}) - ${r}` });
          } else {
            if (i % 2 === 1) { // Desce
              segments.push({ type: 'line', endX: posX, endY: pieceH - a2 - r, rawEndX: rawPosX, rawEndY: `A - (${rawA2}) - ${r}` });
              segments.push({ type: 'line', endX: posX, endY: a1 + r, rawEndX: rawPosX, rawEndY: `(${rawA1}) + ${r}` });
            } else { // Sobe
              segments.push({ type: 'line', endX: posX, endY: a1 + r, rawEndX: rawPosX, rawEndY: `(${rawA1}) + ${r}` });
              segments.push({ type: 'line', endX: posX, endY: pieceH - a2 - r, rawEndX: rawPosX, rawEndY: `A - (${rawA2}) - ${r}` });
            }
          }
        }
      } else { // Horizontal
        startX = l1 + r;
        startY = calc.positions[0];
        rawStartX = `(${rawL1}) + ${r}`;
        rawStartY = count === 1 ? `(${rawA1}) + (${calc.gap.toFixed(2)}) + (${rawWidth}/2)` : `(${rawA1}) + (${rawWidth}/2)`;

        for (let i = 0; i < count; i++) {
          const posY = calc.positions[i];
          const rawPosY = count === 1 ? rawStartY : `(${rawA1}) + (${rawWidth}/2) + (${i}) * (${(width + calc.gap).toFixed(2)})`;

          if (i === 0) {
            segments.push({ type: 'line', endX: pieceW - l2 - r, endY: posY, rawEndX: `L - (${rawL2}) - ${r}`, rawEndY: rawPosY });
          } else {
            if (i % 2 === 1) { // Direita -> Esquerda
              segments.push({ type: 'line', endX: pieceW - l2 - r, endY: posY, rawEndX: `L - (${rawL2}) - ${r}`, rawEndY: rawPosY });
              segments.push({ type: 'line', endX: l1 + r, endY: posY, rawEndX: `(${rawL1}) + ${r}`, rawEndY: rawPosY });
            } else { // Esquerda -> Direita
              segments.push({ type: 'line', endX: l1 + r, endY: posY, rawEndX: `(${rawL1}) + ${r}`, rawEndY: rawPosY });
              segments.push({ type: 'line', endX: pieceW - l2 - r, endY: posY, rawEndX: `L - (${rawL2}) - ${r}`, rawEndY: rawPosY });
            }
          }
        }
      }

      const op = {
        id: Storage.generateId(),
        type: 'path',
        toolId,
        correction: 'meio',
        closed: false,
        startPoint: { x: startX, y: startY },
        rawStartPoint: { x: rawStartX, y: rawStartY },
        segments,
        grooveWidth: width,
        depth: depth,
        rawGrooveWidth: rawWidth,
        rawDepth: rawDepth,
        label: `Ripado Contínuo (${count} rasgos, ${width}mm)`
      };

      this.operations.push(op);
      this.ensureParkAtEnd();
      this.renderOperationsList();
      PieceEditor.draw();
      this.updateCanvasInfo();
      this.closeRipadoModal();
      showToast(`Ripado gerado! 1 percurso contínuo em Zigzag com amarração gerado (${count} rasgos, vão livre: ${calc.gap.toFixed(1)}mm).`, 'success');
      return;
    }

    if (isWideGroove) {
      // ── Rasgos Largos Individuais (Contorno 8 Seg) ─────────
      let createdCount = 0;
      const order = this.getRipadoGrooveOrder(count, isHalves);

      for (let k = 0; k < count; k++) {
        const i = order[k];
        const centerPos = calc.positions[i];
        const isFlipped = isSimple && (k % 2 === 1);

        const pts = this.getWideGroovePathPoints(isVert, centerPos, l1, l2, a1, a2, pieceW, pieceH, width, toolDiameter, isFlipped);
        const segments = [];
        for (let pIdx = 1; pIdx < pts.length; pIdx++) {
          segments.push({ type: 'line', endX: pts[pIdx].x, endY: pts[pIdx].y });
        }

        if (isHalves && k === count - 1) {
          const halfDepth = depth / 2;
          const halfRawDepth = rawDepth ? `(${rawDepth}) / 2` : undefined;

          const op1 = {
            id: Storage.generateId(),
            type: 'path',
            toolId,
            correction: 'meio',
            closed: false,
            startPoint: { x: pts[0].x, y: pts[0].y },
            segments,
            grooveWidth: width,
            depth: halfDepth,
            rawGrooveWidth: rawWidth,
            rawDepth: halfRawDepth,
            label: `Rasgo ${i + 1} (${width}mm - 1ª Passada: ${halfDepth}mm)`
          };

          const op2 = {
            id: Storage.generateId(),
            type: 'path',
            toolId,
            correction: 'meio',
            closed: false,
            startPoint: { x: pts[0].x, y: pts[0].y },
            segments,
            grooveWidth: width,
            depth: depth,
            rawGrooveWidth: rawWidth,
            rawDepth: rawDepth,
            label: `Rasgo ${i + 1} (${width}mm - 2ª Passada: ${depth}mm)`
          };

          this.operations.push(op1);
          this.operations.push(op2);
          createdCount += 2;
        } else {
          const op = {
            id: Storage.generateId(),
            type: 'path',
            toolId,
            correction: 'meio',
            closed: false,
            startPoint: { x: pts[0].x, y: pts[0].y },
            segments,
            grooveWidth: width,
            depth: depth,
            rawGrooveWidth: rawWidth,
            rawDepth: rawDepth,
            label: `Rasgo ${i + 1} (${width}mm)`
          };

          this.operations.push(op);
          createdCount++;
        }
      }

      this.ensureParkAtEnd();
      this.renderOperationsList();
      PieceEditor.draw();
      this.updateCanvasInfo();
      this.closeRipadoModal();

      const modeDescList = [];
      if (isSimple) modeDescList.push('Zigzag Alternado');
      if (isHalves) modeDescList.push('por Metades');
      const modeDesc = modeDescList.length > 0 ? ` (${modeDescList.join(' + ')})` : '';

      showToast(`Ripado gerado! ${createdCount} rasgo${createdCount > 1 ? 's' : ''} inserido${createdCount > 1 ? 's' : ''}${modeDesc} (Vão livre: ${calc.gap.toFixed(1)}mm).`, 'success');
      return;
    }

    // ── Linhas Soltas (Normal, Zigzag Solto, por Metades quando largura == fresa) ────
    const r = toolDiameter / 2;
    let createdCount = 0;
    const order = this.getRipadoGrooveOrder(count, isHalves);

    for (let k = 0; k < count; k++) {
      const i = order[k];
      const centerPos = calc.positions[i];
      let sx, sy, ex, ey, rawSx, rawSy, rawEx, rawEy;

      const isFlipped = isSimple && (k % 2 === 1);

      if (isVert) {
        if (count === 1) {
          rawSx = `(${rawL1}) + (${calc.gap.toFixed(2)}) + (${rawWidth}/2)`;
        } else {
          rawSx = `(${rawL1}) + (${rawWidth}/2) + (${i}) * (${(width + calc.gap).toFixed(2)})`;
        }

        if (isFlipped) { // Descendo
          sx = centerPos; sy = pieceH - a2 - r; ex = centerPos; ey = a1 + r;
          rawSy = `A - (${rawA2}) - ${r}`; rawEx = rawSx; rawEy = `(${rawA1}) + ${r}`;
        } else { // Subindo
          sx = centerPos; sy = a1 + r; ex = centerPos; ey = pieceH - a2 - r;
          rawSy = `(${rawA1}) + ${r}`; rawEx = rawSx; rawEy = `A - (${rawA2}) - ${r}`;
        }
      } else { // Horizontal
        if (count === 1) {
          rawSy = `(${rawA1}) + (${calc.gap.toFixed(2)}) + (${rawWidth}/2)`;
        } else {
          rawSy = `(${rawA1}) + (${rawWidth}/2) + (${i}) * (${(width + calc.gap).toFixed(2)})`;
        }

        if (isFlipped) { // Direita -> Esquerda
          sx = pieceW - l2 - r; sy = centerPos; ex = l1 + r; ey = centerPos;
          rawSx = `L - (${rawL2}) - ${r}`; rawEx = `(${rawL1}) + ${r}`; rawEy = rawSy;
        } else { // Esquerda -> Direita
          sx = l1 + r; sy = centerPos; ex = pieceW - l2 - r; ey = centerPos;
          rawSx = `(${rawL1}) + ${r}`; rawEx = `L - (${rawL2}) - ${r}`; rawEy = rawSy;
        }
      }

      if (isHalves && k === count - 1) {
        const halfDepth = depth / 2;
        const halfRawDepth = rawDepth ? `(${rawDepth}) / 2` : undefined;

        const op1 = {
          id: Storage.generateId(),
          type: 'line',
          toolId: toolId,
          correction: 'meio',
          startX: sx,
          startY: sy,
          endX: ex,
          endY: ey,
          grooveWidth: width,
          depth: halfDepth,
          rawStartX: rawSx,
          rawStartY: rawSy,
          rawEndX: rawEx,
          rawEndY: rawEy,
          rawGrooveWidth: rawWidth,
          rawDepth: halfRawDepth,
          label: `Rasgo ${i + 1} (${width}mm - 1ª Passada: ${halfDepth}mm)`
        };

        const op2 = {
          id: Storage.generateId(),
          type: 'line',
          toolId: toolId,
          correction: 'meio',
          startX: sx,
          startY: sy,
          endX: ex,
          endY: ey,
          grooveWidth: width,
          depth: depth,
          rawStartX: rawSx,
          rawStartY: rawSy,
          rawEndX: rawEx,
          rawEndY: rawEy,
          rawGrooveWidth: rawWidth,
          rawDepth: rawDepth,
          label: `Rasgo ${i + 1} (${width}mm - 2ª Passada: ${depth}mm)`
        };

        this.operations.push(op1);
        this.operations.push(op2);
        createdCount += 2;
      } else {
        const op = {
          id: Storage.generateId(),
          type: 'line',
          toolId: toolId,
          correction: 'meio',
          startX: sx,
          startY: sy,
          endX: ex,
          endY: ey,
          grooveWidth: width,
          depth: depth,
          rawStartX: rawSx,
          rawStartY: rawSy,
          rawEndX: rawEx,
          rawEndY: rawEy,
          rawGrooveWidth: rawWidth,
          rawDepth: rawDepth,
          label: `Rasgo ${i + 1} (${width}mm)`
        };

        this.operations.push(op);
        createdCount++;
      }
    }

    this.ensureParkAtEnd();
    this.renderOperationsList();
    PieceEditor.draw();
    this.updateCanvasInfo();
    this.closeRipadoModal();

    const modeDescList = [];
    if (isSimple) modeDescList.push('Zigzag Alternado');
    if (isHalves) modeDescList.push('por Metades');
    const modeDesc = modeDescList.length > 0 ? ` (${modeDescList.join(' + ')})` : '';

    showToast(`Ripado gerado! ${createdCount} rasgo${createdCount > 1 ? 's' : ''} inserido${createdCount > 1 ? 's' : ''}${modeDesc} (Vão livre: ${calc.gap.toFixed(1)}mm).`, 'success');
  },

  cloneOpWithOffset(op, offsetX, offsetY) {
    const cloned = JSON.parse(JSON.stringify(op));
    cloned.id = 'op_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    const shiftVal = (val, offset) => {
      if (val === undefined || val === null) return val;
      const num = parseFloat(val);
      if (!isNaN(num) && isFinite(num)) {
        return (num + offset).toString();
      }
      return `${val} + ${offset}`;
    };

    const shiftEvaluated = (targetObj, rawKey, evalKey, offset) => {
      if (!targetObj) return;
      if (targetObj[rawKey] !== undefined) {
        targetObj[rawKey] = shiftVal(targetObj[rawKey], offset);
        targetObj[evalKey] = this.evalExpr(targetObj[rawKey]);
      } else if (targetObj[evalKey] !== undefined) {
        const num = parseFloat(targetObj[evalKey]);
        if (!isNaN(num)) targetObj[evalKey] = num + offset;
      }
    };

    if (cloned.type === 'line' || cloned.type === 'curve') {
      shiftEvaluated(cloned, 'rawStartX', 'startX', offsetX);
      shiftEvaluated(cloned, 'rawStartY', 'startY', offsetY);
      shiftEvaluated(cloned, 'rawEndX', 'endX', offsetX);
      shiftEvaluated(cloned, 'rawEndY', 'endY', offsetY);
      if (cloned.type === 'curve') {
        shiftEvaluated(cloned, 'rawControlX', 'controlX', offsetX);
        shiftEvaluated(cloned, 'rawControlY', 'controlY', offsetY);
      }
    } else if (cloned.type === 'circle') {
      shiftEvaluated(cloned, 'rawCenterX', 'centerX', offsetX);
      shiftEvaluated(cloned, 'rawCenterY', 'centerY', offsetY);
    } else if (cloned.type === 'rect') {
      shiftEvaluated(cloned, 'rawX', 'x', offsetX);
      shiftEvaluated(cloned, 'rawY', 'y', offsetY);
    } else if (cloned.type === 'path') {
      shiftEvaluated(cloned, 'rawStartX', 'startX', offsetX);
      shiftEvaluated(cloned, 'rawStartY', 'startY', offsetY);
      if (Array.isArray(cloned.segments)) {
        cloned.segments.forEach(seg => {
          if (seg.endX !== undefined) seg.endX = shiftVal(seg.endX, offsetX);
          if (seg.endY !== undefined) seg.endY = shiftVal(seg.endY, offsetY);
        });
      }
    }

    return cloned;
  }
};

// ── Bootstrap ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
