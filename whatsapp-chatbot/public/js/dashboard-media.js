/**
 * Dashboard Media Browser Logic
 */

let currentPhone = null;
let currentMediaType = 'images';
let allMediaData = null;

/**
 * Initialize Media View
 */
function initMediaView() {
    console.log('🖼️ Initializing Media View...');
    loadMediaPhones();
}

/**
 * Load phone numbers that have media
 */
async function loadMediaPhones() {
    const listContainer = document.getElementById('media-phones-list');
    listContainer.innerHTML = '<div class="loading-mini">Cargando...</div>';

    try {
        const response = await authenticatedFetch('/api/media/phones');
        const result = await response.json();

        if (result.success && result.data) {
            renderPhoneList(result.data);
        } else {
            console.error('Error result:', result);
            listContainer.innerHTML = '<div class="error-mini">Error al cargar</div>';
        }
    } catch (err) {
        console.error('Error loading media phones:', err);
        listContainer.innerHTML = '<div class="error-mini">Error de conexión</div>';
    }
}

/**
 * Render list of phone numbers
 */
function renderPhoneList(phones) {
    const listContainer = document.getElementById('media-phones-list');
    if (phones.length === 0) {
        listContainer.innerHTML = '<div class="empty-mini">No hay archivos</div>';
        return;
    }

    listContainer.innerHTML = '';
    phones.forEach(item => {
        const div = document.createElement('div');
        div.className = `phone-item ${currentPhone === item.phoneNumber ? 'active' : ''}`;
        div.onclick = () => selectPhone(item.phoneNumber);

        div.innerHTML = `
            <span class="phone-number">${item.phoneNumber}</span>
            <div class="phone-stats">
                <span>🖼️ ${item.mediaTypes.images || 0}</span>
                <span>🎵 ${item.mediaTypes.audios || 0}</span>
                <span>🎬 ${item.mediaTypes.videos || 0}</span>
                <span>📄 ${item.mediaTypes.documents || 0}</span>
            </div>
        `;
        listContainer.appendChild(div);
    });
}

/**
 * Handle phone selection
 */
async function selectPhone(phone) {
    currentPhone = phone;
    document.getElementById('selected-phone-display').innerText = `Archivos de ${phone}`;

    // Update active class in list
    document.querySelectorAll('.phone-item').forEach(el => {
        el.classList.toggle('active', el.querySelector('.phone-number').innerText === phone);
    });

    loadPhoneMedia(phone);
}

/**
 * Load all media for a phone number
 */
async function loadPhoneMedia(phone) {
    const grid = document.getElementById('media-grid');
    grid.innerHTML = '<div class="loading-mini">Cargando archivos...</div>';

    try {
        const response = await authenticatedFetch(`/api/media/files/${phone}`);
        const result = await response.json();

        if (result.success && result.data) {
            allMediaData = result.data;
            renderMediaGrid();
        } else {
            console.error('Error result files:', result);
            grid.innerHTML = '<div class="error-mini">Error al cargar archivos</div>';
        }
    } catch (err) {
        console.error('Error loading files:', err);
        grid.innerHTML = '<div class="error-mini">Error de conexión</div>';
    }
}

/**
 * Switch media type tab
 */
function switchMediaType(type) {
    currentMediaType = type;

    // Update tabs UI
    document.querySelectorAll('.media-tab').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${type}'`));
    });

    renderMediaGrid();
}

/**
 * Render the media items in the grid based on current selection
 */
function renderMediaGrid() {
    const grid = document.getElementById('media-grid');
    if (!allMediaData) return;

    const files = allMediaData[currentMediaType] || [];

    if (files.length === 0) {
        grid.innerHTML = `
            <div class="media-empty-state">
                <div class="empty-icon">📁</div>
                <p>No hay ${getTabLabel(currentMediaType).toLowerCase()} para este contacto</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = '';
    files.forEach(file => {
        const item = document.createElement('div');
        item.className = 'media-item';
        item.onclick = () => window.open(file.mediaUrl, '_blank');

        const previewContent = getMediaPreview(file);
        const date = new Date(file.savedAt || Date.now()).toLocaleDateString();
        const size = formatBytes(file.fileSize || 0);

        item.innerHTML = `
            <div class="media-preview">${previewContent}</div>
            <div class="media-info">
                <span class="media-name" title="${file.fileName}">${file.fileName}</span>
                <div class="media-meta">${date} • ${size}</div>
            </div>
        `;
        grid.appendChild(item);
    });
}

/**
 * Helper to get preview HTML
 */
function getMediaPreview(file) {
    const token = localStorage.getItem('admin_token');
    const streamUrl = `/api/media/stream/${file.messageId}${token ? `?token=${token}` : ''}`;

    if (type === 'image') {
        return `<img src="${streamUrl}" alt="${file.fileName}">`;
    }

    const icons = {
        audio: '🎵',
        video: '🎬',
        document: '📄',
        application: '📄',
        other: '❓'
    };

    return `<span class="icon">${icons[type] || icons.other}</span>`;
}

function getTabLabel(type) {
    const labels = {
        images: 'Imágenes',
        videos: 'Videos',
        audios: 'Audios',
        documents: 'Documentos'
    };
    return labels[type] || type;
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Socket listener for new media
if (window.socket) {
    window.socket.on('new-media', (data) => {
        console.log('🔔 New media received via socket:', data);
        // Refresh phone list if it's open
        if (document.getElementById('media-view').style.display !== 'none') {
            loadMediaPhones();
            // If current phone matches, reload files
            if (currentPhone === data.phoneNumber) {
                loadPhoneMedia(currentPhone);
            }
        }
    });
}
