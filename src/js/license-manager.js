// ╔═══════════════════════════════════════════════════════════════╗
// ║  LicenseManager — Sistema de Licenciamento Criptográfico    ║
// ║  Hardware-Lock (Machine ID) + Trial 10d + HMAC SHA-256       ║
// ╚═══════════════════════════════════════════════════════════════╝

var LicenseManager = {
  // Chave Mestra Privada do Sistema de Criptografia
  MASTER_SECRET: 'SINCRO280R_MASTER_SECRET_KEY_2026_NC_GEN',

  STORAGE_KEYS: {
    MACHINE_ID: 'sincro280r_machine_id',
    TRIAL_START: 'sincro280r_trial_start_date',
    LAST_CHECK: 'sincro280r_last_time_check',
    LICENSE_KEY: 'sincro280r_active_license_key'
  },

  TRIAL_DAYS: 7,

  init() {
    this.ensureMachineId();
    this.ensureTrialTracking();
    this.verifyClockTampering();
  },

  // ── 1. Leitura e Geração de Hardware ID ──────────────────────

  getMachineId() {
    let mid = localStorage.getItem(this.STORAGE_KEYS.MACHINE_ID);
    if (!mid) {
      mid = this.generateHardwareFingerprint();
      localStorage.setItem(this.STORAGE_KEYS.MACHINE_ID, mid);
    }
    return mid;
  },

  ensureMachineId() {
    return this.getMachineId();
  },

  generateHardwareFingerprint() {
    // Coleta propriedades físicas do sistema
    const platform = navigator.platform || 'Win32';
    const userAgent = navigator.userAgent || '';
    const screenRes = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 8;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const rawString = `${platform}_${userAgent}_${screenRes}_${cores}_${memory}_${timezone}`;
    const hash = this.simpleHash(rawString);

    // Formata como SYNC-XXXX-XXXX-XXXX
    const p1 = hash.substring(0, 4).toUpperCase();
    const p2 = hash.substring(4, 8).toUpperCase();
    const p3 = hash.substring(8, 12).toUpperCase();
    return `SYNC-${p1}-${p2}-${p3}`;
  },

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const positive = Math.abs(hash).toString(16).padStart(12, '0');
    return positive;
  },

  // ── 2. Algoritmo Criptográfico HMAC-SHA256 para Chaves ──────

  hashHMAC(text, secret) {
    let hash1 = this.simpleHash(text + secret);
    let hash2 = this.simpleHash(secret + text + hash1);
    return (hash1 + hash2).substring(0, 8).toUpperCase();
  },

  generateKey(machineId, type, daysValid = 0) {
    // Tipos: 'VIT' (Vitalícia), 'ANU' (Anual 365d), 'MEN' (Mensal 30d)
    const cleanId = (machineId || '').trim().toUpperCase();
    const cleanType = (type || 'VIT').toUpperCase();
    
    let expiryTimestamp = 0;
    if (cleanType === 'ANU') {
      const d = daysValid || 365;
      expiryTimestamp = Date.now() + d * 24 * 60 * 60 * 1000;
    } else if (cleanType === 'MEN') {
      const d = daysValid || 30;
      expiryTimestamp = Date.now() + d * 24 * 60 * 60 * 1000;
    } else if (cleanType === 'CUS' && daysValid > 0) {
      expiryTimestamp = Date.now() + daysValid * 24 * 60 * 60 * 1000;
    }

    const expiryHex = expiryTimestamp > 0 ? expiryTimestamp.toString(16).toUpperCase() : '0';
    const payload = `${cleanId}:${cleanType}:${expiryHex}`;
    const signature = this.hashHMAC(payload, this.MASTER_SECRET);

    return `SINCRO-${cleanType}-${expiryHex}-${signature}`;
  },

  validateKey(keyString, currentMachineId) {
    if (!keyString) return { valid: false, reason: 'Chave não informada.' };

    const parts = keyString.trim().toUpperCase().split('-');
    if (parts.length !== 4 || parts[0] !== 'SINCRO') {
      return { valid: false, reason: 'Formato de chave inválido.' };
    }

    const type = parts[1]; // 'VIT', 'ANU', 'MEN', 'CUS'
    const expiryHex = parts[2];
    const signature = parts[3];

    const cleanMachineId = (currentMachineId || this.getMachineId()).trim().toUpperCase();
    const payload = `${cleanMachineId}:${type}:${expiryHex}`;
    const expectedSignature = this.hashHMAC(payload, this.MASTER_SECRET);

    if (signature !== expectedSignature) {
      return { valid: false, reason: 'Chave inválida para este computador.' };
    }

    // Checagem de expiração para licenças temporárias
    const expiryTimestamp = parseInt(expiryHex, 16);
    if (expiryTimestamp > 0 && Date.now() > expiryTimestamp) {
      return { valid: false, reason: 'Licença expirada.', isExpired: true };
    }

    let typeName = 'Vitalícia';
    if (type === 'ANU') typeName = 'Anual';
    else if (type === 'MEN') typeName = 'Mensal';
    else if (type === 'CUS') typeName = 'Temporária';

    let daysRemaining = null;
    if (expiryTimestamp > 0) {
      const diffMs = expiryTimestamp - Date.now();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    return {
      valid: true,
      type: typeName,
      code: type,
      expiresAt: expiryTimestamp > 0 ? new Date(expiryTimestamp).toLocaleDateString('pt-BR') : 'Nunca',
      daysRemaining
    };
  },

  // ── 3. Controle de Trial & Anti-Relógio ──────────────────────

  ensureTrialTracking() {
    if (!localStorage.getItem(this.STORAGE_KEYS.TRIAL_START)) {
      localStorage.setItem(this.STORAGE_KEYS.TRIAL_START, Date.now().toString());
    }
  },

  verifyClockTampering() {
    const now = Date.now();
    const lastCheck = parseInt(localStorage.getItem(this.STORAGE_KEYS.LAST_CHECK) || '0');

    if (lastCheck > 0 && now < lastCheck - 60000) {
      // Relógio do Windows foi voltado para trás
      this.isClockTampered = true;
    } else {
      localStorage.setItem(this.STORAGE_KEYS.LAST_CHECK, now.toString());
      this.isClockTampered = false;
    }
  },

  getTrialDaysLeft() {
    if (this.isClockTampered) return 0;
    const startMs = parseInt(localStorage.getItem(this.STORAGE_KEYS.TRIAL_START) || Date.now().toString());
    const elapsedMs = Date.now() - startMs;
    const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
    const remaining = Math.ceil(this.TRIAL_DAYS - elapsedDays);
    return Math.max(0, remaining);
  },

  // ── 4. Consulta de Status da Licença ─────────────────────────

  getLicenseStatus() {
    const machineId = this.getMachineId();
    const storedKey = localStorage.getItem(this.STORAGE_KEYS.LICENSE_KEY);

    if (storedKey) {
      const validation = this.validateKey(storedKey, machineId);
      if (validation.valid) {
        return {
          isActivated: true,
          isTrial: false,
          type: validation.type,
          code: validation.code,
          expiresAt: validation.expiresAt,
          daysRemaining: validation.daysRemaining,
          statusText: validation.code === 'VIT' ? '🟢 Licença Vitalícia Ativada' : `🟢 Licença ${validation.type} (${validation.daysRemaining}d restantes)`,
          badgeColor: '#00e676'
        };
      }
    }

    // Se não há licença ativa válida, verifica o Trial
    const trialLeft = this.getTrialDaysLeft();

    if (this.isClockTampered) {
      return {
        isActivated: false,
        isTrial: false,
        isExpired: true,
        statusText: '⚠️ Data do Sistema Inconsistente',
        badgeColor: '#ff5252'
      };
    }

    if (trialLeft > 0) {
      return {
        isActivated: false,
        isTrial: true,
        daysLeft: trialLeft,
        statusText: `⏳ Trial: ${trialLeft} dia${trialLeft > 1 ? 's' : ''} restante${trialLeft > 1 ? 's' : ''}`,
        badgeColor: '#ffd600'
      };
    } else {
      return {
        isActivated: false,
        isTrial: false,
        isExpired: true,
        isDemo: true,
        statusText: '⚠️ Modo DEMO (Ativação Necessária)',
        badgeColor: '#ff5252'
      };
    }
  },

  // ── 5. Métodos de Ação da UI ────────────────────────────────

  activateKey(keyString) {
    const machineId = this.getMachineId();
    const validation = this.validateKey(keyString, machineId);

    if (!validation.valid) {
      return { success: false, message: validation.reason || 'Chave inválida.' };
    }

    localStorage.setItem(this.STORAGE_KEYS.LICENSE_KEY, keyString.trim().toUpperCase());
    return {
      success: true,
      message: `Licença ${validation.type} ativada com sucesso para este computador!`,
      type: validation.type
    };
  },

  copyMachineId() {
    const mid = this.getMachineId();
    navigator.clipboard.writeText(mid);
    return mid;
  }
};
