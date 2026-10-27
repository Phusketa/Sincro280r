// ╔═══════════════════════════════════════════════════════════════╗
// ║  Storage — Persistência local para ferramentas e magazine   ║
// ╚═══════════════════════════════════════════════════════════════╝

var Storage = {
  KEYS: {
    TOOLS: 'sincro280r_tools',
    MAGAZINE: 'sincro280r_magazine',
    CONFIG: 'sincro280r_config',
    VARIABLES: 'sincro280r_custom_variables',
    LIBRARY: 'sincro280r_ops_library',
    PROJECTS: 'sincro280r_project_folders'
  },

  // ── Project & Pieces Storage by Folders ──────────────────────

  getProjects() {
    try {
      const data = JSON.parse(localStorage.getItem(this.KEYS.PROJECTS));
      if (data && Array.isArray(data.folders)) return data;
    } catch {}
    return { folders: [] };
  },

  saveProjects(data) {
    localStorage.setItem(this.KEYS.PROJECTS, JSON.stringify(data || { folders: [] }));
  },

  saveProjectPiece(folderName, pieceName, pieceData) {
    const cleanFolder = (folderName || 'Geral').trim();
    const cleanPieceName = (pieceName || 'Peça').trim();
    const projects = this.getProjects();

    let folder = projects.folders.find(f => f.name.toLowerCase() === cleanFolder.toLowerCase());
    if (!folder) {
      folder = { name: cleanFolder, pieces: [] };
      projects.folders.push(folder);
    }

    const newPiece = {
      id: 'pc_' + this.generateId(),
      name: cleanPieceName,
      width: pieceData.width || 800,
      height: pieceData.height || 500,
      depth: pieceData.depth || 15,
      qty: Math.max(1, parseInt(pieceData.qty) || 1),
      hasGrain: !!pieceData.hasGrain,
      isOrganic: !!pieceData.isOrganic,
      organicContour: pieceData.organicContour ? JSON.parse(JSON.stringify(pieceData.organicContour)) : null,
      operations: JSON.parse(JSON.stringify(pieceData.operations || [])),
      customVariables: JSON.parse(JSON.stringify(pieceData.customVariables || {})),
      savedAt: new Date().toISOString()
    };

    folder.pieces.push(newPiece);
    this.saveProjects(projects);
    return newPiece;
  },

  updateProjectPieceQty(folderName, pieceId, qty) {
    const projects = this.getProjects();
    const folder = projects.folders.find(f => f.name.toLowerCase() === folderName.toLowerCase());
    if (folder) {
      const piece = folder.pieces.find(p => p.id === pieceId);
      if (piece) {
        piece.qty = Math.max(1, parseInt(qty) || 1);
        this.saveProjects(projects);
      }
    }
  },

  deleteProjectPiece(folderName, pieceId) {
    const projects = this.getProjects();
    const folder = projects.folders.find(f => f.name.toLowerCase() === folderName.toLowerCase());
    if (folder) {
      folder.pieces = folder.pieces.filter(p => p.id !== pieceId);
      this.saveProjects(projects);
    }
  },

  deleteProjectFolder(folderName) {
    const projects = this.getProjects();
    projects.folders = projects.folders.filter(f => f.name.toLowerCase() !== folderName.toLowerCase());
    this.saveProjects(projects);
  },

  // ── Custom Variables Persistence ────────────────────────────

  getCustomVariables() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.VARIABLES)) || { C: '50' };
    } catch { return { C: '50' }; }
  },

  saveCustomVariables(vars) {
    localStorage.setItem(this.KEYS.VARIABLES, JSON.stringify(vars || {}));
  },

  // ── Operations Library Persistence with Folders ────────────

  getLibrary() {
    try {
      const data = JSON.parse(localStorage.getItem(this.KEYS.LIBRARY));
      if (data && Array.isArray(data.folders) && Array.isArray(data.savedOps)) {
        return data;
      }
    } catch {}
    return {
      folders: [
        { id: 'f_default', name: 'Geral / Padrões' }
      ],
      savedOps: []
    };
  },

  saveLibrary(libData) {
    localStorage.setItem(this.KEYS.LIBRARY, JSON.stringify(libData));
  },

  createLibraryFolder(name) {
    const lib = this.getLibrary();
    const newFolder = {
      id: 'f_' + this.generateId(),
      name: name || 'Nova Pasta'
    };
    lib.folders.push(newFolder);
    this.saveLibrary(lib);
    return lib;
  },

  deleteLibraryFolder(folderId) {
    const lib = this.getLibrary();
    lib.folders = lib.folders.filter(f => f.id !== folderId);
    lib.savedOps = lib.savedOps.filter(o => o.folderId !== folderId);
    this.saveLibrary(lib);
    return lib;
  },

  saveOpToLibrary(folderId, name, opData) {
    const lib = this.getLibrary();
    const savedItem = {
      id: 'lib_' + this.generateId(),
      folderId: folderId || (lib.folders[0] ? lib.folders[0].id : 'f_default'),
      name: name || 'Operação Salva',
      opData: JSON.parse(JSON.stringify(opData))
    };
    lib.savedOps.push(savedItem);
    this.saveLibrary(lib);
    return lib;
  },

  deleteOpFromLibrary(opId) {
    const lib = this.getLibrary();
    lib.savedOps = lib.savedOps.filter(o => o.id !== opId);
    this.saveLibrary(lib);
    return lib;
  },

  // ── Tools CRUD ──────────────────────────────────────────────

  getDefaultTools() {
    return [
      {
        id: 't1_reta_6',
        name: 'Fresa Reta 6mm',
        type: 'reta',
        diameter: 6,
        shankDiameter: 6,
        neckDiameter: 6,
        shankLength: 45,
        cutHeight: 22,
        totalLength: 70,
        cavaAngle: 0,
        cavaHeight: 0,
        topOffset: 0,
        passDepth: 3,
        stepOver: 3,
        rpm: 18000,
        feedRate: 4,
        plungeRate: 1.5
      }
    ];
  },

  getTools() {
    try {
      const raw = localStorage.getItem(this.KEYS.TOOLS);
      let list = raw ? JSON.parse(raw) : null;
      if (!list || !Array.isArray(list) || list.length === 0) {
        list = this.getDefaultTools();
        localStorage.setItem(this.KEYS.TOOLS, JSON.stringify(list));
        const mag = this.getMagazine();
        if (Object.keys(mag).length === 0) {
          list.forEach((t, i) => {
            mag[i + 1] = t.id;
          });
          localStorage.setItem(this.KEYS.MAGAZINE, JSON.stringify(mag));
        }
      }
      return list.map(t => ({
        id: t.id,
        name: t.name || 'Fresa Reta 6mm',
        type: t.type || 'reta',
        diameter: t.diameter !== undefined ? t.diameter : 6,
        shankDiameter: t.shankDiameter !== undefined ? t.shankDiameter : 6,
        neckDiameter: t.neckDiameter !== undefined ? t.neckDiameter : 6,
        shankLength: t.shankLength !== undefined ? t.shankLength : 45,
        cutHeight: t.cutHeight !== undefined ? t.cutHeight : 22,
        totalLength: t.totalLength !== undefined ? t.totalLength : 70,
        cavaAngle: t.cavaAngle !== undefined ? t.cavaAngle : 0,
        cavaHeight: t.cavaHeight !== undefined ? t.cavaHeight : 0,
        topOffset: t.topOffset !== undefined ? t.topOffset : 0,
        passDepth: t.passDepth !== undefined ? t.passDepth : 3,
        stepOver: t.stepOver !== undefined ? t.stepOver : 3,
        rpm: t.rpm || 18000,
        feedRate: t.feedRate || 4,
        plungeRate: t.plungeRate || 1.5
      }));
    } catch { return this.getDefaultTools(); }
  },

  saveTool(tool) {
    const tools = this.getTools();
    const idx = tools.findIndex(t => t.id === tool.id);
    if (idx >= 0) {
      tools[idx] = tool;
    } else {
      tools.push(tool);
    }
    localStorage.setItem(this.KEYS.TOOLS, JSON.stringify(tools));
    return tools;
  },

  deleteTool(id) {
    let tools = this.getTools();
    tools = tools.filter(t => t.id !== id);
    localStorage.setItem(this.KEYS.TOOLS, JSON.stringify(tools));
    // Also remove from magazine
    const mag = this.getMagazine();
    for (const pos in mag) {
      if (mag[pos] === id) delete mag[pos];
    }
    localStorage.setItem(this.KEYS.MAGAZINE, JSON.stringify(mag));
    return tools;
  },

  getToolById(id) {
    return this.getTools().find(t => t.id === id) || null;
  },

  // ── Magazine (14 positions) ─────────────────────────────────

  getMagazine() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.MAGAZINE)) || {};
    } catch { return {}; }
  },

  setMagazineSlot(position, toolId) {
    const mag = this.getMagazine();
    // Remove tool from any other position
    for (const pos in mag) {
      if (mag[pos] === toolId) delete mag[pos];
    }
    if (toolId) {
      mag[position] = toolId;
    } else {
      delete mag[position];
    }
    localStorage.setItem(this.KEYS.MAGAZINE, JSON.stringify(mag));
    return mag;
  },

  clearMagazineSlot(position) {
    const mag = this.getMagazine();
    delete mag[position];
    localStorage.setItem(this.KEYS.MAGAZINE, JSON.stringify(mag));
    return mag;
  },

  getToolPosition(toolId) {
    const mag = this.getMagazine();
    for (const pos in mag) {
      if (mag[pos] === toolId) return parseInt(pos);
    }
    return null;
  },

  autoAssignToolToMagazine(toolId) {
    if (this.getToolPosition(toolId)) return; // Already assigned
    const mag = this.getMagazine();
    const tool = this.getToolById(toolId);
    if (!tool) return;

    if (tool.type === 'broca') {
      for (let i = 21; i <= 30; i++) {
        if (!mag[i]) {
          mag[i] = toolId;
          localStorage.setItem(this.KEYS.MAGAZINE, JSON.stringify(mag));
          break;
        }
      }
    } else {
      for (let i = 1; i <= 14; i++) {
        if (!mag[i]) {
          mag[i] = toolId;
          localStorage.setItem(this.KEYS.MAGAZINE, JSON.stringify(mag));
          break;
        }
      }
    }
  },

  getToolAtPosition(position) {
    const mag = this.getMagazine();
    const toolId = mag[position];
    return toolId ? this.getToolById(toolId) : null;
  },

  // ── Config ──────────────────────────────────────────────────

  getConfig() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.CONFIG)) || {
        safeZ: 10,
        approachZ: 2,
        homeX: 0,
        homeY: 0,
        homeZ: 0
      };
    } catch {
      return { safeZ: 10, approachZ: 2, homeX: 0, homeY: 0, homeZ: 0 };
    }
  },

  saveConfig(config) {
    localStorage.setItem(this.KEYS.CONFIG, JSON.stringify(config));
  },

  // ── Theme Persistence ───────────────────────────────────────

  getTheme() {
    try {
      return localStorage.getItem('sincro280r_theme') || 'dark';
    } catch { return 'dark'; }
  },

  saveTheme(theme) {
    try {
      localStorage.setItem('sincro280r_theme', theme);
    } catch {}
  },

  // ── Automatic Export Path Persistence ───────────────────────

  getExportPath() {
    try {
      return localStorage.getItem('sincro280r_export_path') || '';
    } catch { return ''; }
  },

  saveExportPath(path) {
    try {
      localStorage.setItem('sincro280r_export_path', path || '');
    } catch {}
  },

  getAutoSaveDirect() {
    try {
      return localStorage.getItem('sincro280r_auto_save_direct') === 'true';
    } catch { return false; }
  },

  saveAutoSaveDirect(enabled) {
    try {
      localStorage.setItem('sincro280r_auto_save_direct', enabled ? 'true' : 'false');
    } catch {}
  },

  // ── Utility ─────────────────────────────────────────────────

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }
};
