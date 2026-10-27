// ╔═══════════════════════════════════════════════════════════════╗
// ║  ToolsManager — Cadastro 3D + Magazine 14 posições separadas ║
// ╚═══════════════════════════════════════════════════════════════╝

var ToolsManager = {
  editingToolId: null,
  selectedSlot: null,
  modalSelectedToolId: null,
  activeSubTab: 'register', // 'register' | 'magazine'

  TOOL_ICONS: {
    reta: '🔹',
    limpeza: '🔸',
    cava: '🟢',
    canaletado: '⚙️',
    vbits: '🔻',
    y45: '🔶',
    broca: '🎯'
  },

  TOOL_LABELS: {
    reta: 'Fresa Reta',
    limpeza: 'Fresa Limpeza',
    cava: 'Fresa Cava',
    canaletado: 'Canaletado',
    vbits: 'V-Bits',
    y45: 'Y45°',
    broca: 'Broca'
  },

  init() {
    this.setupSubTabs();
    this.setupLive3DListeners();
    this.renderMagazine();
    this.renderTable();
    Tool3DRenderer.init();
    this.update3DFromForm();
  },

  setupSubTabs() {
    document.querySelectorAll('.tools-subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.subtab;
        this.switchSubTab(target);
      });
    });
  },

  switchSubTab(subtab) {
    this.activeSubTab = subtab;
    document.querySelectorAll('.tools-subtab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.subtab === subtab);
    });

    document.querySelectorAll('.tools-subtab-content').forEach(c => {
      c.classList.remove('active');
    });

    const activeEl = document.getElementById(`tools-subtab-${subtab}`);
    if (activeEl) activeEl.classList.add('active');

    if (subtab === 'register') {
      setTimeout(() => Tool3DRenderer.resizeCanvas(), 50);
    }
  },

  setupLive3DListeners() {
    const inputs = ['tool-type', 'tool-ct', 'tool-ac', 'tool-d', 'tool-h', 'tool-neck-d', 'tool-shank-len', 'tool-angle', 'tool-cava-h', 'tool-top-offset'];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.update3DFromForm());
        el.addEventListener('change', () => this.update3DFromForm());
      }
    });
  },

  onToolTypeChange() {
    const type = document.getElementById('tool-type')?.value;
    const cavaBox = document.getElementById('cava-extra-fields');
    const stepOverGroup = document.getElementById('group-step-over');
    const feedRateGroup = document.getElementById('group-feed-rate');

    const lblAc = document.getElementById('lbl-tool-ac');
    const lblD = document.getElementById('lbl-tool-d');
    const lblH = document.getElementById('lbl-tool-h');

    if (stepOverGroup) stepOverGroup.classList.remove('hidden');
    if (feedRateGroup) feedRateGroup.classList.remove('hidden');

    if (type === 'canaletado') {
      if (lblAc) lblAc.textContent = 'B - Altura Corte (mm)';
      if (lblD) lblD.textContent = 'øD - Diâmetro Total (mm)';
      if (lblH) lblH.textContent = 'øH - Diâmetro Haste (mm)';
      if (cavaBox) cavaBox.classList.add('hidden');

      if (!this.editingToolId) {
        const nameEl = document.getElementById('tool-name');
        if (nameEl && (!nameEl.value || nameEl.value.includes('Cava') || nameEl.value.includes('Y45'))) nameEl.value = 'Fresa Canaletado Ø35mm x 18mm';
        document.getElementById('tool-ct').value = 75;
        document.getElementById('tool-ac').value = 18;
        document.getElementById('tool-d').value = 35;
        document.getElementById('tool-h').value = 16;
      }
    } else if (type === 'y45') {
      if (lblAc) lblAc.textContent = 'B - Altura Corte (mm)';
      if (lblD) lblD.textContent = 'øD - Diâmetro Total (mm)';
      if (lblH) lblH.textContent = 'øH - Diâmetro Haste (mm)';
      if (cavaBox) cavaBox.classList.add('hidden');

      if (!this.editingToolId) {
        const nameEl = document.getElementById('tool-name');
        if (nameEl && (!nameEl.value || nameEl.value.includes('Cava') || nameEl.value.includes('Canaletado'))) nameEl.value = 'Fresa Y45° Meia Esquadria';
        document.getElementById('tool-ct').value = 65;
        document.getElementById('tool-ac').value = 18;
        document.getElementById('tool-d').value = 45;
        document.getElementById('tool-h').value = 16;
      }
    } else if (type === 'cava') {
      if (lblAc) lblAc.textContent = 'AC - Altura Corte (mm)';
      if (lblD) lblD.textContent = 'øD - Diâmetro Maior (mm)';
      if (lblH) lblH.textContent = 'øH - Diâmetro Haste (mm)';
      if (cavaBox) cavaBox.classList.remove('hidden');

      if (!this.editingToolId) {
        const nameEl = document.getElementById('tool-name');
        if (nameEl && (!nameEl.value || nameEl.value.includes('Y45') || nameEl.value.includes('Canaletado'))) nameEl.value = 'Fresa Cava Puxador 36mm x 35°';
        document.getElementById('tool-ct').value = 65;
        document.getElementById('tool-ac').value = 17.5;
        document.getElementById('tool-d').value = 36;
        document.getElementById('tool-h').value = 16;
        document.getElementById('tool-neck-d').value = 18;
        document.getElementById('tool-shank-len').value = 45;
        document.getElementById('tool-angle').value = 35;
        document.getElementById('tool-cava-h').value = 13.5;
        document.getElementById('tool-top-offset').value = 2;
      }
    } else if (type === 'broca') {
      if (lblAc) lblAc.textContent = 'AC - Altura Corte (mm)';
      if (lblD) lblD.textContent = 'øD - Diâmetro Broca (mm)';
      if (lblH) lblH.textContent = 'øH - Diâmetro Haste (mm)';
      if (cavaBox) cavaBox.classList.add('hidden');
      if (stepOverGroup) stepOverGroup.classList.add('hidden');
      if (feedRateGroup) feedRateGroup.classList.add('hidden');

      if (!this.editingToolId) {
        const nameEl = document.getElementById('tool-name');
        if (nameEl) nameEl.value = 'Broca 8mm';
        document.getElementById('tool-ct').value = 70;
        document.getElementById('tool-ac').value = 35;
        document.getElementById('tool-d').value = 8;
        document.getElementById('tool-h').value = 10;
        document.getElementById('tool-pass-depth').value = 15;
        document.getElementById('tool-rpm').value = 4500;
        document.getElementById('tool-plunge-rate').value = 1.5;
      }
    } else {
      if (lblAc) lblAc.textContent = 'AC - Altura Corte (mm)';
      if (lblD) lblD.textContent = 'øD - Diâmetro Maior (mm)';
      if (lblH) lblH.textContent = 'øH - Diâmetro Haste (mm)';
      if (cavaBox) cavaBox.classList.add('hidden');
    }

    this.update3DFromForm();
  },

  update3DFromForm() {
    const data = {
      type: document.getElementById('tool-type')?.value || 'cava',
      CT: parseFloat(document.getElementById('tool-ct')?.value) || 65,
      AC: parseFloat(document.getElementById('tool-ac')?.value) || 17.5,
      D: parseFloat(document.getElementById('tool-d')?.value) || 36,
      H: parseFloat(document.getElementById('tool-h')?.value) || 16,
      neckD: parseFloat(document.getElementById('tool-neck-d')?.value) || 18,
      shankLen: parseFloat(document.getElementById('tool-shank-len')?.value) || 45,
      angle: parseFloat(document.getElementById('tool-angle')?.value) || 35,
      cavaH: parseFloat(document.getElementById('tool-cava-h')?.value) || 13.5,
      topOffset: parseFloat(document.getElementById('tool-top-offset')?.value) || 2
    };
    Tool3DRenderer.updateTool(data);
  },

  // ── Save / Update Tool ──────────────────────────────────────

  saveTool() {
    const name = document.getElementById('tool-name').value.trim();
    if (!name) { showToast('Informe o nome da ferramenta.', 'error'); return; }

    const type = document.getElementById('tool-type').value;

    const tool = {
      id: this.editingToolId || Storage.generateId(),
      name,
      type,
      totalLength: parseFloat(document.getElementById('tool-ct').value) || 65,
      cutHeight: parseFloat(document.getElementById('tool-ac').value) || 17.5,
      diameter: parseFloat(document.getElementById('tool-d').value) || 36,
      shankDiameter: parseFloat(document.getElementById('tool-h').value) || 16,
      neckDiameter: parseFloat(document.getElementById('tool-neck-d')?.value) || 18,
      shankLength: parseFloat(document.getElementById('tool-shank-len')?.value) || 45,
      cavaAngle: parseFloat(document.getElementById('tool-angle')?.value) || 35,
      cavaHeight: parseFloat(document.getElementById('tool-cava-h')?.value) || 13.5,
      topOffset: parseFloat(document.getElementById('tool-top-offset')?.value) || 2,
      passDepth: parseFloat(document.getElementById('tool-pass-depth').value) || 3,
      stepOver: parseFloat(document.getElementById('tool-step-over').value) || 3,
      rpm: parseInt(document.getElementById('tool-rpm').value) || 18000,
      feedRate: parseFloat(document.getElementById('tool-feed-rate').value) || 4,
      plungeRate: parseFloat(document.getElementById('tool-plunge-rate').value) || 1.5
    };

    Storage.saveTool(tool);
    Storage.autoAssignToolToMagazine(tool.id);
    this.editingToolId = null;
    this.clearForm();
    this.renderMagazine();
    this.renderTable();
    App.refreshToolSelects();
    showToast(`Ferramenta "${tool.name}" salva!`, 'success');
  },

  clearForm() {
    document.getElementById('tool-name').value = '';
    document.getElementById('tool-type').value = 'cava';
    document.getElementById('tool-ct').value = '65';
    document.getElementById('tool-ac').value = '17.5';
    document.getElementById('tool-d').value = '36';
    document.getElementById('tool-h').value = '16';
    if (document.getElementById('tool-neck-d')) document.getElementById('tool-neck-d').value = '18';
    if (document.getElementById('tool-shank-len')) document.getElementById('tool-shank-len').value = '45';
    if (document.getElementById('tool-angle')) document.getElementById('tool-angle').value = '35';
    if (document.getElementById('tool-cava-h')) document.getElementById('tool-cava-h').value = '13.5';
    if (document.getElementById('tool-top-offset')) document.getElementById('tool-top-offset').value = '2';

    document.getElementById('tool-pass-depth').value = '3';
    document.getElementById('tool-step-over').value = '3';
    document.getElementById('tool-rpm').value = '18000';
    document.getElementById('tool-feed-rate').value = '4';
    document.getElementById('tool-plunge-rate').value = '1.5';
    document.getElementById('tool-save-btn').textContent = 'Salvar Ferramenta';
    this.onToolTypeChange();
  },

  editTool(id) {
    const tool = Storage.getToolById(id);
    if (!tool) return;
    this.editingToolId = id;
    document.getElementById('tool-name').value = tool.name;
    document.getElementById('tool-type').value = tool.type;
    document.getElementById('tool-ct').value = tool.totalLength || 65;
    document.getElementById('tool-ac').value = tool.cutHeight || 17.5;
    document.getElementById('tool-d').value = tool.diameter || 36;
    document.getElementById('tool-h').value = tool.shankDiameter || 16;
    if (document.getElementById('tool-neck-d')) document.getElementById('tool-neck-d').value = tool.neckDiameter || 18;
    if (document.getElementById('tool-shank-len')) document.getElementById('tool-shank-len').value = tool.shankLength || 45;
    if (document.getElementById('tool-angle')) document.getElementById('tool-angle').value = tool.cavaAngle || 35;
    if (document.getElementById('tool-cava-h')) document.getElementById('tool-cava-h').value = tool.cavaHeight || 13.5;
    if (document.getElementById('tool-top-offset')) document.getElementById('tool-top-offset').value = tool.topOffset || 2;

    document.getElementById('tool-pass-depth').value = tool.passDepth || 3;
    document.getElementById('tool-step-over').value = tool.stepOver || 3;
    document.getElementById('tool-rpm').value = tool.rpm || 18000;
    document.getElementById('tool-feed-rate').value = tool.feedRate || 4;
    document.getElementById('tool-plunge-rate').value = tool.plungeRate || 1.5;
    this.onToolTypeChange();

    App.switchTab('tools-tab');
    this.switchSubTab('register');
    this.update3DFromForm();
  },

  deleteTool(id) {
    const tool = Storage.getToolById(id);
    if (!tool) return;
    if (!confirm(`Excluir a ferramenta "${tool.name}"?`)) return;
    Storage.deleteTool(id);
    this.renderMagazine();
    this.renderTable();
    App.refreshToolSelects();
    showToast(`Ferramenta "${tool.name}" excluída.`, 'info');
  },

  // ── Magazine & Drag & Drop Rendering ───────────────────────────────

  renderMagazine() {
    this._renderMagazineGrid('magazine-grid', 1, 14);
    this._renderMagazineGrid('drill-grid', 21, 30);
    this.renderDraggableTools();
  },

  _renderMagazineGrid(gridId, startSlot, endSlot) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const mag = Storage.getMagazine();
    const status = typeof LicenseManager !== 'undefined' ? LicenseManager.getLicenseStatus() : { isActivated: true };
    const isDemoMode = !status.isActivated && !status.isTrial;
    let html = '';

    for (let i = startSlot; i <= endSlot; i++) {
      const toolId = mag[i];
      const tool = toolId ? Storage.getToolById(toolId) : null;
      const isLockedSlot = isDemoMode && i > 1;

      if (tool) {
        html += `
          <div class="magazine-slot occupied ${isLockedSlot ? 'disabled-demo' : ''}" 
               onclick="ToolsManager.openSlotModal(${i})" 
               draggable="${!isLockedSlot}"
               ondragstart="ToolsManager.handleDragStart(event, '${tool.id}', ${i})"
               ondragover="ToolsManager.handleDragOver(event)"
               ondragleave="ToolsManager.handleDragLeave(event)"
               ondrop="ToolsManager.handleDropSlot(event, ${i})"
               style="${isLockedSlot ? 'opacity: 0.45; cursor: not-allowed; border-color: rgba(255,82,82,0.4);' : ''}"
               title="${isLockedSlot ? `T${i}: Desativado no Modo DEMO` : `T${i}: ${tool.name} (Clique para alterar ou arraste para reposicionar)`}">
            <span class="slot-number">T${i}${isLockedSlot ? ' 🔒' : ''}</span>
            <span class="slot-tool-icon">${this.TOOL_ICONS[tool.type] || '🔹'}</span>
            <span class="slot-tool-name">${tool.name}</span>
            <span class="slot-tool-dims">${isLockedSlot ? 'Modo DEMO' : `Ø${tool.diameter}mm`}</span>
          </div>`;
      } else {
        html += `
          <div class="magazine-slot ${isLockedSlot ? 'disabled-demo' : ''}" 
               onclick="ToolsManager.openSlotModal(${i})"
               ondragover="ToolsManager.handleDragOver(event)"
               ondragleave="ToolsManager.handleDragLeave(event)"
               ondrop="ToolsManager.handleDropSlot(event, ${i})"
               style="${isLockedSlot ? 'opacity: 0.45; cursor: not-allowed; border-color: rgba(255,82,82,0.4);' : ''}"
               title="${isLockedSlot ? `T${i}: Desativado no Modo DEMO` : `T${i}: Vazio (Clique para escolher ou arraste uma ferramenta aqui)`}">
            <span class="slot-number">T${i}${isLockedSlot ? ' 🔒' : ''}</span>
            <span class="slot-empty-label">${isLockedSlot ? 'Bloqueado' : 'Vazio'}</span>
          </div>`;
      }
    }
    grid.innerHTML = html;
  },

  renderDraggableTools() {
    const magContainer = document.getElementById('draggable-tools-list');
    const drillContainer = document.getElementById('draggable-tools-list-drill');
    
    const allTools = Storage.getTools();

    if (magContainer) {
      const magTools = allTools.filter(t => t.type !== 'broca');
      magContainer.innerHTML = this._buildDraggableToolsHtml(magTools, 'Magazine (sem brocas)');
    }

    if (drillContainer) {
      const drillTools = allTools.filter(t => t.type === 'broca');
      drillContainer.innerHTML = this._buildDraggableToolsHtml(drillTools, 'Cabeçote de Furação (apenas brocas)');
    }
  },

  _buildDraggableToolsHtml(tools, emptyTypeLabel) {
    if (tools.length === 0) {
      return `<div style="font-size: 11px; color: var(--text-muted);">Nenhuma ferramenta do tipo ${emptyTypeLabel} cadastrada.</div>`;
    }

    return tools.map(tool => {
      const assignedPos = Storage.getToolPosition(tool.id);
      const isAssigned = !!assignedPos;
      return `
        <div class="draggable-tool-card ${isAssigned ? 'assigned' : ''}"
             draggable="true"
             ondragstart="ToolsManager.handleDragStart(event, '${tool.id}')"
             title="Arraste esta ferramenta até um slot">
          <span style="font-size: 16px;">${this.TOOL_ICONS[tool.type] || '🔹'}</span>
          <div>
            <div style="font-size: 11px; font-weight: 600; color: var(--text-primary);">${tool.name}</div>
            <div style="font-size: 9px; color: var(--text-muted); font-family: monospace;">Ø${tool.diameter}mm · CT:${tool.totalLength}mm</div>
          </div>
          <span class="draggable-badge ${isAssigned ? 'assigned' : ''}">
            ${isAssigned ? `Em T${assignedPos}` : 'Disponível'}
          </span>
        </div>`;
    }).join('');
  },

  // ── Drag & Drop Event Handlers ─────────────────────────────────────

  handleDragStart(e, toolId, fromSlot = null) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ toolId, fromSlot }));
    e.dataTransfer.effectAllowed = 'move';
  },

  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
  },

  handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  },

  handleDropSlot(e, targetSlot) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    const status = typeof LicenseManager !== 'undefined' ? LicenseManager.getLicenseStatus() : { isActivated: true };
    if (!status.isActivated && !status.isTrial && targetSlot > 1) {
      if (typeof showToast === 'function') showToast('No modo DEMO, apenas a posição T1 pode ser utilizada.', 'error');
      if (typeof App !== 'undefined' && App.openLicenseModal) App.openLicenseModal();
      return;
    }

    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const data = JSON.parse(raw);
      const toolId = data.toolId;

      if (!toolId) return;

      const tool = Storage.getToolById(toolId);
      if (!tool) return;

      if (tool.type === 'broca' && targetSlot < 21) {
        if (typeof showToast === 'function') showToast('Brocas só podem ser adicionadas no cabeçote de furação (T21 a T30).', 'error');
        return;
      }
      if (tool.type !== 'broca' && targetSlot >= 21) {
        if (typeof showToast === 'function') showToast('Apenas brocas podem ser adicionadas no cabeçote de furação (T21 a T30).', 'error');
        return;
      }

      Storage.setMagazineSlot(targetSlot, toolId);
      this.renderMagazine();
      this.renderTable();
      if (typeof App !== 'undefined' && App.refreshToolSelects) App.refreshToolSelects();

      if (typeof showToast === 'function') showToast(`Ferramenta "${tool.name}" atribuída à posição T${targetSlot}!`, 'success');
    } catch (err) {
      console.error('Erro no drop do magazine:', err);
    }
  },

  // ── Magazine Modal ──────────────────────────────────────────

  openSlotModal(position) {
    const status = typeof LicenseManager !== 'undefined' ? LicenseManager.getLicenseStatus() : { isActivated: true };
    if (!status.isActivated && !status.isTrial && position > 1) {
      if (typeof showToast === 'function') showToast('No modo DEMO, apenas a ferramenta T1 pode ser utilizada. Ative sua licença para liberar T2..T14.', 'error');
      if (typeof App !== 'undefined' && App.openLicenseModal) App.openLicenseModal();
      return;
    }

    this.selectedSlot = position;
    const mag = Storage.getMagazine();
    const currentToolId = mag[position];
    this.modalSelectedToolId = currentToolId || null;

    const modal = document.getElementById('magazine-modal');
    const title = document.getElementById('magazine-modal-title');
    const container = document.getElementById('magazine-modal-tools');
    const tools = Storage.getTools();

    title.textContent = `Posição T${position} — Escolher Ferramenta`;

    if (tools.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔧</div>Nenhuma ferramenta cadastrada.<br>Cadastre uma na aba Cadastro.</div>';
    } else {
      let html = '<p style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px;">Clique na ferramenta para selecionar (ou duplo clique para atribuir direto):</p>';
      for (const tool of tools) {
        const assignedPos = Storage.getToolPosition(tool.id);
        const isHere = tool.id === currentToolId;
        const isBusy = assignedPos && assignedPos !== position;

        const isInvalid = (tool.type === 'broca' && position < 21) || (tool.type !== 'broca' && position >= 21);
        const isBusyOrInvalid = isBusy || isInvalid;

        let extraInfo = '';
        if (isInvalid) {
            extraInfo = (tool.type === 'broca') ? ' · Incompatível (Apenas T21-T30)' : ' · Incompatível (Apenas T1-T14)';
        } else if (isBusy) {
            extraInfo = ` · Em T${assignedPos}`;
        }

        html += `
          <div class="tool-option ${isHere ? 'selected' : ''}" 
               ${!isBusyOrInvalid ? `onclick="ToolsManager.selectModalTool('${tool.id}')" ondblclick="ToolsManager.selectAndConfirmTool('${tool.id}')"` : ''}
               id="modal-tool-${tool.id}"
               ${isBusyOrInvalid ? 'style="opacity:0.4; cursor:not-allowed;"' : ''}>
            <span style="font-size: 18px;">${this.TOOL_ICONS[tool.type] || '🔹'}</span>
            <div>
              <div class="tool-option-name">${tool.name}</div>
              <div class="tool-option-info">CT:${tool.totalLength}mm AC:${tool.cutHeight}mm Ø${tool.diameter}mm H:${tool.shankDiameter}mm${extraInfo}</div>
            </div>
          </div>`;
      }
      container.innerHTML = html;
    }

    modal.classList.add('open');
    document.getElementById('modal-clear-btn').style.display = currentToolId ? 'inline-flex' : 'none';
  },

  selectModalTool(toolId) {
    this.modalSelectedToolId = toolId;
    document.querySelectorAll('#magazine-modal-tools .tool-option').forEach(el => {
      el.classList.remove('selected');
    });
    const el = document.getElementById(`modal-tool-${toolId}`);
    if (el) el.classList.add('selected');
  },

  selectAndConfirmTool(toolId) {
    this.selectModalTool(toolId);
    this.confirmSlot();
  },

  confirmSlot() {
    if (this.modalSelectedToolId) {
      const tool = Storage.getToolById(this.modalSelectedToolId);
      if (tool) {
        if (tool.type === 'broca' && this.selectedSlot < 21) {
          if (typeof showToast === 'function') showToast('Brocas só podem ser adicionadas no cabeçote de furação (T21 a T30).', 'error');
          return;
        }
        if (tool.type !== 'broca' && this.selectedSlot >= 21) {
          if (typeof showToast === 'function') showToast('Apenas brocas podem ser adicionadas no cabeçote de furação (T21 a T30).', 'error');
          return;
        }
      }
      Storage.setMagazineSlot(this.selectedSlot, this.modalSelectedToolId);
    }
    this.closeModal();
    this.renderMagazine();
    this.renderTable();
    App.refreshToolSelects();
  },

  clearSlot() {
    Storage.clearMagazineSlot(this.selectedSlot);
    this.closeModal();
    this.renderMagazine();
    this.renderTable();
    App.refreshToolSelects();
  },

  closeModal() {
    document.getElementById('magazine-modal').classList.remove('open');
    this.selectedSlot = null;
    this.modalSelectedToolId = null;
  },

  // ── Tools Table ─────────────────────────────────────────────

  renderTable() {
    const tableConfigs = [
      { tbodyId: 'tools-table-body', emptyId: 'tools-empty', filter: t => t.type !== 'broca' },
      { tbodyId: 'drill-tools-table-body', emptyId: 'drill-tools-empty', filter: t => t.type === 'broca' }
    ];
    const allTools = Storage.getTools();
    
    tableConfigs.forEach(config => {
      const tbody = document.getElementById(config.tbodyId);
      const emptyMsg = document.getElementById(config.emptyId);
      if (!tbody) return;

      const tools = allTools.filter(config.filter);

      if (tools.length === 0) {
        tbody.innerHTML = '';
        if (emptyMsg) emptyMsg.classList.remove('hidden');
        return;
      }

      if (emptyMsg) emptyMsg.classList.add('hidden');
      let html = '';

      for (const tool of tools) {
        const pos = Storage.getToolPosition(tool.id);
        html += `
          <tr>
            <td class="tool-name-cell">${tool.name}</td>
            <td><span class="tool-type-badge ${tool.type}">${this.TOOL_LABELS[tool.type] || tool.type}</span></td>
            <td>${tool.totalLength || 75} mm</td>
            <td>${tool.cutHeight || 22} mm</td>
            <td>${tool.diameter || 6} mm</td>
            <td>${tool.shankDiameter || 6} mm</td>
            <td>${tool.passDepth} mm</td>
            <td>${tool.rpm} RPM</td>
            <td>${tool.feedRate} m/min</td>
            <td>${pos ? 'T' + pos : '—'}</td>
            <td>
              <button class="btn btn-sm btn-secondary" onclick="ToolsManager.editTool('${tool.id}')" title="Editar">✏️</button>
              <button class="btn btn-sm btn-danger" onclick="ToolsManager.deleteTool('${tool.id}')" title="Excluir">✕</button>
            </td>
          </tr>`;
      }

      tbody.innerHTML = html;
    });
  }
};

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}
