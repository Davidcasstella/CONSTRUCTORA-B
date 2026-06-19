
const fs = require('fs');
const path = require('path');
const config = require('../src/config'); // Ensure config loads correctly from root

// Adjust based on where script is run: from root
const UPLOADS_DIR = path.resolve(config.media.uploadDir || './uploads');
const INDEX_FILE = path.join(UPLOADS_DIR, 'media-index.json');

console.log(`📂 Scanning uploads directory: ${UPLOADS_DIR}`);
console.log(`📄 Index file: ${INDEX_FILE}`);

// Load existing index
let mediaIndex = new Map();
if (fs.existsSync(INDEX_FILE)) {
    try {
        const raw = fs.readFileSync(INDEX_FILE, 'utf-8');
        const entries = JSON.parse(raw);
        mediaIndex = new Map(entries);
        console.log(`✅ Loaded ${mediaIndex.size} entries from index.`);
    } catch (e) {
        console.error(`❌ Error reading index: ${e.message}`);
    }
}

// Helper to scan directory recursively
function scanDir(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            scanDir(filePath, fileList);
        } else {
            fileList.push(filePath);
        }
    }
    return fileList;
}

// Regex for WhatsApp media: CHATID_MSGID_TIMESTAMP.ext
// Example: 573028599105_3EB05617381CF81D14C352_1771079847598.jpg
const MEDIA_PATTERN = /^(.+)_([A-Z0-9]+)_(\d+)\.(.+)$/;

// Scan
const allFiles = scanDir(UPLOADS_DIR);
console.log(`🔍 Found ${allFiles.length} files in uploads.`);

let addedCount = 0;

for (const filePath of allFiles) {
    const fileName = path.basename(filePath);

    // Ignore system files
    if (fileName === 'media-index.json' || fileName.startsWith('.')) continue;

    // Check if it matches pattern
    const match = fileName.match(MEDIA_PATTERN);
    if (match) {
        const [_, chatId, messageId, timestampStr, ext] = match;

        if (!mediaIndex.has(messageId)) {
            // Determine mime type roughly
            let mimeType = 'application/octet-stream';
            let mediaType = 'document'; // default

            if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext.toLowerCase())) {
                mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
                mediaType = 'image';
            } else if (['mp3', 'ogg', 'wav', 'm4a'].includes(ext.toLowerCase())) {
                mimeType = `audio/${ext === 'mp3' ? 'mpeg' : ext}`;
                mediaType = 'audio';
            } else if (['mp4', '3gp'].includes(ext.toLowerCase())) {
                mimeType = `video/${ext}`;
                mediaType = 'video';
            } else if (['pdf'].includes(ext.toLowerCase())) {
                mimeType = 'application/pdf';
                mediaType = 'document';
            }

            const fileSize = fs.statSync(filePath).size;

            const newEntry = {
                mediaUrl: `/api/media/download/${messageId}`,
                fileName: fileName,
                mimeType: mimeType,
                fileSize: fileSize,
                filePath: filePath, // Absolute path
                mediaType: mediaType,
                chatId: chatId,
                savedAt: parseInt(timestampStr, 10),
                s3Key: null
            };

            mediaIndex.set(messageId, newEntry);
            addedCount++;
            console.log(`➕ Added missing entry: ${messageId} (${fileName})`);
        }
    }
}

if (addedCount > 0) {
    // Save updated index
    const entries = Array.from(mediaIndex.entries());
    fs.writeFileSync(INDEX_FILE, JSON.stringify(entries, null, 2), 'utf-8');
    console.log(`💾 Saved updated index with ${addedCount} new entries.`);
} else {
    console.log(`✨ Index is up to date. No orphaned files found.`);
}
