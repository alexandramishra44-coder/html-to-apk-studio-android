/**
 * HTML TO APK CONVERTER STUDIO - Frontend Application
 */

const API = window.location.origin.includes('3001') 
  ? window.location.origin 
  : (window.location.port === '5500' || window.location.protocol === 'file:' 
      ? 'http://localhost:3001' 
      : window.location.origin);

const state = {
  view: 'dashboard',
  projects: [],
  builds: [],
  currentProject: null,
  wizardStep: 1,
  serverOnline: false,
  ws: null,
  buildProgress: null,
  previewMode: 'app'
};

// ---------- Utilities ----------
function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: 'fa-check-circle', error: 'fa-circle-exclamation', info: 'fa-info-circle' };
  el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><div>${msg}</div>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

async function api(path, opts = {}) {
  const url = `${API}/api${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts
  };
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    config.body = JSON.stringify(opts.body);
  }
  if (opts.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  const res = await fetch(url, config);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function formatBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(i ? 1 : 0) + ' ' + u[i];
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function slugifyPackage(name) {
  const base = (name || 'myapp')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^[0-9]/, '') || 'myapp';
  return `com.example.${base}`;
}

// ---------- WebSocket ----------
function connectWS() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = API.replace(/^https?:\/\//, '');
  try {
    state.ws = new WebSocket(`${protocol}//${host}/ws`);
    state.ws.onopen = () => console.log('[WS] connected');
    state.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'build_update') {
          state.buildProgress = msg;
          if (state.view === 'build' || state.view === 'build-progress') {
            renderBuildProgress(msg.buildId);
          }
        }
      } catch (e) {}
    };
    state.ws.onclose = () => setTimeout(connectWS, 3000);
  } catch (e) {
    console.warn('WS failed', e);
  }
}

// ---------- Navigation ----------
function setView(view, params = {}) {
  state.view = view;
  $$('.nav-item, .bottom-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  const titles = {
    dashboard: 'Dashboard',
    'new-project': 'New Project',
    projects: 'My Projects',
    customize: 'App Customization',
    build: 'Build APK',
    'build-progress': 'Building…',
    history: 'Build History',
    settings: 'Settings',
    project: 'Project Details'
  };
  $('#page-title').textContent = titles[view] || 'APK Studio';
  render();
  // Close mobile sidebar
  $('#sidebar').classList.remove('open');
}

function render() {
  const content = $('#content');
  switch (state.view) {
    case 'dashboard': content.innerHTML = renderDashboard(); break;
    case 'new-project': content.innerHTML = renderWizard(); bindWizard(); break;
    case 'projects': content.innerHTML = renderProjects(); bindProjects(); break;
    case 'customize': content.innerHTML = renderCustomize(); bindCustomize(); break;
    case 'build': content.innerHTML = renderBuild(); bindBuild(); break;
    case 'build-progress': content.innerHTML = renderBuildProgressView(); break;
    case 'history': content.innerHTML = renderHistory(); break;
    case 'settings': content.innerHTML = renderSettings(); break;
    default: content.innerHTML = renderDashboard();
  }
}

// ---------- Dashboard ----------
function renderDashboard() {
  const total = state.projects.length;
  const builds = state.builds.length;
  const success = state.builds.filter(b => b.status === 'success').length;
  const recent = state.projects.slice(0, 5);

  return `
    <div class="grid grid-4 mb-24">
      <div class="stat-card">
        <div class="stat-icon purple"><i class="fa-solid fa-folder"></i></div>
        <div><div class="stat-value">${total}</div><div class="stat-label">Projects</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue"><i class="fa-solid fa-hammer"></i></div>
        <div><div class="stat-value">${builds}</div><div class="stat-label">Total Builds</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green"><i class="fa-solid fa-check"></i></div>
        <div><div class="stat-value">${success}</div><div class="stat-label">Successful</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange"><i class="fa-solid fa-server"></i></div>
        <div><div class="stat-value">${state.serverOnline ? 'Online' : 'Offline'}</div><div class="stat-label">Build Server</div></div>
      </div>
    </div>

    <div class="card mb-24">
      <div class="card-header">
        <h2 class="card-title">Quick Start</h2>
      </div>
      <p class="text-muted text-sm mb-16">Convert any HTML/CSS/JS website into a real installable Android APK in minutes.</p>
      <div class="flex gap-12" style="flex-wrap:wrap">
        <button class="btn btn-primary" onclick="setView('new-project')"><i class="fa-solid fa-plus"></i> Create New Project</button>
        <button class="btn btn-secondary" onclick="setView('projects')"><i class="fa-solid fa-folder-open"></i> Browse Projects</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Recent Projects</h2>
        <button class="btn btn-ghost btn-sm" onclick="setView('projects')">View all</button>
      </div>
      ${recent.length === 0 ? `
        <div class="empty-state">
          <i class="fa-solid fa-mobile-screen"></i>
          <h3>No projects yet</h3>
          <p>Create your first HTML → APK project to get started.</p>
          <button class="btn btn-primary mt-16" onclick="setView('new-project')">Create Project</button>
        </div>
      ` : `
        <div class="grid gap-12">
          ${recent.map(p => projectCardHTML(p)).join('')}
        </div>
      `}
    </div>
  `;
}

function projectCardHTML(p) {
  const icon = p.icon ? `${API}/api/uploads/${p.id}/assets/icon.png` : null;
  return `
    <div class="project-card" onclick="openProject('${p.id}')">
      <div class="project-icon">
        ${icon ? `<img src="${icon}" alt="" onerror="this.parentElement.innerHTML='<i class=\\'fa-solid fa-mobile\\'></i>'">` : '<i class="fa-solid fa-mobile"></i>'}
      </div>
      <div class="project-info">
        <div class="project-name">${escapeHtml(p.name)}</div>
        <div class="project-pkg">${escapeHtml(p.packageName)}</div>
        <div class="project-meta">
          <span>v${p.versionName || '1.0.0'}</span>
          <span>${formatDate(p.updatedAt)}</span>
        </div>
      </div>
      <div class="project-actions" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" title="Build" onclick="openProject('${p.id}'); setTimeout(()=>setView('build'),50)"><i class="fa-solid fa-hammer"></i></button>
        <button class="btn btn-ghost btn-sm" title="Delete" onclick="deleteProject('${p.id}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---------- Wizard ----------
function renderWizard() {
  const step = state.wizardStep;
  const steps = [
    { n: 1, label: 'App Info' },
    { n: 2, label: 'Upload HTML' },
    { n: 3, label: 'Icon' },
    { n: 4, label: 'Splash' },
    { n: 5, label: 'Background' },
    { n: 6, label: 'Android' },
    { n: 7, label: 'WebView' },
    { n: 8, label: 'Features' }
  ];

  return `
    <div class="wizard-steps">
      ${steps.map(s => `
        <div class="wizard-step ${s.n === step ? 'active' : ''} ${s.n < step ? 'done' : ''}" data-step="${s.n}">
          <span class="num">${s.n < step ? '✓' : s.n}</span>
          ${s.label}
        </div>
      `).join('')}
    </div>

    <div class="card" id="wizard-body">
      ${renderWizardStep(step)}
    </div>

    <div class="flex justify-between mt-24">
      <button class="btn btn-secondary" id="wiz-prev" ${step === 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-left"></i> Back</button>
      <div class="flex gap-12">
        ${step < 8 ? `<button class="btn btn-primary" id="wiz-next">Next <i class="fa-solid fa-arrow-right"></i></button>` : ''}
        ${step === 8 ? `<button class="btn btn-primary btn-lg" id="wiz-finish"><i class="fa-solid fa-check"></i> Create Project</button>` : ''}
      </div>
    </div>
  `;
}

function renderWizardStep(step) {
  const p = state.currentProject || {};
  switch (step) {
    case 1: return `
      <h2 class="card-title mb-16">Application Information</h2>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Application Name <span class="req">*</span></label>
          <input class="form-input" id="f-name" value="${escapeHtml(p.name || '')}" placeholder="My Awesome App" />
        </div>
        <div class="form-group">
          <label class="form-label">Package Name <span class="req">*</span></label>
          <input class="form-input font-mono" id="f-package" value="${escapeHtml(p.packageName || 'com.example.myapp')}" placeholder="com.company.app" />
          <div class="form-hint">Reverse domain notation. Must be unique.</div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Version Name</label>
          <input class="form-input" id="f-versionName" value="${escapeHtml(p.versionName || '1.0.0')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Version Code</label>
          <input class="form-input" type="number" id="f-versionCode" value="${p.versionCode || 1}" min="1" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Developer Name</label>
        <input class="form-input" id="f-developer" value="${escapeHtml(p.developerName || '')}" />
      </div>
      <div class="form-group">
        <label class="form-label">Short Description</label>
        <input class="form-input" id="f-shortDesc" value="${escapeHtml(p.shortDescription || '')}" maxlength="80" />
      </div>
      <div class="form-group">
        <label class="form-label">Full Description</label>
        <textarea class="form-textarea" id="f-fullDesc">${escapeHtml(p.fullDescription || '')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Website URL</label>
          <input class="form-input" id="f-website" value="${escapeHtml(p.websiteUrl || '')}" placeholder="https://" />
        </div>
        <div class="form-group">
          <label class="form-label">Support Email</label>
          <input class="form-input" id="f-email" type="email" value="${escapeHtml(p.supportEmail || '')}" />
        </div>
      </div>
    `;
    case 2: return `
      <h2 class="card-title mb-16">Upload HTML Project</h2>
      <p class="text-muted text-sm mb-16">Upload a single HTML file, multiple assets, or a complete ZIP archive of your website.</p>
      <div class="upload-zone" id="upload-zone">
        <i class="fa-solid fa-cloud-arrow-up"></i>
        <p>Drag & drop files here or click to browse</p>
        <div class="hint">Supports .html, .css, .js, images, fonts, and .zip (max 50 MB)</div>
        <input type="file" id="file-input" multiple accept=".html,.htm,.css,.js,.json,.png,.jpg,.jpeg,.webp,.gif,.svg,.woff,.woff2,.ttf,.otf,.zip" style="display:none" />
      </div>
      <div class="file-list" id="file-list"></div>
      <div class="form-group mt-16">
        <label class="form-label">Entry HTML file</label>
        <input class="form-input font-mono" id="f-entryHtml" value="${escapeHtml(p.entryHtml || 'index.html')}" />
      </div>
    `;
    case 3: return `
      <h2 class="card-title mb-16">App Icon</h2>
      <p class="text-muted text-sm mb-16">Recommended: 1024×1024 PNG. We generate all Android density sizes automatically.</p>
      <div class="two-col">
        <div>
          <div class="upload-zone" id="icon-zone" style="padding:30px">
            <i class="fa-solid fa-image"></i>
            <p>Upload icon image</p>
            <input type="file" id="icon-input" accept=".png,.jpg,.jpeg,.webp" style="display:none" />
          </div>
          <div class="form-group mt-16">
            <label class="form-label">Icon background color (adaptive)</label>
            <div class="color-row">
              <input type="color" id="f-iconBg" value="#6366F1" />
              <span class="text-sm text-muted">Used for adaptive icon background</span>
            </div>
          </div>
        </div>
        <div class="device-preview">
          <div class="preview-modes">
            <button class="preview-mode-btn active" data-mode="home">Home Screen</button>
          </div>
          <div class="device-frame">
            <div class="device-notch"></div>
            <div class="device-screen">
              <div class="homescreen-preview" id="icon-preview">
                <div class="homescreen-icon" id="preview-icon"><i class="fa-solid fa-mobile"></i></div>
                <div class="homescreen-label" id="preview-icon-name">${escapeHtml(p.name || 'My App')}</div>
              </div>
            </div>
          </div>
          <p class="text-xs text-muted text-center mt-16">Simulation only — not a real device runtime</p>
        </div>
      </div>
    `;
    case 4: return `
      <h2 class="card-title mb-16">Splash Screen</h2>
      <div class="two-col">
        <div>
          <div class="form-group">
            <label class="form-label">Background color</label>
            <div class="color-row">
              <input type="color" id="f-splashBg" value="${p.splash?.backgroundColor || '#090B12'}" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Text color</label>
            <div class="color-row">
              <input type="color" id="f-splashText" value="${p.splash?.textColor || '#FFFFFF'}" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Subtitle</label>
            <input class="form-input" id="f-splashSub" value="${escapeHtml(p.splash?.subtitle || '')}" placeholder="Optional subtitle" />
          </div>
          <div class="form-group">
            <label class="form-label">Duration (ms)</label>
            <input class="form-input" type="number" id="f-splashDur" value="${p.splash?.duration || 2000}" min="500" max="10000" />
          </div>
          <div class="upload-zone mt-16" id="splash-zone" style="padding:24px">
            <i class="fa-solid fa-image"></i>
            <p>Upload splash image (optional)</p>
            <input type="file" id="splash-input" accept=".png,.jpg,.jpeg,.webp" style="display:none" />
          </div>
        </div>
        <div class="device-preview">
          <div class="device-frame">
            <div class="device-notch"></div>
            <div class="device-screen">
              <div class="splash-preview" id="splash-preview" style="background:${p.splash?.backgroundColor || '#090B12'}">
                <div class="splash-logo" id="splash-logo"><i class="fa-solid fa-mobile"></i></div>
                <div style="font-size:18px;font-weight:700;color:${p.splash?.textColor || '#fff'}" id="splash-name">${escapeHtml(p.name || 'My App')}</div>
                <div style="font-size:13px;opacity:0.7;color:${p.splash?.textColor || '#fff'}" id="splash-sub">${escapeHtml(p.splash?.subtitle || '')}</div>
              </div>
            </div>
          </div>
          <p class="text-xs text-muted text-center mt-16">Splash screen preview</p>
        </div>
      </div>
    `;
    case 5: return `
      <h2 class="card-title mb-16">App Background</h2>
      <p class="text-muted text-sm mb-16">Customize the background that appears behind your website content inside the WebView.</p>
      <div class="form-group">
        <label class="form-label">Background type</label>
        <select class="form-select" id="f-bgType">
          <option value="color" ${(!p.background || p.background.type === 'color') ? 'selected' : ''}>Solid color</option>
          <option value="image" ${p.background?.type === 'image' ? 'selected' : ''}>Image</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Background color</label>
        <div class="color-row">
          <input type="color" id="f-bgColor" value="${p.background?.color || '#090B12'}" />
        </div>
      </div>
      <div class="upload-zone" id="bg-zone" style="padding:24px">
        <i class="fa-solid fa-image"></i>
        <p>Upload background image</p>
        <input type="file" id="bg-input" accept=".png,.jpg,.jpeg,.webp" style="display:none" />
      </div>
      <div class="form-group mt-16">
        <label class="form-label">Image fit</label>
        <select class="form-select" id="f-bgFit">
          <option value="cover">Cover</option>
          <option value="contain">Contain</option>
          <option value="center">Center</option>
        </select>
      </div>
      <div class="form-group">
        <label class="toggle">
          <input type="checkbox" id="f-bgApply" ${p.background?.applyToWebsite ? 'checked' : ''} />
          <span class="toggle-track"></span>
          <span>Apply background to website CSS (optional)</span>
        </label>
        <div class="form-hint">When enabled, a background style is injected into the entry HTML. Your original CSS is preserved otherwise.</div>
      </div>
    `;
    case 6: return `
      <h2 class="card-title mb-16">Android Configuration</h2>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Minimum SDK</label>
          <select class="form-select" id="f-minSdk">
            ${[24,25,26,27,28,29,30,31,32,33,34].map(v => `<option value="${v}" ${(p.android?.minSdk||24)==v?'selected':''}>API ${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Target SDK</label>
          <select class="form-select" id="f-targetSdk">
            ${[33,34,35].map(v => `<option value="${v}" ${(p.android?.targetSdk||34)==v?'selected':''}>API ${v}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Orientation</label>
        <select class="form-select" id="f-orientation">
          <option value="portrait" ${(!p.android || p.android.orientation==='portrait')?'selected':''}>Portrait</option>
          <option value="landscape" ${p.android?.orientation==='landscape'?'selected':''}>Landscape</option>
          <option value="auto" ${p.android?.orientation==='auto'?'selected':''}>Auto</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Status bar color</label>
          <div class="color-row"><input type="color" id="f-statusBar" value="${p.android?.statusBarColor || '#090B12'}" /></div>
        </div>
        <div class="form-group">
          <label class="form-label">Navigation bar color</label>
          <div class="color-row"><input type="color" id="f-navBar" value="${p.android?.navigationBarColor || '#090B12'}" /></div>
        </div>
      </div>
      <div class="section-title mt-24">Permissions</div>
      <p class="text-muted text-sm mb-16">Only enable permissions your app actually needs. Sensitive permissions will show a warning.</p>
      ${renderPermissionToggles(p.permissions || {})}
    `;
    case 7: return `
      <h2 class="card-title mb-16">WebView Settings</h2>
      <p class="text-muted text-sm mb-16">Secure defaults are applied. Avoid enabling mixed content or unrestricted file access.</p>
      ${renderWebViewToggles(p.webview || {})}
    `;
    case 8: return `
      <h2 class="card-title mb-16">Advanced Features</h2>
      ${renderFeatureToggles(p.features || {})}
      <div class="card mt-24" style="background:rgba(139,92,246,0.08);border-color:rgba(139,92,246,0.25)">
        <h3 style="font-size:15px;margin-bottom:8px">Ready to create</h3>
        <p class="text-sm text-muted">Review your settings, then click <strong>Create Project</strong>. You can still edit everything later and rebuild the APK at any time.</p>
      </div>
    `;
    default: return '';
  }
}

function renderPermissionToggles(perms) {
  const items = [
    { key: 'internet', label: 'Internet', desc: 'Required for most web apps', default: true },
    { key: 'camera', label: 'Camera', desc: 'Access device camera', warn: true },
    { key: 'microphone', label: 'Microphone', desc: 'Record audio', warn: true },
    { key: 'location', label: 'Location', desc: 'GPS / network location', warn: true },
    { key: 'notifications', label: 'Notifications', desc: 'Push & local notifications' },
    { key: 'storage', label: 'Storage / Media', desc: 'Read/write external files', warn: true },
    { key: 'vibration', label: 'Vibration', desc: 'Haptic feedback' },
    { key: 'biometric', label: 'Biometric', desc: 'Fingerprint / face unlock' }
  ];
  return items.map(i => `
    <div class="form-group">
      <label class="toggle">
        <input type="checkbox" id="perm-${i.key}" ${ (perms[i.key] ?? i.default) ? 'checked' : '' } />
        <span class="toggle-track"></span>
        <span>
          <strong>${i.label}</strong>
          <span class="text-xs text-muted" style="display:block">${i.desc}${i.warn ? ' — sensitive' : ''}</span>
        </span>
      </label>
    </div>
  `).join('');
}

function renderWebViewToggles(wv) {
  const items = [
    { key: 'javascript', label: 'JavaScript', default: true },
    { key: 'domStorage', label: 'DOM Storage', default: true },
    { key: 'zoom', label: 'Zoom support', default: false },
    { key: 'fileUpload', label: 'File upload', default: true },
    { key: 'downloads', label: 'Downloads', default: true },
    { key: 'geolocation', label: 'Geolocation', default: false },
    { key: 'offline', label: 'Offline asset support', default: true },
    { key: 'pullToRefresh', label: 'Pull to refresh', default: false }
  ];
  return items.map(i => `
    <div class="form-group">
      <label class="toggle">
        <input type="checkbox" id="wv-${i.key}" ${ (wv[i.key] ?? i.default) ? 'checked' : '' } />
        <span class="toggle-track"></span>
        <span>${i.label}</span>
      </label>
    </div>
  `).join('') + `
    <div class="form-group">
      <label class="form-label">External links</label>
      <select class="form-select" id="wv-externalLinks">
        <option value="inapp" ${(!wv.externalLinks || wv.externalLinks==='inapp')?'selected':''}>Open in WebView</option>
        <option value="external" ${wv.externalLinks==='external'?'selected':''}>Open in external browser</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Back button behavior</label>
      <select class="form-select" id="wv-backButton">
        <option value="history" ${(!wv.backButton || wv.backButton==='history')?'selected':''}>Navigate history</option>
        <option value="exit" ${wv.backButton==='exit'?'selected':''}>Exit app</option>
      </select>
    </div>
  `;
}

function renderFeatureToggles(feat) {
  const items = [
    { key: 'offlineMode', label: 'Offline mode', default: true },
    { key: 'localCaching', label: 'Local asset caching', default: true },
    { key: 'customLoading', label: 'Custom loading indicator', default: true },
    { key: 'errorPage', label: 'Custom error page', default: true },
    { key: 'networkDetection', label: 'Network connectivity detection', default: true },
    { key: 'share', label: 'Native share', default: false },
    { key: 'nativeBack', label: 'Native back button handling', default: true }
  ];
  return items.map(i => `
    <div class="form-group">
      <label class="toggle">
        <input type="checkbox" id="feat-${i.key}" ${ (feat[i.key] ?? i.default) ? 'checked' : '' } />
        <span class="toggle-track"></span>
        <span>${i.label}</span>
      </label>
    </div>
  `).join('');
}

function bindWizard() {
  // Auto package name
  const nameInput = $('#f-name');
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      const pkg = $('#f-package');
      if (pkg && (!pkg.dataset.touched || pkg.dataset.touched === '0')) {
        pkg.value = slugifyPackage(nameInput.value);
      }
    });
  }
  const pkgInput = $('#f-package');
  if (pkgInput) {
    pkgInput.addEventListener('input', () => { pkgInput.dataset.touched = '1'; });
  }

  // Upload zone
  const zone = $('#upload-zone');
  const input = $('#file-input');
  if (zone && input) {
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });
    input.addEventListener('change', () => handleFiles(input.files));
  }

  // Icon / splash / bg upload zones
  setupAssetUpload('icon-zone', 'icon-input', 'icon');
  setupAssetUpload('splash-zone', 'splash-input', 'splash');
  setupAssetUpload('bg-zone', 'bg-input', 'background');

  // Live splash preview
  ['f-splashBg', 'f-splashText', 'f-splashSub'].forEach(id => {
    const el = $(`#${id}`);
    if (el) el.addEventListener('input', updateSplashPreview);
  });
  if ($('#f-name')) {
    // already bound
  }

  $('#wiz-prev')?.addEventListener('click', () => {
    collectWizardStep();
    state.wizardStep = Math.max(1, state.wizardStep - 1);
    render();
  });
  $('#wiz-next')?.addEventListener('click', () => {
    if (!validateWizardStep()) return;
    collectWizardStep();
    state.wizardStep = Math.min(8, state.wizardStep + 1);
    render();
  });
  $('#wiz-finish')?.addEventListener('click', finishWizard);

  $$('.wizard-step').forEach(el => {
    el.addEventListener('click', () => {
      const s = parseInt(el.dataset.step, 10);
      if (s < state.wizardStep) {
        collectWizardStep();
        state.wizardStep = s;
        render();
      }
    });
  });
}

function setupAssetUpload(zoneId, inputId, type) {
  const zone = $(`#${zoneId}`);
  const input = $(`#${inputId}`);
  if (!zone || !input) return;
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    if (!input.files?.[0]) return;
    if (!state.currentProject?.id) {
      // Create temporary project first if needed
      toast('Please complete App Info and create the project first, or we will create it on finish.', 'info');
      // Store file for later
      state[`pending${type}`] = input.files[0];
      if (type === 'icon') {
        const url = URL.createObjectURL(input.files[0]);
        const preview = $('#preview-icon');
        if (preview) preview.innerHTML = `<img src="${url}" alt="">`;
      }
      return;
    }
    await uploadAsset(state.currentProject.id, type, input.files[0]);
  });
}

async function handleFiles(fileList) {
  const list = $('#file-list');
  if (!list) return;
  list.innerHTML = '';
  [...fileList].forEach(f => {
    list.innerHTML += `<div class="file-item"><i class="fa-solid fa-file"></i><span>${escapeHtml(f.name)}</span><span class="size">${formatBytes(f.size)}</span></div>`;
  });
  state.pendingFiles = fileList;
}

function collectWizardStep() {
  if (!state.currentProject) state.currentProject = {};
  const p = state.currentProject;
  const step = state.wizardStep;

  if (step === 1) {
    p.name = $('#f-name')?.value?.trim() || 'Untitled App';
    p.packageName = $('#f-package')?.value?.trim() || slugifyPackage(p.name);
    p.versionName = $('#f-versionName')?.value || '1.0.0';
    p.versionCode = parseInt($('#f-versionCode')?.value || '1', 10);
    p.developerName = $('#f-developer')?.value || '';
    p.shortDescription = $('#f-shortDesc')?.value || '';
    p.fullDescription = $('#f-fullDesc')?.value || '';
    p.websiteUrl = $('#f-website')?.value || '';
    p.supportEmail = $('#f-email')?.value || '';
  }
  if (step === 2) {
    p.entryHtml = $('#f-entryHtml')?.value || 'index.html';
  }
  if (step === 4) {
    p.splash = p.splash || {};
    p.splash.backgroundColor = $('#f-splashBg')?.value || '#090B12';
    p.splash.textColor = $('#f-splashText')?.value || '#FFFFFF';
    p.splash.subtitle = $('#f-splashSub')?.value || '';
    p.splash.duration = parseInt($('#f-splashDur')?.value || '2000', 10);
  }
  if (step === 5) {
    p.background = p.background || {};
    p.background.type = $('#f-bgType')?.value || 'color';
    p.background.color = $('#f-bgColor')?.value || '#090B12';
    p.background.fit = $('#f-bgFit')?.value || 'cover';
    p.background.applyToWebsite = $('#f-bgApply')?.checked || false;
  }
  if (step === 6) {
    p.android = p.android || {};
    p.android.minSdk = parseInt($('#f-minSdk')?.value || '24', 10);
    p.android.targetSdk = parseInt($('#f-targetSdk')?.value || '34', 10);
    p.android.orientation = $('#f-orientation')?.value || 'portrait';
    p.android.statusBarColor = $('#f-statusBar')?.value || '#090B12';
    p.android.navigationBarColor = $('#f-navBar')?.value || '#090B12';
    p.permissions = {};
    ['internet','camera','microphone','location','notifications','storage','vibration','biometric'].forEach(k => {
      p.permissions[k] = $(`#perm-${k}`)?.checked || false;
    });
  }
  if (step === 7) {
    p.webview = {};
    ['javascript','domStorage','zoom','fileUpload','downloads','geolocation','offline','pullToRefresh'].forEach(k => {
      p.webview[k] = $(`#wv-${k}`)?.checked || false;
    });
    p.webview.externalLinks = $('#wv-externalLinks')?.value || 'inapp';
    p.webview.backButton = $('#wv-backButton')?.value || 'history';
  }
  if (step === 8) {
    p.features = {};
    ['offlineMode','localCaching','customLoading','errorPage','networkDetection','share','nativeBack'].forEach(k => {
      p.features[k] = $(`#feat-${k}`)?.checked || false;
    });
  }
}

function validateWizardStep() {
  if (state.wizardStep === 1) {
    const name = $('#f-name')?.value?.trim();
    const pkg = $('#f-package')?.value?.trim();
    if (!name) { toast('Application name is required', 'error'); return false; }
    if (!pkg || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(pkg)) {
      toast('Invalid package name. Use format: com.company.app', 'error');
      return false;
    }
  }
  return true;
}

function updateSplashPreview() {
  const bg = $('#f-splashBg')?.value || '#090B12';
  const text = $('#f-splashText')?.value || '#fff';
  const sub = $('#f-splashSub')?.value || '';
  const name = $('#f-name')?.value || state.currentProject?.name || 'My App';
  const preview = $('#splash-preview');
  if (preview) {
    preview.style.background = bg;
    const n = $('#splash-name');
    const s = $('#splash-sub');
    if (n) { n.style.color = text; n.textContent = name; }
    if (s) { s.style.color = text; s.textContent = sub; }
  }
}

async function finishWizard() {
  collectWizardStep();
  if (!validateWizardStep()) return;

  try {
    toast('Creating project…', 'info');
    const data = await api('/projects', {
      method: 'POST',
      body: state.currentProject
    });
    state.currentProject = data.project;

    // Upload pending files
    if (state.pendingFiles && state.pendingFiles.length) {
      const fd = new FormData();
      [...state.pendingFiles].forEach(f => fd.append('files', f));
      await fetch(`${API}/api/uploads/${data.project.id}/html`, { method: 'POST', body: fd });
    }
    if (state.pendingicon) await uploadAsset(data.project.id, 'icon', state.pendingicon);
    if (state.pendingsplash) await uploadAsset(data.project.id, 'splash', state.pendingsplash);
    if (state.pendingbackground) await uploadAsset(data.project.id, 'background', state.pendingbackground);

    await loadProjects();
    toast('Project created successfully!', 'success');
    state.wizardStep = 1;
    openProject(data.project.id);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function uploadAsset(projectId, type, file) {
  const fd = new FormData();
  fd.append(type === 'icon' ? 'icon' : type === 'splash' ? 'splash' : 'background', file);
  const endpoint = type === 'icon' ? 'icon' : type === 'splash' ? 'splash' : 'background';
  const res = await fetch(`${API}/api/uploads/${projectId}/${endpoint}`, { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  if (state.currentProject) Object.assign(state.currentProject, data);
  toast(`${type} uploaded`, 'success');
  return data;
}

// ---------- Projects list ----------
function renderProjects() {
  return `
    <div class="flex justify-between items-center mb-24">
      <p class="text-muted text-sm">${state.projects.length} project(s)</p>
      <button class="btn btn-primary" onclick="setView('new-project')"><i class="fa-solid fa-plus"></i> New Project</button>
    </div>
    ${state.projects.length === 0 ? `
      <div class="card"><div class="empty-state">
        <i class="fa-solid fa-folder-open"></i>
        <h3>No projects</h3>
        <p>Create a project to start converting HTML to APK.</p>
        <button class="btn btn-primary mt-16" onclick="setView('new-project')">Create Project</button>
      </div></div>
    ` : `
      <div class="grid gap-12">
        ${state.projects.map(p => projectCardHTML(p)).join('')}
      </div>
    `}
  `;
}

function bindProjects() {}

async function openProject(id) {
  try {
    const data = await api(`/projects/${id}`);
    state.currentProject = data.project;
    $('#nav-customize').style.display = '';
    $('#nav-build').style.display = '';
    setView('customize');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteProject(id) {
  if (!confirm('Delete this project and all its builds?')) return;
  try {
    await api(`/projects/${id}`, { method: 'DELETE' });
    toast('Project deleted', 'success');
    await loadProjects();
    if (state.currentProject?.id === id) {
      state.currentProject = null;
      $('#nav-customize').style.display = 'none';
      $('#nav-build').style.display = 'none';
    }
    render();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------- Customize view ----------
function renderCustomize() {
  const p = state.currentProject;
  if (!p) return `<div class="card"><div class="empty-state"><h3>No project selected</h3><button class="btn btn-primary mt-16" onclick="setView('projects')">Choose a project</button></div></div>`;

  return `
    <div class="two-col">
      <div>
        <div class="card mb-16">
          <h2 class="card-title mb-16">${escapeHtml(p.name)}</h2>
          <p class="text-sm font-mono text-muted mb-16">${escapeHtml(p.packageName)} · v${p.versionName}</p>
          <div class="flex gap-12" style="flex-wrap:wrap">
            <button class="btn btn-primary" onclick="setView('build')"><i class="fa-solid fa-hammer"></i> Build APK</button>
            <button class="btn btn-secondary" onclick="state.wizardStep=1;setView('new-project')"><i class="fa-solid fa-pen"></i> Edit in Wizard</button>
          </div>
        </div>
        <div class="card">
          <h3 class="section-title">Quick edits</h3>
          <div class="form-group">
            <label class="form-label">App Name</label>
            <input class="form-input" id="edit-name" value="${escapeHtml(p.name)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Package Name</label>
            <input class="form-input font-mono" id="edit-pkg" value="${escapeHtml(p.packageName)}" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Version Name</label>
              <input class="form-input" id="edit-verName" value="${escapeHtml(p.versionName)}" />
            </div>
            <div class="form-group">
              <label class="form-label">Version Code</label>
              <input class="form-input" type="number" id="edit-verCode" value="${p.versionCode}" />
            </div>
          </div>
          <button class="btn btn-secondary" id="btn-save-project"><i class="fa-solid fa-floppy-disk"></i> Save Changes</button>
        </div>
      </div>
      <div class="device-preview">
        <div class="preview-modes">
          <button class="preview-mode-btn ${state.previewMode==='home'?'active':''}" data-mode="home">Icon</button>
          <button class="preview-mode-btn ${state.previewMode==='splash'?'active':''}" data-mode="splash">Splash</button>
          <button class="preview-mode-btn ${state.previewMode==='app'?'active':''}" data-mode="app">App</button>
        </div>
        <div class="device-frame">
          <div class="device-notch"></div>
          <div class="device-screen" id="live-preview">
            ${renderDeviceContent(p)}
          </div>
        </div>
        <p class="text-xs text-muted text-center mt-16">Live simulation preview</p>
      </div>
    </div>
  `;
}

function renderDeviceContent(p) {
  const mode = state.previewMode;
  if (mode === 'home') {
    const iconUrl = p.icon ? `${API}/api/uploads/${p.id}/assets/icon.png` : null;
    return `
      <div class="homescreen-preview">
        <div class="homescreen-icon">${iconUrl ? `<img src="${iconUrl}" alt="">` : '<i class="fa-solid fa-mobile"></i>'}</div>
        <div class="homescreen-label">${escapeHtml(p.name)}</div>
      </div>`;
  }
  if (mode === 'splash') {
    const bg = p.splash?.backgroundColor || '#090B12';
    const text = p.splash?.textColor || '#fff';
    return `
      <div class="splash-preview" style="background:${bg}">
        <div class="splash-logo"><i class="fa-solid fa-mobile"></i></div>
        <div style="font-size:18px;font-weight:700;color:${text}">${escapeHtml(p.name)}</div>
        <div style="font-size:13px;opacity:0.7;color:${text}">${escapeHtml(p.splash?.subtitle || '')}</div>
      </div>`;
  }
  // App mode
  return `
    <div class="device-statusbar" style="background:${p.android?.statusBarColor || '#090B12'}">
      <span>9:41</span>
      <span><i class="fa-solid fa-signal"></i> <i class="fa-solid fa-wifi"></i> <i class="fa-solid fa-battery-full"></i></span>
    </div>
    <div class="device-content" style="background:${p.background?.color || '#090B12'};display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;padding:16px;text-align:center">
      Your website content appears here<br/><span class="text-xs">Upload HTML to see real preview</span>
    </div>
    <div class="device-navbar" style="background:${p.android?.navigationBarColor || '#090B12'}">
      <i class="fa-solid fa-square"></i>
      <i class="fa-solid fa-circle"></i>
      <i class="fa-solid fa-caret-left"></i>
    </div>`;
}

function bindCustomize() {
  $$('.preview-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.previewMode = btn.dataset.mode;
      render();
    });
  });
  $('#btn-save-project')?.addEventListener('click', async () => {
    try {
      const body = {
        name: $('#edit-name').value,
        packageName: $('#edit-pkg').value,
        versionName: $('#edit-verName').value,
        versionCode: parseInt($('#edit-verCode').value, 10)
      };
      const data = await api(`/projects/${state.currentProject.id}`, { method: 'PUT', body });
      state.currentProject = data.project;
      await loadProjects();
      toast('Saved', 'success');
      render();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ---------- Build ----------
function renderBuild() {
  const p = state.currentProject;
  if (!p) return `<div class="card"><div class="empty-state"><h3>Select a project first</h3><button class="btn btn-primary mt-16" onclick="setView('projects')">My Projects</button></div></div>`;

  return `
    <div class="card mb-24">
      <h2 class="card-title mb-8">${escapeHtml(p.name)}</h2>
      <p class="text-sm font-mono text-muted">${escapeHtml(p.packageName)}</p>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h3 class="card-title mb-16"><i class="fa-solid fa-bug" style="color:var(--warning)"></i> Debug APK</h3>
        <p class="text-sm text-muted mb-16">Fast build for testing. Signed with debug keystore. Installable on devices with USB debugging or by allowing unknown sources.</p>
        <button class="btn btn-primary w-full" id="btn-build-debug"><i class="fa-solid fa-hammer"></i> Build Debug APK</button>
      </div>
      <div class="card">
        <h3 class="card-title mb-16"><i class="fa-solid fa-shield-halved" style="color:var(--success)"></i> Release APK</h3>
        <p class="text-sm text-muted mb-16">Production-ready build. Requires a signing keystore for Play Store distribution. Configure keystore in advanced settings.</p>
        <button class="btn btn-secondary w-full" id="btn-build-release"><i class="fa-solid fa-rocket"></i> Build Release APK</button>
      </div>
    </div>

    <div class="card mt-24">
      <h3 class="section-title">Requirements</h3>
      <ul class="text-sm text-muted" style="padding-left:18px;line-height:1.8">
        <li>Android SDK installed on the build server (<code>ANDROID_HOME</code>)</li>
        <li>Java 17+ available</li>
        <li>HTML entry file uploaded for this project</li>
        <li>Network access for first-time Capacitor dependency download</li>
      </ul>
      <p class="text-xs text-muted mt-16">First build may take several minutes while dependencies are resolved. Subsequent builds are faster.</p>
    </div>
  `;
}

function bindBuild() {
  $('#btn-build-debug')?.addEventListener('click', () => startBuild('debug'));
  $('#btn-build-release')?.addEventListener('click', () => startBuild('release'));
}

async function startBuild(type) {
  if (!state.currentProject) return;
  try {
    toast(`Starting ${type} build…`, 'info');
    const data = await api('/builds', {
      method: 'POST',
      body: { projectId: state.currentProject.id, type }
    });
    state.buildProgress = { buildId: data.build.id, status: 'queued' };
    setView('build-progress');
    // Poll + WS
    pollBuild(data.build.id);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function pollBuild(buildId) {
  try {
    const data = await api(`/builds/${buildId}`);
    state.buildProgress = { ...state.buildProgress, ...data.build, buildId };
    if (state.view === 'build-progress') render();
    if (data.build.status === 'running' || data.build.status === 'queued') {
      setTimeout(() => pollBuild(buildId), 2000);
    } else if (data.build.status === 'success') {
      toast('APK built successfully!', 'success');
      await loadBuilds();
    } else if (data.build.status === 'failed') {
      toast('Build failed: ' + (data.build.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    setTimeout(() => pollBuild(buildId), 3000);
  }
}

function renderBuildProgressView() {
  const b = state.buildProgress || {};
  const stages = [
    'prepare', 'validate', 'configure', 'assets', 'resources',
    'android-config', 'gradle', 'signing', 'verify', 'done'
  ];
  const stageLabels = {
    prepare: 'Preparing project',
    validate: 'Validating files',
    configure: 'Configuring Android project',
    assets: 'Copying website assets',
    resources: 'Generating icons & splash',
    'android-config': 'Applying Android config',
    gradle: 'Running Gradle',
    signing: 'Signing APK',
    verify: 'Verifying APK',
    done: 'Build completed'
  };

  const currentStages = b.stages || [];
  const status = b.status || 'queued';

  return `
    <div class="card">
      <div class="flex justify-between items-center mb-16">
        <h2 class="card-title">Build Progress</h2>
        <span class="badge badge-${status === 'success' ? 'success' : status === 'failed' ? 'error' : 'info'}">${status}</span>
      </div>
      <p class="text-sm text-muted mb-16">Build ID: <code class="font-mono">${b.buildId || b.id || '—'}</code></p>

      <div class="build-stages">
        ${stages.map(name => {
          const s = currentStages.find(x => x.name === name);
          let cls = '';
          let icon = 'fa-circle';
          if (s?.status === 'done') { cls = 'done'; icon = 'fa-check'; }
          else if (s?.status === 'running') { cls = 'running'; icon = 'fa-spinner fa-spin'; }
          else if (status === 'failed' && s) { cls = 'error'; icon = 'fa-xmark'; }
          return `
            <div class="build-stage ${cls}">
              <div class="icon"><i class="fa-solid ${icon}"></i></div>
              <div>${stageLabels[name] || name}</div>
            </div>`;
        }).join('')}
      </div>

      <div class="build-logs" id="build-logs">
        ${(b.logs || []).slice(-40).map(l => `
          <div class="log-line ${l.message?.toLowerCase().includes('error') || l.message?.toLowerCase().includes('fail') ? 'log-error' : l.message?.toLowerCase().includes('success') || l.message?.toLowerCase().includes('completed') ? 'log-success' : ''}">${escapeHtml(l.message)}</div>
        `).join('') || '<div class="log-line">Waiting for logs…</div>'}
      </div>

      ${status === 'success' ? `
        <div class="mt-24 flex gap-12" style="flex-wrap:wrap">
          <a class="btn btn-primary btn-lg" href="${API}/api/builds/${b.id || b.buildId}/download"><i class="fa-solid fa-download"></i> Download APK</a>
          <button class="btn btn-secondary" onclick="setView('history')">Build History</button>
          <button class="btn btn-ghost" onclick="setView('build')">Rebuild</button>
        </div>
      ` : ''}
      ${status === 'failed' ? `
        <div class="mt-24">
          <p class="text-sm" style="color:var(--danger)">${escapeHtml(b.error || 'Build failed')}</p>
          <button class="btn btn-secondary mt-16" onclick="setView('build')">Try again</button>
        </div>
      ` : ''}
    </div>
  `;
}

function renderBuildProgress(buildId) {
  // Re-render if on progress view
  if (state.view === 'build-progress') render();
}

// ---------- History ----------
function renderHistory() {
  const list = state.builds.slice(0, 50);
  return `
    <div class="card">
      <h2 class="card-title mb-16">Build History</h2>
      ${list.length === 0 ? `
        <div class="empty-state"><i class="fa-solid fa-clock-rotate-left"></i><h3>No builds yet</h3></div>
      ` : `
        <div class="grid gap-12">
          ${list.map(b => {
            const proj = state.projects.find(p => p.id === b.projectId);
            return `
              <div class="project-card" style="cursor:default">
                <div class="project-icon" style="background:rgba(99,102,241,0.2)"><i class="fa-solid fa-cube"></i></div>
                <div class="project-info">
                  <div class="project-name">${escapeHtml(proj?.name || 'Unknown project')}</div>
                  <div class="project-pkg">${b.type || 'debug'} · ${formatDate(b.startedAt)}</div>
                  <div class="project-meta">
                    <span class="badge badge-${b.status === 'success' ? 'success' : b.status === 'failed' ? 'error' : 'info'}">${b.status}</span>
                    ${b.apkSize ? `<span>${formatBytes(b.apkSize)}</span>` : ''}
                    ${b.durationMs ? `<span>${(b.durationMs/1000).toFixed(0)}s</span>` : ''}
                  </div>
                </div>
                <div class="project-actions">
                  ${b.status === 'success' ? `<a class="btn btn-primary btn-sm" href="${API}/api/builds/${b.id}/download"><i class="fa-solid fa-download"></i></a>` : ''}
                </div>
              </div>`;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

// ---------- Settings ----------
function renderSettings() {
  return `
    <div class="card mb-16">
      <h2 class="card-title mb-16">Settings</h2>
      <div class="form-group">
        <label class="form-label">API Base URL</label>
        <input class="form-input font-mono" value="${API}" readonly />
        <div class="form-hint">Backend must be running for builds to work.</div>
      </div>
      <div class="form-group">
        <label class="form-label">Server status</label>
        <div class="status-pill ${state.serverOnline ? 'online' : 'offline'}" style="display:inline-flex">
          <span class="dot"></span>
          <span>${state.serverOnline ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>
    </div>
    <div class="card mb-16">
      <h3 class="section-title">About</h3>
      <p class="text-sm text-muted">HTML to APK Converter Studio v1.0.0</p>
      <p class="text-sm text-muted mt-8">Professional tool for packaging HTML/CSS/JS websites as native Android applications using Capacitor and the Android Gradle build system.</p>
    </div>
    <div class="card">
      <h3 class="section-title">Setup checklist</h3>
      <ul class="text-sm text-muted" style="padding-left:18px;line-height:1.9">
        <li>Install Node.js 18+</li>
        <li>Install Java 17 (Temurin recommended)</li>
        <li>Install Android SDK & set ANDROID_HOME</li>
        <li>Accept Android licenses: <code>sdkmanager --licenses</code></li>
        <li>Run <code>cd backend && npm install && npm start</code></li>
        <li>Open the frontend in a browser</li>
      </ul>
    </div>
  `;
}

// ---------- Data loading ----------
async function loadProjects() {
  try {
    const data = await api('/projects');
    state.projects = data.projects || [];
  } catch (e) {
    console.warn('loadProjects', e);
  }
}

async function loadBuilds() {
  try {
    const data = await api('/builds');
    state.builds = data.builds || [];
  } catch (e) {
    console.warn('loadBuilds', e);
  }
}

async function checkHealth() {
  try {
    const res = await fetch(`${API}/api/health`);
    state.serverOnline = res.ok;
  } catch {
    state.serverOnline = false;
  }
  const pill = $('#server-status');
  if (pill) {
    pill.className = `status-pill ${state.serverOnline ? 'online' : 'offline'}`;
    pill.innerHTML = `<span class="dot"></span><span>${state.serverOnline ? 'Server online' : 'Server offline'}</span>`;
  }
}

// ---------- Init ----------
function init() {
  // Nav clicks
  $$('.nav-item, .bottom-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const view = el.dataset.view;
      if (view) setView(view);
    });
  });

  $('#menu-toggle')?.addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  $('#btn-refresh')?.addEventListener('click', async () => {
    await Promise.all([loadProjects(), loadBuilds(), checkHealth()]);
    render();
    toast('Refreshed', 'success');
  });

  connectWS();
  checkHealth();
  loadProjects().then(() => loadBuilds()).then(() => {
    setView('dashboard');
  });

  setInterval(checkHealth, 15000);
}

document.addEventListener('DOMContentLoaded', init);

// Expose for inline handlers
window.setView = setView;
window.openProject = openProject;
window.deleteProject = deleteProject;
