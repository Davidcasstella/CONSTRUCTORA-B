/**
 * ===========================================
 * SERVICIO DE CONFIGURACIÓN
 * ===========================================
 *
 * Maneja la configuración dinámica de API keys
 * y proveedores de IA.
 *
 * ✅ ACTUALIZADO: Sincronización completa con .env
 * - saveSettings() ahora escribe en .env además de settings.json
 * - deleteApiKey() elimina de .env, settings.json y process.env
 * - maskApiKey() mejorado: solo muestra ●●●●●●●● (sin revelar caracteres reales)
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Archivos de configuración
const SETTINGS_FILE = path.join(process.cwd(), 'settings.json');
const ENV_FILE = path.join(process.cwd(), '.env');

// Configuración en memoria
let settings = {
  provider: 'groq',
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    enabled: true  // Habilitado por defecto
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    enabled: true  // Habilitado por defecto
  }
};

// ===========================================
// FUNCIONES DE LECTURA/ESCRITURA DE .env
// ===========================================

/**
 * ✅ NUEVO: Lee el contenido del archivo .env y lo devuelve como string
 */
const readEnvFile = () => {
  try {
    if (fs.existsSync(ENV_FILE)) {
      return fs.readFileSync(ENV_FILE, 'utf8');
    }
    return '';
  } catch (error) {
    logger.warn('Error leyendo .env:', error.message);
    return '';
  }
};

/**
 * ✅ NUEVO: Escribe o actualiza una variable en el archivo .env
 * Si la variable ya existe, actualiza su valor.
 * Si no existe, la agrega al final del archivo.
 *
 * @param {string} key - Nombre de la variable (ej: 'GROQ_API_KEY')
 * @param {string} value - Valor de la variable
 */
const writeEnvVariable = (key, value) => {
  try {
    let envContent = readEnvFile();
    // ✅ FIX: Handle both \n and \r\n line endings
    const regex = new RegExp(`^${key}=.*\\r?$`, 'm');

    if (regex.test(envContent)) {
      // Variable existe → actualizar su valor
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      // Variable no existe → agregar al final
      envContent = envContent.trimEnd() + `\n${key}=${value}\n`;
    }

    fs.writeFileSync(ENV_FILE, envContent);
    logger.info(`✅ .env actualizado: ${key}=${value ? '[CONFIGURADA]' : '[ELIMINADA]'}`);
    return true;
  } catch (error) {
    logger.error(`❌ Error escribiendo ${key} en .env:`, error.message);
    return false;
  }
};

/**
 * ✅ NUEVO: Elimina el valor de una variable en .env (deja la key con valor vacío)
 *
 * @param {string} key - Nombre de la variable a limpiar (ej: 'GROQ_API_KEY')
 */
const clearEnvVariable = (key) => {
  return writeEnvVariable(key, '');
};

// ===========================================
// FUNCIONES EXISTENTES (MEJORADAS)
// ===========================================

/**
 * Carga configuración desde archivo
 */
const loadSettings = () => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const saved = JSON.parse(data);

      // Merge con valores de .env como fallback
      settings = {
        provider: saved.provider || settings.provider,
        groq: {
          apiKey: saved.groq?.apiKey || process.env.GROQ_API_KEY || '',
          model: saved.groq?.model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          enabled: saved.groq?.enabled !== undefined ? saved.groq.enabled : true
        },
        openai: {
          apiKey: saved.openai?.apiKey || process.env.OPENAI_API_KEY || '',
          model: saved.openai?.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
          enabled: saved.openai?.enabled !== undefined ? saved.openai.enabled : true
        }
      };

      logger.info('Configuración cargada desde settings.json');
    } else {
      logger.info('Usando configuración de variables de entorno');
    }
  } catch (error) {
    logger.warn('Error cargando settings.json:', error.message);
  }

  return settings;
};

/**
 * Guarda configuración en archivo
 * ✅ MEJORADO: Ahora también sincroniza con .env
 */
const saveSettings = (newSettings) => {
  try {
    // Actualizar configuración en memoria
    if (newSettings.provider) {
      settings.provider = newSettings.provider;
    }

    if (newSettings.groq) {
      if (newSettings.groq.apiKey !== undefined) settings.groq.apiKey = newSettings.groq.apiKey;
      if (newSettings.groq.model !== undefined) settings.groq.model = newSettings.groq.model;
      if (newSettings.groq.enabled !== undefined) settings.groq.enabled = newSettings.groq.enabled;
    }

    if (newSettings.openai) {
      if (newSettings.openai.apiKey !== undefined) settings.openai.apiKey = newSettings.openai.apiKey;
      if (newSettings.openai.model !== undefined) settings.openai.model = newSettings.openai.model;
      if (newSettings.openai.enabled !== undefined) settings.openai.enabled = newSettings.openai.enabled;
    }

    // 1. Guardar en settings.json
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

    // 2. ✅ NUEVO: Sincronizar con .env
    // Solo escribir en .env si se proporcionó una apiKey (no sobreescribir con valores vacíos accidentalmente)
    if (newSettings.groq?.apiKey !== undefined) {
      writeEnvVariable('GROQ_API_KEY', settings.groq.apiKey);
      if (settings.groq.model) {
        writeEnvVariable('GROQ_MODEL', settings.groq.model);
      }
    }
    if (newSettings.openai?.apiKey !== undefined) {
      writeEnvVariable('OPENAI_API_KEY', settings.openai.apiKey);
    }

    // ✅ NUEVO: Guardar AWS keys en .env
    if (newSettings.aws) {
      if (newSettings.aws.accessKeyId !== undefined) {
        writeEnvVariable('AWS_ACCESS_KEY_ID', newSettings.aws.accessKeyId);
        process.env.AWS_ACCESS_KEY_ID = newSettings.aws.accessKeyId;
      }
      if (newSettings.aws.secretAccessKey !== undefined) {
        writeEnvVariable('AWS_SECRET_ACCESS_KEY', newSettings.aws.secretAccessKey);
        process.env.AWS_SECRET_ACCESS_KEY = newSettings.aws.secretAccessKey;
      }
      if (newSettings.aws.region !== undefined) {
        writeEnvVariable('AWS_REGION', newSettings.aws.region);
        process.env.AWS_REGION = newSettings.aws.region;
      }
      logger.info('✅ AWS keys guardadas en .env y process.env');
    }

    // 3. Actualizar variables de entorno en memoria (para que los providers las lean)
    if (settings.groq.apiKey) {
      process.env.GROQ_API_KEY = settings.groq.apiKey;
      process.env.GROQ_MODEL = settings.groq.model;
    }
    if (settings.openai.apiKey) {
      process.env.OPENAI_API_KEY = settings.openai.apiKey;
      process.env.OPENAI_MODEL = settings.openai.model;
    }

    logger.info('✅ Configuración guardada en settings.json y .env');
    return true;
  } catch (error) {
    logger.error('Error guardando configuración:', error);
    return false;
  }
};

/**
 * Obtiene la configuración actual (oculta las API keys completamente)
 * ✅ MEJORADO: Ahora devuelve ●●●●●●●● en vez de caracteres parciales
 */
const getSettings = () => {
  return {
    provider: settings.provider,
    groq: {
      apiKey: maskApiKey(settings.groq.apiKey),
      model: settings.groq.model,
      enabled: settings.groq.enabled
    },
    openai: {
      apiKey: maskApiKey(settings.openai.apiKey),
      model: settings.openai.model,
      enabled: settings.openai.enabled
    },
    aws: {
      accessKeyId: maskApiKey(process.env.AWS_ACCESS_KEY_ID || ''),
      secretAccessKey: maskApiKey(process.env.AWS_SECRET_ACCESS_KEY || ''),
      region: process.env.AWS_REGION || 'us-east-1'
    },
    groqAvailable: !!settings.groq.apiKey && settings.groq.enabled,
    openaiAvailable: !!settings.openai.apiKey && settings.openai.enabled
  };
};

/**
 * Obtiene las API keys reales (para uso interno)
 */
const getApiKeys = () => {
  return {
    provider: settings.provider,
    groq: settings.groq,
    openai: settings.openai
  };
};

/**
 * Oculta la API key completamente para el frontend
 * ✅ MEJORADO: Ya NO revela ningún carácter real de la key
 */
const maskApiKey = (key) => {
  if (!key || key.length < 5) return '';
  return '●●●●●●●●';
};

/**
 * Obtiene el proveedor actual
 */
const getCurrentProvider = () => {
  return settings.provider;
};

/**
 * Cambia el proveedor activo
 */
const setProvider = (provider) => {
  if (provider === 'groq' || provider === 'openai') {
    settings.provider = provider;
    saveSettings(settings);
    return true;
  }
  return false;
};

/**
 * ✅ NUEVO: Elimina una API key de todos los archivos
 * Limpia: settings.json, .env y process.env (memoria)
 *
 * @param {string} provider - 'groq' o 'openai'
 * @returns {boolean} true si se eliminó correctamente
 */
const deleteApiKey = (provider) => {
  try {
    if (provider === 'groq') {
      // 1. Limpiar en memoria
      settings.groq.apiKey = '';
      // 2. Limpiar en process.env
      delete process.env.GROQ_API_KEY;
      // 3. Limpiar en .env (dejar variable con valor vacío)
      clearEnvVariable('GROQ_API_KEY');
    } else if (provider === 'openai') {
      // 1. Limpiar en memoria
      settings.openai.apiKey = '';
      // 2. Limpiar en process.env
      delete process.env.OPENAI_API_KEY;
      // 3. Limpiar en .env (dejar variable con valor vacío)
      clearEnvVariable('OPENAI_API_KEY');
    } else if (provider === 'aws') {
      // 1. Limpiar en process.env
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      // 2. Limpiar en .env
      clearEnvVariable('AWS_ACCESS_KEY_ID');
      clearEnvVariable('AWS_SECRET_ACCESS_KEY');
      logger.info('🗑️ AWS keys eliminadas de .env y process.env');
      return true;
    } else {
      logger.warn(`⚠️ Proveedor no válido para eliminar key: ${provider}`);
      return false;
    }

    // 4. Guardar settings.json actualizado (sin la key)
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

    logger.info(`🗑️ API key de ${provider} eliminada de settings.json, .env y process.env`);
    return true;
  } catch (error) {
    logger.error(`❌ Error eliminando API key de ${provider}:`, error);
    return false;
  }
};

/**
 * ✅ NUEVO: Obtiene el estado de las API keys (para endpoint /api/keys/status)
 * Devuelve solo si están configuradas y la máscara segura
 */
const getKeysStatus = () => {
  return {
    groq: {
      configured: !!settings.groq.apiKey && settings.groq.apiKey.length > 5,
      masked: maskApiKey(settings.groq.apiKey),
      enabled: settings.groq.enabled,
      model: settings.groq.model
    },
    openai: {
      configured: !!settings.openai.apiKey && settings.openai.apiKey.length > 5,
      masked: maskApiKey(settings.openai.apiKey),
      enabled: settings.openai.enabled,
      model: settings.openai.model
    },
    aws: {
      configured: !!process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID.length > 5,
      masked: maskApiKey(process.env.AWS_ACCESS_KEY_ID || ''),
      region: process.env.AWS_REGION || 'us-east-1'
    }
  };
};

// Cargar configuración al iniciar
loadSettings();

module.exports = {
  loadSettings,
  saveSettings,
  getSettings,
  getApiKeys,
  getCurrentProvider,
  setProvider,
  deleteApiKey,     // ✅ NUEVO
  getKeysStatus     // ✅ NUEVO
};
