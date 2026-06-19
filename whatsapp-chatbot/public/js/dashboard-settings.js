// Dashboard Settings — Configuration, AI providers, session management
// Extracted from dashboard-main.js

    // Tab switching
    function switchTab(tab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      document.querySelector(`.tab:nth-child(${tab === 'whatsapp' ? 1 : 2})`).classList.add('active');
      document.getElementById(`tab-${tab}`).classList.add('active');
    }

    function toggleTab(tab) {
      const currentTab = document.querySelector('.tab-content.active').id.replace('tab-', '');
      switchTab(currentTab === tab ? 'whatsapp' : tab);
    }

    // Provider selection
    function selectProvider(provider) {
      currentProvider = provider;
      document.querySelectorAll('.provider-option').forEach(p => p.classList.remove('active'));
      document.getElementById(`provider-${provider}`).classList.add('active');

      document.getElementById('groq-settings').style.display = provider === 'groq' ? 'block' : 'none';
      document.getElementById('openai-settings').style.display = provider === 'openai' ? 'block' : 'none';
    }

    // ✅ NUEVO: Cargar configuración de proveedores de IA
    async function loadAIProviderSettings() {
      try {
        const response = await authenticatedFetch('/api/ai-settings');
        const data = await response.json();

        if (data.success) {
          // Actualizar toggles
          document.getElementById('ai-chatgpt-toggle').checked = data.settings.chatgpt.enabled;
          document.getElementById('ai-grok-toggle').checked = data.settings.grok.enabled;

          // Actualizar estado visual
          updateAIProviderStatus(data.settings);
        }
      } catch (error) {
        console.error('Error cargando configuración de IA:', error);
      }
    }

    // ✅ NUEVO: Actualizar estado visual de proveedores
    function updateAIProviderStatus(settings) {
      const statusDiv = document.getElementById('ai-provider-status');
      if (!statusDiv) return;

      const chatgptOn = settings.chatgpt.enabled;
      const grokOn = settings.grok.enabled;

      let statusHtml = '';
      let statusColor = '#4caf50';

      if (chatgptOn && grokOn) {
        statusHtml = '✅ <strong>ChatGPT activo</strong> con Grok como respaldo';
        statusColor = '#4caf50';
      } else if (chatgptOn && !grokOn) {
        statusHtml = '✅ <strong>ChatGPT activo</strong> (sin respaldo)';
        statusColor = '#ff9800';
      } else if (!chatgptOn && grokOn) {
        statusHtml = '⚠️ <strong>Grok activo</strong> (ChatGPT desactivado)';
        statusColor = '#ff9800';
      } else {
        statusHtml = '❌ <strong>¡Advertencia!</strong> Ambos proveedores desactivados';
        statusColor = '#f44336';
      }

      statusDiv.innerHTML = statusHtml;
      statusDiv.style.borderLeft = `4px solid ${statusColor}`;
    }

    // ✅ NUEVO: Actualizar configuración de proveedores de IA
    async function updateAIProviderSettings() {
      const chatgptEnabled = document.getElementById('ai-chatgpt-toggle').checked;
      const grokEnabled = document.getElementById('ai-grok-toggle').checked;

      // Validación: no permitir desactivar ambos
      if (!chatgptEnabled && !grokEnabled) {
        showAIAlert('⚠️ Debe mantener al menos un proveedor activo', 'warning');
        // Reactivar el último toggle que se desactivó
        document.getElementById('ai-grok-toggle').checked = true;
        return;
      }

      try {
        const response = await authenticatedFetch('/api/ai-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatgpt: { enabled: chatgptEnabled },
            grok: { enabled: grokEnabled }
          })
        });

        const data = await response.json();

        if (data.success) {
          showAIAlert('✅ Configuración de IA actualizada', 'success');
          updateAIProviderStatus(data.settings);

          // También sincronizar con los checkboxes del panel de API keys
          const openaiCheckbox = document.getElementById('openai-enabled');
          const groqCheckbox = document.getElementById('groq-enabled');
          if (openaiCheckbox) openaiCheckbox.checked = chatgptEnabled;
          if (groqCheckbox) groqCheckbox.checked = grokEnabled;
        } else {
          showAIAlert('❌ Error: ' + data.error, 'error');
          // Revertir cambios
          loadAIProviderSettings();
        }
      } catch (error) {
        showAIAlert('❌ Error de conexión: ' + error.message, 'error');
        // Revertir cambios
        loadAIProviderSettings();
      }
    }

    // ✅ NUEVO: Mostrar alerta en sección de IA
    function showAIAlert(message, type) {
      const alertDiv = document.getElementById('ai-settings-alert');
      if (alertDiv) {
        const bgColor = type === 'success' ? '#e8f5e9' :
          type === 'warning' ? '#fff3e0' : '#ffebee';
        const textColor = type === 'success' ? '#2e7d32' :
          type === 'warning' ? '#e65100' : '#c62828';

        alertDiv.innerHTML = `<div style="padding: 10px; border-radius: 6px; background: ${bgColor}; color: ${textColor}; font-size: 0.9em;">${message}</div>`;
        setTimeout(() => alertDiv.innerHTML = '', 4000);
      }
    }

// Override fetch calls to use authenticatedFetch
// Save Settings
    // Override fetch calls to use authenticatedFetch
    // Save Settings
    async function saveSettings() {
      // ✅ MEJORADO: Solo enviar keys que el usuario realmente escribió (no placeholders)
      const groqKeyInput = document.getElementById('groq-key');
      const openaiKeyInput = document.getElementById('openai-key');
      const awsAccessKeyInput = document.getElementById('aws-access-key');
      const awsSecretKeyInput = document.getElementById('aws-secret-key');
      const awsRegionInput = document.getElementById('aws-region');

      const settings = {
        provider: currentProvider,
        groq: {
          // Solo enviar si el campo tiene un valor real (no ●●●●●●●●)
          apiKey: groqKeyInput.value.includes('●') ? undefined : groqKeyInput.value,
          model: document.getElementById('groq-model').value,
          enabled: document.getElementById('groq-enabled').checked
        },
        openai: {
          apiKey: openaiKeyInput.value.includes('●') ? undefined : openaiKeyInput.value,
          model: document.getElementById('openai-model').value,
          enabled: document.getElementById('openai-enabled').checked
        },
        aws: {
          accessKeyId: awsAccessKeyInput.value.includes('●') ? undefined : awsAccessKeyInput.value,
          secretAccessKey: awsSecretKeyInput.value.includes('●') ? undefined : awsSecretKeyInput.value,
          region: awsRegionInput.value
        }
      };

      // Limpiar undefined para no sobreescribir keys existentes
      if (settings.groq.apiKey === undefined) delete settings.groq.apiKey;
      if (settings.openai.apiKey === undefined) delete settings.openai.apiKey;
      if (settings.aws.accessKeyId === undefined) delete settings.aws.accessKeyId;
      if (settings.aws.secretAccessKey === undefined) delete settings.aws.secretAccessKey;

      try {
        const response = await authenticatedFetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        });

        const data = await response.json();

        if (data.success) {
          showAlert('✅ Configuración guardada en settings.json y .env', 'success');
          loadSettings();
          loadKeysStatus();
        } else {
          showAlert('Error: ' + data.error, 'error');
        }
      } catch (error) {
        showAlert('Error guardando configuración: ' + error.message, 'error');
      }
    }

    // Load Settings
    async function loadSettings() {
      try {
        const response = await authenticatedFetch('/api/settings');
        const data = await response.json();

        if (data.provider) {
          selectProvider(data.provider);
        }

        // ✅ MEJORADO: Mostrar máscara segura en los campos (●●●●●●●●)
        if (data.groq?.apiKey) {
          document.getElementById('groq-key').value = data.groq.apiKey;
          document.getElementById('groq-key').placeholder = 'Key configurada - escribe nueva para cambiar';
        } else {
          document.getElementById('groq-key').value = '';
          document.getElementById('groq-key').placeholder = 'gsk_...';
        }
        if (data.groq?.model) {
          document.getElementById('groq-model').value = data.groq.model;
        }
        if (data.groq?.enabled !== undefined) {
          document.getElementById('groq-enabled').checked = data.groq.enabled;
        }

        if (data.openai?.apiKey) {
          document.getElementById('openai-key').value = data.openai.apiKey;
          document.getElementById('openai-key').placeholder = 'Key configurada - escribe nueva para cambiar';
        } else {
          document.getElementById('openai-key').value = '';
          document.getElementById('openai-key').placeholder = 'sk-...';
        }
        if (data.openai?.model) {
          document.getElementById('openai-model').value = data.openai.model;
        }
        if (data.openai?.enabled !== undefined) {
          document.getElementById('openai-enabled').checked = data.openai.enabled;
        }

        // Update status indicators
        if (data.groqAvailable) {
          document.getElementById('groq-status').innerHTML = '✅ Conectado';
          document.getElementById('groq-status').className = 'provider-status ok';
        } else if (data.groq?.apiKey) {
          document.getElementById('groq-status').innerHTML = '⚠️ Desactivado';
          document.getElementById('groq-status').className = 'provider-status pending';
        } else {
          document.getElementById('groq-status').innerHTML = '⏳ No configurado';
          document.getElementById('groq-status').className = 'provider-status pending';
        }

        if (data.openaiAvailable) {
          document.getElementById('openai-status').innerHTML = '✅ Conectado';
          document.getElementById('openai-status').className = 'provider-status ok';
        } else if (data.openai?.apiKey) {
          document.getElementById('openai-status').innerHTML = '⚠️ Desactivado';
          document.getElementById('openai-status').className = 'provider-status pending';
        } else {
          document.getElementById('openai-status').innerHTML = '⏳ No configurado';
          document.getElementById('openai-status').className = 'provider-status pending';
        }

        // ✅ NUEVO: Mostrar datos de AWS
        if (data.aws?.accessKeyId) {
          document.getElementById('aws-access-key').value = data.aws.accessKeyId;
          document.getElementById('aws-access-key').placeholder = 'Key configurada - escribe nueva para cambiar';
        } else {
          document.getElementById('aws-access-key').value = '';
          document.getElementById('aws-access-key').placeholder = 'AKIA...';
        }
        if (data.aws?.secretAccessKey) {
          document.getElementById('aws-secret-key').value = data.aws.secretAccessKey;
          document.getElementById('aws-secret-key').placeholder = 'Key configurada - escribe nueva para cambiar';
        } else {
          document.getElementById('aws-secret-key').value = '';
          document.getElementById('aws-secret-key').placeholder = 'wJalr...';
        }
        if (data.aws?.region) {
          document.getElementById('aws-region').value = data.aws.region;
        }

        // ✅ NUEVO: Cargar estado detallado de keys
        loadKeysStatus();

      } catch (error) {
        console.error('Error loading settings:', error);
      }
    }

    // ✅ NUEVO: Cargar estado de API keys (muestra indicadores debajo de cada input)
    async function loadKeysStatus() {
      try {
        const response = await authenticatedFetch('/api/keys/status');
        const data = await response.json();

        if (data.success) {
          // Groq key status
          const groqStatusEl = document.getElementById('groq-key-status');
          if (groqStatusEl) {
            if (data.keys.groq.configured) {
              groqStatusEl.innerHTML = '<span style="color: #2e7d32;">✅ Key configurada</span>';
            } else {
              groqStatusEl.innerHTML = '<span style="color: #ef6c00;">⚠️ Sin key configurada</span>';
            }
          }

          // OpenAI key status
          const openaiStatusEl = document.getElementById('openai-key-status');
          if (openaiStatusEl) {
            if (data.keys.openai.configured) {
              openaiStatusEl.innerHTML = '<span style="color: #2e7d32;">✅ Key configurada</span>';
            } else {
              openaiStatusEl.innerHTML = '<span style="color: #ef6c00;">⚠️ Sin key configurada</span>';
            }
          }

          // ✅ NUEVO: AWS key status
          const awsStatusEl = document.getElementById('aws-key-status');
          if (awsStatusEl) {
            if (data.keys.aws.configured) {
              awsStatusEl.innerHTML = '<span style="color: #2e7d32;">✅ Credenciales configuradas · Región: ' + (data.keys.aws.region || 'us-east-1') + '</span>';
            } else {
              awsStatusEl.innerHTML = '<span style="color: #ef6c00;">⚠️ Sin credenciales AWS configuradas</span>';
            }
          }
        }
      } catch (error) {
        console.error('Error cargando estado de keys:', error);
      }
    }

    // ✅ NUEVO: Eliminar API key de un proveedor específico
    async function deleteApiKey(provider) {
      const providerNames = { groq: 'Groq', openai: 'OpenAI', aws: 'AWS/DynamoDB' };
      const providerName = providerNames[provider] || provider;

      if (!confirm(`¿Eliminar la API key de ${providerName}?\n\nSe eliminará de:\n• .env\n• settings.json\n• Memoria del servidor`)) {
        return;
      }

      try {
        const response = await authenticatedFetch(`/api/keys/${provider}`, {
          method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
          showAlert(`🗑️ API key de ${providerName} eliminada correctamente`, 'success');

          // Limpiar el campo del input
          if (provider === 'groq') {
            document.getElementById('groq-key').value = '';
            document.getElementById('groq-key').placeholder = 'gsk_...';
          } else if (provider === 'openai') {
            document.getElementById('openai-key').value = '';
            document.getElementById('openai-key').placeholder = 'sk-...';
          } else if (provider === 'aws') {
            document.getElementById('aws-access-key').value = '';
            document.getElementById('aws-access-key').placeholder = 'AKIA...';
            document.getElementById('aws-secret-key').value = '';
            document.getElementById('aws-secret-key').placeholder = 'wJalr...';
          }

          // Recargar estado
          loadSettings();
        } else {
          showAlert('Error eliminando key: ' + data.error, 'error');
        }
      } catch (error) {
        showAlert('Error eliminando key: ' + error.message, 'error');
      }
    }

    // ✅ NUEVO: Eliminar TODAS las API keys (preparar para GitHub)
    async function deleteAllApiKeys() {
      if (!confirm('⚠️ ¿Eliminar TODAS las API keys?\n\nEsto limpiará:\n• GROQ_API_KEY de .env y settings.json\n• OPENAI_API_KEY de .env y settings.json\n• AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY de .env\n\nPerfecto para hacer git push seguro.')) {
        return;
      }

      try {
        // Eliminar Groq
        await authenticatedFetch('/api/keys/groq', { method: 'DELETE' });
        // Eliminar OpenAI
        await authenticatedFetch('/api/keys/openai', { method: 'DELETE' });
        // ✅ NUEVO: Eliminar AWS
        await authenticatedFetch('/api/keys/aws', { method: 'DELETE' });

        showAlert('🗑️ Todas las API keys eliminadas (Groq, OpenAI, AWS). Listo para git push! 🚀', 'success');

        // Limpiar campos
        document.getElementById('groq-key').value = '';
        document.getElementById('groq-key').placeholder = 'gsk_...';
        document.getElementById('openai-key').value = '';
        document.getElementById('openai-key').placeholder = 'sk-...';
        document.getElementById('aws-access-key').value = '';
        document.getElementById('aws-access-key').placeholder = 'AKIA...';
        document.getElementById('aws-secret-key').value = '';
        document.getElementById('aws-secret-key').placeholder = 'wJalr...';

        // Recargar estado
        loadSettings();
      } catch (error) {
        showAlert('Error eliminando keys: ' + error.message, 'error');
      }
    }

    // Test Connection
    async function testConnection() {
      showAlert('Probando conexión...', 'success');

      try {
        const response = await authenticatedFetch('/api/test-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: currentProvider })
        });

        const data = await response.json();

        if (data.success) {
          showAlert(`Conexión exitosa con ${currentProvider.toUpperCase()}! ✅`, 'success');
        } else {
          showAlert('Error: ' + data.error, 'error');
        }
      } catch (error) {
        showAlert('Error probando conexión: ' + error.message, 'error');
      }
    }

// Cerrar Sesión (WhatsApp)
    // Cerrar Sesión (WhatsApp)
    async function cerrarSesion() {
      if (!confirm('¿Cerrar la sesión actual de WhatsApp?')) return;

      try {
        updateStatus('waiting', 'Cerrando sesión...');
        const response = await authenticatedFetch('/logout', {
          method: 'POST'
        });
        const data = await response.json();

        if (data.success) {
          showAlert('Sesión cerrada. Reconectando...', 'success');
          document.getElementById('session-buttons').style.display = 'none';
          setTimeout(() => socket.emit('get-status'), 3000);
        } else {
          showAlert('Error: ' + data.message, 'error');
        }
      } catch (error) {
        showAlert('Error al cerrar sesión: ' + error.message, 'error');
      }
    }

    // Limpiar Sesión (WhatsApp)
    async function limpiarSesion() {
      if (!confirm('¿Generar nuevo QR Code? Esto borrará la sesión actual.')) return;

      try {
        updateStatus('waiting', 'Limpiando sesión...');
        showAlert('Limpiando sesión y generando nuevo QR...', 'success');

        const response = await authenticatedFetch('/clear-session', {
          method: 'POST'
        });
        const data = await response.json();

        if (data.success) {
          showAlert(data.message || 'Sesión limpiada. Escanea el nuevo QR.', 'success');
          document.getElementById('session-buttons').style.display = 'none';
          document.getElementById('new-qr-button').style.display = 'none';
          qrContainer.innerHTML = `<div class="spinner"></div><p class="qr-placeholder">Generando nuevo QR...</p>`;
          setTimeout(() => {
            socket.emit('get-status');
            setTimeout(() => {
              document.getElementById('new-qr-button').style.display = 'block';
            }, 2000);
          }, 3000);
        } else {
          showAlert('Error: ' + data.message, 'error');
        }
      } catch (error) {
        showAlert('Error al limpiar sesión: ' + error.message, 'error');
      }
    }
