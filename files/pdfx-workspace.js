/* pdfx-workspace.js — STUB (logic coming in next session) */

// ── GLOBALS ──
const MAX_FILE_BYTES  = 100 * 1024 * 1024;  // 100MB hard limit
const WARN_FILE_BYTES =  50 * 1024 * 1024;  // 50MB soft warning
const MAX_WS_BYTES    = 300 * 1024 * 1024;  // 300MB workspace limit
const WARN_WS_BYTES   = 200 * 1024 * 1024;  // 200MB soft warning

let workspace        = [];    // array of file objects
let nextId           = 1;
let selectedId       = null;  // currently selected workspace file
let viewingId        = null;  // file shown in viewer
let backupEnabled    = false;
let backupDismissed  = false;
let warnCancelCallback = null;

// ── STUB FUNCTIONS (will be implemented in full build) ──
function triggerLoad()         { console.log('triggerLoad — coming soon'); }
function handleFileInputChange(inp) { console.log('handleFileInputChange — coming soon'); }
function clearWorkspace()      { console.log('clearWorkspace — coming soon'); }
function enableBackup()        { console.log('enableBackup — coming soon'); }
function dismissBackup()       { console.log('dismissBackup — coming soon'); }
function showBackupStatus()    { console.log('showBackupStatus — coming soon'); }
function openDownloadModal()   { console.log('openDownloadModal — coming soon'); }
function downloadSelected()    { console.log('downloadSelected — coming soon'); }
function downloadAll()         { console.log('downloadAll — coming soon'); }
function downloadOutputsOnly() { console.log('downloadOutputsOnly — coming soon'); }
function dlSelectAll()         { console.log('dlSelectAll — coming soon'); }
function toggleDetail(id)      { console.log('toggleDetail', id, '— coming soon'); }
