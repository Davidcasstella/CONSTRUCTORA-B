/**
 * ===========================================
 * DARK MODE TOGGLE - JAVASCRIPT
 * ===========================================
 *
 * Controla el cambio entre modo claro y oscuro
 * Guarda la preferencia en localStorage
 */

(function () {
  'use strict';

  // Nombre de la clave en localStorage
  const STORAGE_KEY = 'norboy-theme-preference';

  // Clase del tema
  const THEME_DARK = 'dark';
  const THEME_LIGHT = 'light';

  /**
   * Obtiene el tema actual guardado
   * @returns {string} 'dark' o 'light'
   */
  function getSavedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) || THEME_LIGHT;
    } catch (e) {
      console.warn('No se pudo acceder a localStorage:', e);
      return THEME_LIGHT;
    }
  }

  /**
   * Guarda la preferencia de tema
   * @param {string} theme - 'dark' o 'light'
   */
  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      console.warn('No se pudo guardar en localStorage:', e);
    }
  }

  /**
   * Aplica el tema especificado
   * @param {string} theme - 'dark' o 'light'
   */
  function applyTheme(theme) {
    const html = document.documentElement;

    if (theme === THEME_DARK) {
      html.setAttribute('data-theme', THEME_DARK);
    } else {
      html.removeAttribute('data-theme');
    }

    // Actualizar el ícono del botón si existe
    updateToggleButton(theme);
  }

  /**
   * Actualiza el ícono del botón de toggle
   * @param {string} currentTheme - 'dark' o 'light'
   */
  function updateToggleButton(currentTheme) {
    const toggleBtn = document.querySelector('.dark-mode-toggle');
    if (!toggleBtn) return;

    const iconContainer = toggleBtn.querySelector('.toggle-icon');
    if (!iconContainer) return;

    // SVG del sol (para modo oscuro - muestra opción de cambiar a claro)
    const sunIcon = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    `;

    // SVG de la luna (para modo claro - muestra opción de cambiar a oscuro)
    const moonIcon = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    `;

    // En modo oscuro mostrar sol (para cambiar a claro)
    // En modo claro mostrar luna (para cambiar a oscuro)
    iconContainer.innerHTML = currentTheme === THEME_DARK ? sunIcon : moonIcon;
  }

  /**
   * Cambia al tema opuesto
   */
  function toggleTheme() {
    const currentTheme = getSavedTheme();
    const newTheme = currentTheme === THEME_DARK ? THEME_LIGHT : THEME_DARK;

    applyTheme(newTheme);
    saveTheme(newTheme);

    // Disparar evento personalizado para otros scripts
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: newTheme } }));

    // ✅ Enviar mensaje al iframe de conversaciones si existe
    const iframe = document.getElementById('conversations-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'set-theme', theme: newTheme }, '*');
    }
  }

  /**
   * Inicializa el modo oscuro
   */
  function initDarkMode() {
    // Aplicar tema guardado
    const savedTheme = getSavedTheme();
    applyTheme(savedTheme);

    // Crear botón de toggle
    createToggleButton();

    // Exponer función globalmente
    window.toggleDarkMode = toggleTheme;
    window.getCurrentTheme = function () { return getSavedTheme(); };

    console.log('🌓 Dark mode initialized. Current theme:', savedTheme);
  }

  /**
   * Crea el botón de toggle en el header
   */
  function createToggleButton() {
    // Buscar el header-right para insertar el botón
    const headerRight = document.querySelector('.header-right');
    if (!headerRight) {
      console.warn('No se encontró .header-right para insertar el botón de modo oscuro');
      return;
    }

    // Verificar si ya existe el botón
    if (document.querySelector('.dark-mode-toggle')) {
      return;
    }

    // Crear el botón
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'dark-mode-toggle';
    toggleBtn.setAttribute('aria-label', 'Cambiar tema');
    toggleBtn.setAttribute('title', 'Cambiar entre modo claro y oscuro');
    toggleBtn.onclick = toggleTheme;

    // Crear contenedor del ícono
    const iconContainer = document.createElement('span');
    iconContainer.className = 'toggle-icon';
    toggleBtn.appendChild(iconContainer);

    // Texto del botón
    const textSpan = document.createElement('span');
    textSpan.className = 'toggle-text';
    textSpan.textContent = 'Tema';
    toggleBtn.appendChild(textSpan);

    // Insertar antes de los otros botones
    headerRight.insertBefore(toggleBtn, headerRight.firstChild);

    // Actualizar el ícono inicial
    updateToggleButton(getSavedTheme());
  }

  /**
   * Detecta preferencia del sistema (opcional)
   * @returns {string} 'dark' o 'light'
   */
  function getSystemThemePreference() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return THEME_DARK;
    }
    return THEME_LIGHT;
  }

  // Esperar a que el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDarkMode);
  } else {
    // Si ya está cargado, inicializar ahora
    initDarkMode();
  }

  // Re-inicializar cuando cambie el estado del documento (para SPAs)
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !document.querySelector('.dark-mode-toggle')) {
      createToggleButton();
    }
  });

})();
