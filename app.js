const DB_NAME = 'bodybuilding-tracker-db';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const STATE_KEY = 'app-state';
const GROUP_OPTIONS = ['胸', '背', '肩', '二頭', '三頭', '腿前', '腿後', '臀', '小腿', '核心', '有氧', '其他'];
const TEMPLATE_TYPES = [
  { value: 'push', label: '推' },
  { value: 'pull', label: '拉' },
  { value: 'legs', label: '腿' },
  { value: 'push-pull', label: '推拉' },
  { value: 'custom', label: '自訂' },
];

const seedTemplates = () => ([
  {
    id: uid(),
    name: '上肢A（主推）',
    type: 'push',
    note: '一週三練版本。前兩動作各 3 組休 180 秒，後兩動作各 2 組休 150 秒。',
    enabled: true,
    items: [
      { id: uid(), name: '啞鈴肩推', group: '肩', sets: 3, reps: '6-10', rest: 180, note: '前段主力動作' },
      { id: uid(), name: '槓鈴划船', group: '背', sets: 3, reps: '6-10', rest: 180, note: '前段主力動作' },
      { id: uid(), name: '上斜啞鈴臥推', group: '胸', sets: 2, reps: '8-12', rest: 150, note: '後段輔助動作' },
      { id: uid(), name: '引體向上', group: '背', sets: 2, reps: '8-12', rest: 150, note: '後段輔助動作' },
    ],
  },
  {
    id: uid(),
    name: '上肢B（主拉）',
    type: 'pull',
    note: '一週三練版本。前兩動作各 3 組休 180 秒，後兩動作各 2 組休 150 秒。',
    enabled: true,
    items: [
      { id: uid(), name: '負重引體向上', group: '背', sets: 3, reps: '4-8', rest: 180, note: '前段主力動作' },
      { id: uid(), name: '倒立伏地挺身', group: '肩', sets: 3, reps: '4-8', rest: 180, note: '前段主力動作' },
      { id: uid(), name: '反手引體向上', group: '背', sets: 2, reps: '6-10', rest: 150, note: '後段輔助動作' },
      { id: uid(), name: '負重伏地挺身', group: '胸', sets: 2, reps: '8-12', rest: 150, note: '後段輔助動作' },
    ],
  },
  {
    id: uid(),
    name: '腿日',
    type: 'legs',
    note: '一週三練版本。前兩動作各 3 組休 180 秒，後兩動作各 2 組休 150 秒。',
    enabled: true,
    items: [
      { id: uid(), name: '頸前深蹲', group: '腿前', sets: 3, reps: '4-8', rest: 180, note: '前段主力動作' },
      { id: uid(), name: '分腿蹲（雙腳互換）', group: '腿前', sets: 3, reps: '8-12', rest: 180, note: '前段主力動作' },
      { id: uid(), name: '器械股四頭', group: '腿前', sets: 2, reps: '10-15', rest: 150, note: '後段輔助動作' },
      { id: uid(), name: '器械股二頭', group: '腿後', sets: 2, reps: '10-15', rest: 150, note: '後段輔助動作' },
    ],
  },
]);

const DEFAULT_STATE = {
  version: 3,
  templates: seedTemplates(),
  sessions: [],
  activeSession: null,
  settings: {
    unit: 'kg',
    showWarmup: true,
  },
};

let state = null;
let currentView = 'home';
let deferredInstallPrompt = null;
let persistTimer = null;

const els = {
  home: document.getElementById('view-home'),
  templates: document.getElementById('view-templates'),
  training: document.getElementById('view-training'),
  history: document.getElementById('view-history'),
  stats: document.getElementById('view-stats'),
  settings: document.getElementById('view-settings'),
  installBtn: document.getElementById('installBtn'),
  templateDialog: document.getElementById('templateDialog'),
  exerciseDialog: document.getElementById('exerciseDialog'),
  confirmDialog: document.getElementById('confirmDialog'),
};

init();

async function init() {
  registerServiceWorker();
  setupInstallPrompt();
  state = await loadState();
  wireGlobalEvents();
  renderAll();
  setInterval(() => {
    if (state.activeSession && currentView === 'training') {
      renderTraining();
    }
  }, 30000);
}

function wireGlobalEvents() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  els.installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installBtn.classList.add('hidden');
  });

  els.home.addEventListener('click', onHomeClick);
  els.training.addEventListener('click', onTrainingClick);
  els.training.addEventListener('input', onTrainingInput);
  els.training.addEventListener('change', onTrainingInput);
  els.templates.addEventListener('click', onTemplatesClick);
  els.history.addEventListener('click', onHistoryClick);
  els.settings.addEventListener('click', onSettingsClick);
  els.settings.addEventListener('change', onSettingsChange);
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelector(`#view-${view}`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
  renderView(view);
}

function renderAll() {
  renderHome();
  renderTemplates();
  renderTraining();
  renderHistory();
  renderStats();
  renderSettings();
}

function renderView(view) {
  if (view === 'home') renderHome();
  if (view === 'templates') renderTemplates();
  if (view === 'training') renderTraining();
  if (view === 'history') renderHistory();
  if (view === 'stats') renderStats();
  if (view === 'settings') renderSettings();
}

function renderHome() {
  const activeCard = state.activeSession ? `
    <div class="card accent">
      <div class="row-between gap-12 wrap">
        <div>
          <div class="eyebrow">進行中</div>
          <h2>${escapeHtml(state.activeSession.templateName || '未命名訓練')}</h2>
          <div class="muted">開始時間：${formatDateTime(state.activeSession.startedAt)}</div>
          <div class="muted">已經進行：${formatDuration(state.activeSession.startedAt, Date.now())}</div>
        </div>
        <button class="primary touch-btn" data-action="resume-active">繼續記錄</button>
      </div>
    </div>
  ` : '';

  const weekly = calcPeriodSummary(7);
  const monthly = calcPeriodSummary(30);
  const quickTemplates = sortTemplatesForQuickStart(state.templates.filter((t) => t.enabled));
  const quickStart = quickTemplates
    .map((t, index) => {
      const recommended = index === 0;
      return `
        <button class="template-start-card ${recommended ? 'recommended' : ''}" data-action="start-template" data-template-id="${t.id}">
          <div class="row gap-8 wrap">
            ${recommended ? '<span class="chip success">目前最適合</span>' : ''}
            <span class="chip">${templateTypeLabel(t.type)}</span>
          </div>
          <strong>${escapeHtml(t.name)}</strong>
          <small>${escapeHtml(t.note || `${t.items.length} 個動作`)}</small>
        </button>
      `;
    })
    .join('');

  const recent = [...state.sessions]
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, 5)
    .map((session) => `
      <div class="list-item">
        <div>
          <strong>${escapeHtml(session.templateName || '自由訓練')}</strong>
          <div class="muted">${formatDateTime(session.completedAt)}</div>
        </div>
        <div class="right-align">
          <div>${sessionSummaryText(session)}</div>
          <div class="muted">${formatDuration(session.startedAt, session.completedAt)}</div>
        </div>
      </div>
    `)
    .join('') || '<div class="empty">還沒有歷史紀錄，先從今天第一堂開始。</div>';

  els.home.innerHTML = `
    ${activeCard}
    <div class="grid grid-2 summary-grid">
      <div class="card compact">
        <div class="eyebrow">最近 7 天</div>
        <div class="big-number">${weekly.sessions}</div>
        <div class="muted">訓練次數</div>
        <div class="mini-stat">正式組數 ${weekly.workSets}</div>
        <div class="mini-stat">總訓練量 ${formatNumber(weekly.volume)} ${state.settings.unit}</div>
      </div>
      <div class="card compact">
        <div class="eyebrow">最近 30 天</div>
        <div class="big-number">${monthly.sessions}</div>
        <div class="muted">訓練次數</div>
        <div class="mini-stat">正式組數 ${monthly.workSets}</div>
        <div class="mini-stat">總訓練量 ${formatNumber(monthly.volume)} ${state.settings.unit}</div>
      </div>
    </div>

    <div class="card accent-subtle">
      <div class="row-between gap-12 wrap">
        <div>
          <div class="eyebrow">快速開始</div>
          <h2>已改成你目前的一週三練模板</h2>
          <div class="muted">首頁與訓練頁會優先顯示上肢A（主推）、上肢B（主拉）、腿日。</div>
        </div>
        <button class="ghost touch-btn" data-action="go-templates">管理模板</button>
      </div>
      <div class="template-start-grid top-gap">
        ${quickStart}
      </div>
    </div>

    <div class="card">
      <div class="eyebrow">最近紀錄</div>
      <h2>上次訓練回顧</h2>
      <div class="stack-list">
        ${recent}
      </div>
    </div>
  `;
}

function renderTemplates() {
  const cards = [...state.templates]
    .sort((a, b) => Number(b.enabled) - Number(a.enabled))
    .map((template) => {
      const rows = template.items.map((item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.group)}</td>
          <td>${item.sets}</td>
          <td>${escapeHtml(item.reps)}</td>
          <td>${item.rest || '-'}</td>
        </tr>
      `).join('');
      return `
        <div class="card">
          <div class="row-between gap-12 wrap">
            <div>
              <div class="row gap-8 wrap">
                <span class="chip">${templateTypeLabel(template.type)}</span>
                ${template.enabled ? '<span class="chip success">啟用中</span>' : '<span class="chip muted-chip">停用</span>'}
              </div>
              <h2>${escapeHtml(template.name)}</h2>
              <div class="muted">${escapeHtml(template.note || '未填備註')}</div>
            </div>
            <div class="row gap-8 wrap">
              <button class="primary" data-action="start-template" data-template-id="${template.id}">開始</button>
              <button class="ghost" data-action="edit-template" data-template-id="${template.id}">編輯</button>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>動作</th>
                  <th>肌群</th>
                  <th>組數</th>
                  <th>目標次數</th>
                  <th>休息秒數</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');

  els.templates.innerHTML = `
    <div class="card accent-subtle">
      <div class="row-between gap-12 wrap">
        <div>
          <div class="eyebrow">模板設計</div>
          <h2>上肢A、上肢B、腿</h2>
          <div class="muted">已改成你目前的一週三練邏輯，前兩動作各 3 組休 180 秒，後兩動作各 2 組休 150 秒。</div>
        </div>
        <button class="primary" data-action="create-template">新增模板</button>
      </div>
    </div>
    ${cards}
  `;
}

function renderTraining() {
  if (!state.activeSession) {
    const options = sortTemplatesForQuickStart(state.templates.filter((t) => t.enabled)).map((t, index) => `
      <button class="template-start-card ${index === 0 ? 'recommended' : ''}" data-action="start-template" data-template-id="${t.id}">
        <div class="row gap-8 wrap">
          ${index === 0 ? '<span class="chip success">目前排第一套</span>' : ''}
          <span class="chip">${templateTypeLabel(t.type)}</span>
        </div>
        <strong>${escapeHtml(t.name)}</strong>
        <small>${t.items.length} 個動作</small>
      </button>
    `).join('');

    els.training.innerHTML = `
      <div class="card">
        <div class="eyebrow">尚未開始</div>
        <h2>開始今天的訓練</h2>
        <div class="muted">已依照你目前的一週三練邏輯排序。開始後若有歷史紀錄，會自動帶入上次正式組的重量、次數與 RPE。</div>
        <div class="template-start-grid top-gap">
          ${options}
        </div>
      </div>
    `;
    return;
  }

  const session = state.activeSession;
  const totalVolume = calcSessionVolume(session);
  const workSets = calcSessionWorkSets(session);
  const bodyweight = session.bodyweight ?? '';

  const itemCards = session.items.map((item, idx) => {
    const lastRecord = getLatestCompletedExerciseRecord(item.name);
    const lastRecordLine = lastRecord
      ? `上次正式組：${escapeHtml(lastRecord.workSetText)} ｜ ${formatDateTime(lastRecord.completedAt)}`
      : '尚無上次正式組紀錄';

    const setCards = item.sets.map((set, setIndex) => `
      <div class="set-entry ${set.done ? 'is-done' : ''}">
        <div class="set-entry-head">
          <div class="row gap-8 wrap">
            <span class="chip subtle">第 ${setIndex + 1} 組</span>
            ${set.done ? '<span class="chip success">已完成</span>' : '<span class="chip muted-chip">未完成</span>'}
            ${set.warmup ? '<span class="chip subtle">熱身組</span>' : '<span class="chip">正式組</span>'}
          </div>
          <button class="danger-text small" data-action="delete-set" data-item-id="${item.id}" data-set-id="${set.id}">刪除此組</button>
        </div>
        <div class="set-input-grid">
          <label class="field-block small-field">
            <span>重量（${state.settings.unit}）</span>
            <input class="touch-input" type="number" step="0.5" inputmode="decimal" data-field="weight" data-item-id="${item.id}" data-set-id="${set.id}" value="${set.weight ?? ''}" placeholder="0" />
          </label>
          <label class="field-block small-field">
            <span>次數</span>
            <input class="touch-input" type="number" step="1" inputmode="numeric" data-field="reps" data-item-id="${item.id}" data-set-id="${set.id}" value="${set.reps ?? ''}" placeholder="0" />
          </label>
          <label class="field-block small-field">
            <span>RPE</span>
            <input class="touch-input" type="number" step="0.5" inputmode="decimal" data-field="rpe" data-item-id="${item.id}" data-set-id="${set.id}" value="${set.rpe ?? ''}" placeholder="7" />
          </label>
        </div>
        <div class="set-toggle-row">
          <button class="${set.done ? 'primary' : 'ghost'} touch-btn small" data-action="toggle-set-done" data-item-id="${item.id}" data-set-id="${set.id}">${set.done ? '已完成' : '標記完成'}</button>
          <button class="${set.warmup ? 'ghost warmup-active' : 'ghost'} touch-btn small" data-action="toggle-set-warmup" data-item-id="${item.id}" data-set-id="${set.id}">${set.warmup ? '目前熱身組' : '切成熱身組'}</button>
        </div>
      </div>
    `).join('');

    return `
      <div class="card">
        <div class="row-between gap-12 wrap">
          <div>
            <div class="row gap-8 wrap">
              <span class="chip">${idx + 1}</span>
              <span class="chip subtle">${escapeHtml(item.group)}</span>
              ${item.autoFilledFromHistory ? '<span class="chip success">已自動帶入上次重量</span>' : ''}
            </div>
            <h2>${escapeHtml(item.name)}</h2>
            <div class="muted">目標：${item.targetSets} 組 / ${escapeHtml(item.targetReps)} 次 / 休息 ${item.rest || '-'} 秒</div>
            <div class="last-record-line">${lastRecordLine}</div>
            ${item.note ? `<div class="muted">備註：${escapeHtml(item.note)}</div>` : ''}
          </div>
          <div class="right-align">
            <div class="mini-stat">正式組 ${item.sets.filter((s) => s.done && !s.warmup).length}</div>
            <div class="mini-stat">訓練量 ${formatNumber(calcItemVolume(item))}</div>
          </div>
        </div>
        <div class="set-entry-list top-gap">
          ${setCards}
        </div>
        <div class="row gap-8 wrap top-gap item-action-row">
          <button class="ghost touch-btn" data-action="add-set" data-item-id="${item.id}">複製上一組</button>
          <button class="ghost touch-btn" data-action="add-empty-set" data-item-id="${item.id}">新增空白組</button>
          <button class="ghost touch-btn" data-action="add-set-from-last" data-item-id="${item.id}">套用上次正式組</button>
          <button class="ghost touch-btn" data-action="move-item-up" data-item-id="${item.id}">上移</button>
          <button class="ghost touch-btn" data-action="move-item-down" data-item-id="${item.id}">下移</button>
          <button class="danger-text touch-btn" data-action="remove-session-item" data-item-id="${item.id}">移除此動作</button>
        </div>
      </div>
    `;
  }).join('');

  els.training.innerHTML = `
    <div class="card accent training-hero">
      <div class="row-between gap-12 wrap">
        <div>
          <div class="eyebrow">訓練中</div>
          <h2>${escapeHtml(session.templateName || '未命名訓練')}</h2>
          <div class="muted">開始：${formatDateTime(session.startedAt)} ｜ 已進行：${formatDuration(session.startedAt, Date.now())}</div>
        </div>
        <div class="row gap-8 wrap training-main-actions">
          <button class="primary touch-btn" data-action="finish-session">完成訓練</button>
          <button class="ghost touch-btn" data-action="discard-session">放棄本次</button>
        </div>
      </div>
      <div class="grid grid-3 top-gap">
        <label class="field-block">
          <span>當前體重</span>
          <input id="sessionBodyweight" class="touch-input" type="number" step="0.1" inputmode="decimal" value="${bodyweight}" placeholder="選填" />
        </label>
        <label class="field-block grid-span-2">
          <span>當天狀況備註</span>
          <input id="sessionNotes" class="touch-input" type="text" value="${escapeAttr(session.notes || '')}" placeholder="例如：臥推狀態很好、肩膀有點緊" />
        </label>
      </div>
      <div class="row gap-8 wrap top-gap">
        <span class="mini-stat">正式組數 ${workSets}</span>
        <span class="mini-stat">總訓練量 ${formatNumber(totalVolume)} ${state.settings.unit}</span>
        <span class="mini-stat">動作數 ${session.items.length}</span>
      </div>
      <div class="row gap-8 wrap top-gap item-action-row">
        <button class="ghost touch-btn" data-action="add-session-item">新增動作</button>
        <button class="ghost touch-btn" data-action="copy-template-again">再補一個模板動作</button>
      </div>
    </div>
    ${itemCards || '<div class="card empty">這次訓練還沒有動作，先新增一個吧。</div>'}
  `;
}

function renderHistory() {
  const sessions = [...state.sessions].sort((a, b) => b.completedAt - a.completedAt);
  if (!sessions.length) {
    els.history.innerHTML = `
      <div class="card empty">
        <div class="eyebrow">歷史紀錄</div>
        <h2>目前還沒有資料</h2>
        <div class="muted">先開始一堂課，完成後就會出現在這裡。</div>
      </div>
    `;
    return;
  }

  const historyHtml = sessions.map((session) => {
    const itemRows = session.items.map((item) => {
      const setDesc = item.sets
        .filter((set) => set.done)
        .map((set, idx) => `${idx + 1}. ${set.weight || 0}×${set.reps || 0}${set.warmup ? '（熱身）' : ''}${set.rpe ? ` / RPE ${set.rpe}` : ''}`)
        .join('<br>') || '無完成組';
      return `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.group)}</td>
          <td>${setDesc}</td>
          <td>${formatNumber(calcItemVolume(item))}</td>
        </tr>
      `;
    }).join('');

    return `
      <details class="card history-card">
        <summary>
          <div>
            <strong>${escapeHtml(session.templateName || '自由訓練')}</strong>
            <div class="muted">${formatDateTime(session.completedAt)}</div>
          </div>
          <div class="right-align">
            <div>${sessionSummaryText(session)}</div>
            <div class="muted">${formatDuration(session.startedAt, session.completedAt)}</div>
          </div>
        </summary>
        <div class="grid grid-3 top-gap compact-grid">
          <div class="mini-stat">體重 ${session.bodyweight || '-'} ${session.bodyweight ? 'kg' : ''}</div>
          <div class="mini-stat">正式組數 ${calcSessionWorkSets(session)}</div>
          <div class="mini-stat">總訓練量 ${formatNumber(calcSessionVolume(session))}</div>
        </div>
        ${session.notes ? `<div class="note-box top-gap">${escapeHtml(session.notes)}</div>` : ''}
        <div class="table-wrap top-gap">
          <table>
            <thead>
              <tr>
                <th>動作</th>
                <th>肌群</th>
                <th>完成組</th>
                <th>訓練量</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>
        </div>
        <div class="row gap-8 wrap top-gap">
          <button class="ghost" data-action="clone-session-template" data-session-id="${session.id}">複製成新訓練</button>
          <button class="danger-text" data-action="delete-session" data-session-id="${session.id}">刪除紀錄</button>
        </div>
      </details>
    `;
  }).join('');

  els.history.innerHTML = historyHtml;
}

function renderStats() {
  const last7 = calcPeriodSummary(7);
  const last30 = calcPeriodSummary(30);
  const group7 = buildGroupStats(7);
  const group30 = buildGroupStats(30);
  const exerciseStats = buildExerciseStats();
  const templateStats = buildTemplateStats(30);

  const groupRows7 = group7.map((row) => `<tr><td>${escapeHtml(row.group)}</td><td>${row.sets}</td><td>${formatNumber(row.volume)}</td></tr>`).join('') || '<tr><td colspan="3">尚無資料</td></tr>';
  const groupRows30 = group30.map((row) => `<tr><td>${escapeHtml(row.group)}</td><td>${row.sets}</td><td>${formatNumber(row.volume)}</td></tr>`).join('') || '<tr><td colspan="3">尚無資料</td></tr>';
  const exerciseRows = exerciseStats.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.group)}</td><td>${formatNumber(row.maxWeight)}</td><td>${formatNumber(row.bestE1RM)}</td><td>${formatNumber(row.volume)}</td><td>${row.workSets}</td></tr>`).join('') || '<tr><td colspan="6">尚無資料</td></tr>';
  const templateRows = templateStats.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${row.sessions}</td><td>${row.workSets}</td><td>${formatNumber(row.volume)}</td></tr>`).join('') || '<tr><td colspan="4">尚無資料</td></tr>';

  els.stats.innerHTML = `
    <div class="grid grid-2 summary-grid">
      <div class="card compact">
        <div class="eyebrow">最近 7 天</div>
        <div class="big-number">${last7.sessions}</div>
        <div class="muted">訓練次數</div>
        <div class="mini-stat">正式組 ${last7.workSets}</div>
        <div class="mini-stat">總訓練量 ${formatNumber(last7.volume)}</div>
      </div>
      <div class="card compact">
        <div class="eyebrow">最近 30 天</div>
        <div class="big-number">${last30.sessions}</div>
        <div class="muted">訓練次數</div>
        <div class="mini-stat">正式組 ${last30.workSets}</div>
        <div class="mini-stat">總訓練量 ${formatNumber(last30.volume)}</div>
      </div>
    </div>

    <div class="card">
      <div class="eyebrow">模板統計</div>
      <h2>最近 30 天模板完成度</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>模板</th><th>次數</th><th>正式組數</th><th>總訓練量</th></tr></thead>
          <tbody>${templateRows}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="eyebrow">肌群分配</div>
      <h2>最近 7 天</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>肌群</th><th>正式組數</th><th>總訓練量</th></tr></thead>
          <tbody>${groupRows7}</tbody>
        </table>
      </div>
      <h2 class="top-gap">最近 30 天</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>肌群</th><th>正式組數</th><th>總訓練量</th></tr></thead>
          <tbody>${groupRows30}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="eyebrow">動作表現</div>
      <h2>所有動作完整統計</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>動作</th>
              <th>肌群</th>
              <th>最大重量</th>
              <th>最佳估算 1RM</th>
              <th>累計訓練量</th>
              <th>正式組數</th>
            </tr>
          </thead>
          <tbody>${exerciseRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSettings() {
  const totalSessions = state.sessions.length;
  const totalTemplates = state.templates.length;
  const active = state.activeSession ? '有進行中的訓練' : '目前沒有進行中的訓練';

  els.settings.innerHTML = `
    <div class="card">
      <div class="eyebrow">資料管理</div>
      <h2>備份與還原</h2>
      <div class="stack-list top-gap">
        <div class="list-item">
          <div>
            <strong>目前資料量</strong>
            <div class="muted">模板 ${totalTemplates} 套 ｜ 歷史紀錄 ${totalSessions} 筆 ｜ ${active}</div>
          </div>
        </div>
        <div class="row gap-8 wrap">
          <button class="primary" data-action="export-json">匯出 JSON 備份</button>
          <label class="ghost file-label">
            匯入 JSON 備份
            <input id="importJsonInput" type="file" accept="application/json" hidden />
          </label>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="eyebrow">顯示設定</div>
      <h2>基本偏好</h2>
      <div class="grid grid-2 top-gap">
        <label class="field-block">
          <span>重量單位</span>
          <select id="unitSelect">
            <option value="kg" ${state.settings.unit === 'kg' ? 'selected' : ''}>kg</option>
            <option value="lb" ${state.settings.unit === 'lb' ? 'selected' : ''}>lb</option>
          </select>
        </label>
        <label class="field-check top-adjust">
          <input id="warmupToggle" type="checkbox" ${state.settings.showWarmup ? 'checked' : ''} />
          <span>預設顯示熱身組欄位</span>
        </label>
      </div>
    </div>

    <div class="card danger-card">
      <div class="eyebrow">重置資料</div>
      <h2>小心操作</h2>
      <div class="muted">可重新載入預設推、拉、腿、推拉模板，或清空全部資料。</div>
      <div class="row gap-8 wrap top-gap">
        <button class="ghost" data-action="reload-seed">重新載入預設模板</button>
        <button class="danger" data-action="wipe-all">清空全部資料</button>
      </div>
    </div>
  `;
}


async function onHomeClick(event) {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const { action, templateId } = btn.dataset;
  if (action === 'start-template') {
    await startTrainingFromTemplate(templateId);
  }
  if (action === 'resume-active') {
    switchView('training');
  }
  if (action === 'go-templates') {
    switchView('templates');
  }
}

async function onTemplatesClick(event) {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const { action, templateId } = btn.dataset;
  if (action === 'create-template') {
    openTemplateDialog();
  }
  if (action === 'edit-template') {
    openTemplateDialog(templateId);
  }
  if (action === 'start-template') {
    await startTrainingFromTemplate(templateId);
  }
}

async function onTrainingClick(event) {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const { action, templateId, itemId } = btn.dataset;

  if (action === 'start-template') {
    await startTrainingFromTemplate(templateId);
  }
  if (action === 'resume-active') {
    switchView('training');
  }
  if (action === 'finish-session') {
    await finishActiveSession();
  }
  if (action === 'discard-session') {
    await discardActiveSession();
  }
  if (action === 'add-set') {
    addSetToActiveItem(itemId, 'copy-current');
  }
  if (action === 'add-empty-set') {
    addSetToActiveItem(itemId, 'blank');
  }
  if (action === 'add-set-from-last') {
    addSetToActiveItem(itemId, 'history');
  }
  if (action === 'toggle-set-done') {
    toggleSetField(btn.dataset.itemId, btn.dataset.setId, 'done');
  }
  if (action === 'toggle-set-warmup') {
    toggleSetField(btn.dataset.itemId, btn.dataset.setId, 'warmup');
  }
  if (action === 'delete-set') {
    deleteSetFromItem(btn.dataset.itemId, btn.dataset.setId);
  }
  if (action === 'add-session-item') {
    openSessionItemDialog();
  }
  if (action === 'remove-session-item') {
    removeSessionItem(itemId);
  }
  if (action === 'move-item-up') {
    moveSessionItem(itemId, -1);
  }
  if (action === 'move-item-down') {
    moveSessionItem(itemId, 1);
  }
  if (action === 'copy-template-again') {
    openSessionItemDialog(true);
  }
}

async function onHistoryClick(event) {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const { action, sessionId } = btn.dataset;
  if (action === 'delete-session') {
    const ok = await confirmAction('要刪除這筆歷史紀錄嗎？此動作無法復原。');
    if (!ok) return;
    state.sessions = state.sessions.filter((s) => s.id !== sessionId);
    await saveAndRender('history');
  }
  if (action === 'clone-session-template') {
    await cloneSessionToActive(sessionId);
  }
}

async function onSettingsClick(event) {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const { action } = btn.dataset;
  if (action === 'export-json') {
    exportJsonBackup();
  }
  if (action === 'reload-seed') {
    const ok = await confirmAction('要重新載入預設模板嗎？目前既有模板會保留。');
    if (!ok) return;
    mergeSeedTemplates();
    await saveAndRender('templates');
  }
  if (action === 'wipe-all') {
    const ok = await confirmAction('要清空全部資料嗎？模板、歷史與進行中訓練都會刪除。');
    if (!ok) return;
    state = deepClone(DEFAULT_STATE);
    await persistState();
    renderAll();
    switchView('home');
  }
}

async function onSettingsChange(event) {
  if (event.target.id === 'importJsonInput') {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!imported.templates || !imported.sessions || !imported.settings) {
        alert('備份格式不正確。');
        return;
      }
      state = imported;
      await persistState();
      renderAll();
      alert('已成功匯入備份。');
    } catch (error) {
      console.error(error);
      alert('匯入失敗，請確認檔案格式。');
    } finally {
      event.target.value = '';
    }
  }

  if (event.target.id === 'unitSelect') {
    state.settings.unit = event.target.value;
    await saveAndRender('settings');
  }
  if (event.target.id === 'warmupToggle') {
    state.settings.showWarmup = event.target.checked;
    await saveAndRender('settings');
  }
}

function onTrainingInput(event) {
  if (!state.activeSession) return;
  const target = event.target;
  const shouldRefresh = event.type === 'change';
  if (target.id === 'sessionBodyweight') {
    state.activeSession.bodyweight = target.value;
    schedulePersist();
    if (shouldRefresh) renderView('training');
    return;
  }
  if (target.id === 'sessionNotes') {
    state.activeSession.notes = target.value;
    schedulePersist();
    return;
  }

  const itemId = target.dataset.itemId;
  const setId = target.dataset.setId;
  const field = target.dataset.field;
  if (!itemId || !setId || !field) return;

  const item = state.activeSession.items.find((i) => i.id === itemId);
  if (!item) return;
  const set = item.sets.find((s) => s.id === setId);
  if (!set) return;

  set[field] = target.type === 'checkbox' ? target.checked : target.value;
  schedulePersist();
  if (shouldRefresh && (field === 'weight' || field === 'reps' || field === 'done' || field === 'warmup')) {
    renderView('training');
  }
}

async function startTrainingFromTemplate(templateId) {
  const template = state.templates.find((t) => t.id === templateId);
  if (!template) return;

  if (state.activeSession) {
    const ok = await confirmAction('目前已有進行中的訓練，要直接覆蓋並開始新的嗎？');
    if (!ok) return;
  }

  state.activeSession = {
    id: uid(),
    templateId: template.id,
    templateName: template.name,
    templateType: template.type,
    startedAt: Date.now(),
    completedAt: null,
    status: 'active',
    bodyweight: '',
    notes: '',
    items: template.items.map((item) => {
      const prefills = buildPrefilledSetsForExercise(item.name, Number(item.sets) || 0);
      return {
        id: uid(),
        sourceTemplateItemId: item.id,
        name: item.name,
        group: item.group,
        targetSets: Number(item.sets) || 0,
        targetReps: item.reps || '',
        rest: Number(item.rest) || '',
        note: item.note || '',
        autoFilledFromHistory: prefills.autoFilled,
        sets: prefills.sets,
      };
    }),
  };

  await saveAndRender('training');
  switchView('training');
}

async function finishActiveSession() {
  if (!state.activeSession) return;
  const hasDoneSet = state.activeSession.items.some((item) => item.sets.some((set) => set.done));
  if (!hasDoneSet) {
    const ok = await confirmAction('目前沒有勾選完成組，仍要完成訓練嗎？');
    if (!ok) return;
  }

  const finalized = deepClone(state.activeSession);
  finalized.status = 'completed';
  finalized.completedAt = Date.now();
  state.sessions.push(finalized);
  state.activeSession = null;
  await saveAndRender('history');
  switchView('history');
}

async function discardActiveSession() {
  if (!state.activeSession) return;
  const ok = await confirmAction('要放棄這次尚未完成的訓練嗎？');
  if (!ok) return;
  state.activeSession = null;
  await saveAndRender('training');
  switchView('training');
}

function addSetToActiveItem(itemId, mode = 'copy-current') {
  const item = state.activeSession?.items.find((i) => i.id === itemId);
  if (!item) return;

  let newSet = makeNewSet();
  if (mode === 'copy-current') newSet = buildSetFromCurrentItem(item);
  if (mode === 'history') newSet = buildSetFromLastHistory(item.name);

  item.sets.push(newSet);
  schedulePersist();
  renderView('training');
}

function buildSetFromCurrentItem(item) {
  const prev = item.sets[item.sets.length - 1];
  if (!prev) return makeNewSet();
  return {
    ...makeNewSet(),
    weight: prev.weight || '',
    reps: prev.reps || '',
    rpe: prev.rpe || '',
    warmup: prev.warmup || false,
  };
}

function buildSetFromLastHistory(exerciseName) {
  const history = getLatestCompletedExerciseRecord(exerciseName);
  if (history?.lastDone) {
    return {
      ...makeNewSet(),
      weight: history.lastDone.weight || '',
      reps: history.lastDone.reps || '',
      rpe: history.lastDone.rpe || '',
      warmup: false,
    };
  }
  return makeNewSet();
}

function deleteSetFromItem(itemId, setId) {
  const item = state.activeSession?.items.find((i) => i.id === itemId);
  if (!item) return;
  item.sets = item.sets.filter((set) => set.id !== setId);
  schedulePersist();
  renderView('training');
}

async function removeSessionItem(itemId) {
  const ok = await confirmAction('要移除這個動作嗎？');
  if (!ok) return;
  state.activeSession.items = state.activeSession.items.filter((item) => item.id !== itemId);
  await saveAndRender('training');
}

function moveSessionItem(itemId, direction) {
  const items = state.activeSession?.items;
  if (!items) return;
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) return;
  const next = index + direction;
  if (next < 0 || next >= items.length) return;
  [items[index], items[next]] = [items[next], items[index]];
  schedulePersist();
  renderView('training');
}

async function cloneSessionToActive(sessionId) {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  if (state.activeSession) {
    const ok = await confirmAction('目前已有進行中的訓練，要直接覆蓋嗎？');
    if (!ok) return;
  }

  state.activeSession = {
    id: uid(),
    templateId: session.templateId || null,
    templateName: `${session.templateName || '自由訓練'}（複製）`,
    templateType: session.templateType || 'custom',
    startedAt: Date.now(),
    completedAt: null,
    status: 'active',
    bodyweight: '',
    notes: '',
    items: session.items.map((item) => ({
      id: uid(),
      sourceTemplateItemId: item.sourceTemplateItemId || null,
      name: item.name,
      group: item.group,
      targetSets: item.targetSets || item.sets.filter((s) => !s.warmup).length,
      targetReps: item.targetReps || '',
      rest: item.rest || '',
      note: item.note || '',
      sets: item.sets.filter((s) => s.done).map((s) => ({
        ...makeNewSet(),
        weight: s.weight || '',
        reps: s.reps || '',
        rpe: s.rpe || '',
        warmup: false,
      })),
    })),
  };

  await saveAndRender('training');
  switchView('training');
}

function openTemplateDialog(templateId = null) {
  const editing = templateId ? deepClone(state.templates.find((t) => t.id === templateId)) : {
    id: uid(),
    name: '',
    type: 'custom',
    note: '',
    enabled: true,
    items: [],
  };

  const suggestionNames = [...new Set(state.templates.flatMap((t) => t.items.map((i) => i.name)).sort())];

  els.templateDialog.innerHTML = `
    <form method="dialog" id="templateForm" class="dialog-form">
      <div class="row-between gap-12 wrap">
        <h2>${templateId ? '編輯模板' : '新增模板'}</h2>
        <button type="button" class="ghost" data-close-dialog>關閉</button>
      </div>
      <div class="grid grid-2 top-gap">
        <label class="field-block">
          <span>模板名稱</span>
          <input name="name" value="${escapeAttr(editing.name)}" placeholder="例如：推拉日 B" required />
        </label>
        <label class="field-block">
          <span>模板類型</span>
          <select name="type">${TEMPLATE_TYPES.map((type) => `<option value="${type.value}" ${editing.type === type.value ? 'selected' : ''}>${type.label}</option>`).join('')}</select>
        </label>
      </div>
      <label class="field-block top-gap">
        <span>模板備註</span>
        <input name="note" value="${escapeAttr(editing.note || '')}" placeholder="例如：胸背一起練" />
      </label>
      <label class="field-check top-gap">
        <input name="enabled" type="checkbox" ${editing.enabled ? 'checked' : ''} />
        <span>啟用此模板</span>
      </label>
      <datalist id="exerciseSuggestions">${suggestionNames.map((name) => `<option value="${escapeAttr(name)}"></option>`).join('')}</datalist>
      <div class="row-between gap-12 wrap top-gap">
        <h3>動作清單</h3>
        <button type="button" class="ghost" id="addTemplateRowBtn">新增動作</button>
      </div>
      <div id="templateItemsWrap" class="top-gap stack-list"></div>
      <div class="row gap-8 wrap top-gap dialog-footer">
        <button type="submit" class="primary">儲存模板</button>
      </div>
    </form>
  `;

  const dialog = els.templateDialog;
  const wrap = dialog.querySelector('#templateItemsWrap');
  dialog.showModal();

  const renderRows = () => {
    wrap.innerHTML = editing.items.map((item, index) => `
      <div class="subcard template-row" data-row-id="${item.id}">
        <div class="row-between gap-8 wrap">
          <strong>動作 ${index + 1}</strong>
          <div class="row gap-8 wrap">
            <button type="button" class="ghost small" data-template-row-move="up" data-row-id="${item.id}">上移</button>
            <button type="button" class="ghost small" data-template-row-move="down" data-row-id="${item.id}">下移</button>
            <button type="button" class="danger-text" data-template-row-delete data-row-id="${item.id}">刪除</button>
          </div>
        </div>
        <div class="grid grid-2 top-gap">
          <label class="field-block">
            <span>動作名稱</span>
            <input list="exerciseSuggestions" data-key="name" data-row-id="${item.id}" value="${escapeAttr(item.name)}" placeholder="例如：槓鈴臥推" />
          </label>
          <label class="field-block">
            <span>肌群</span>
            <select data-key="group" data-row-id="${item.id}">
              ${GROUP_OPTIONS.map((group) => `<option value="${group}" ${item.group === group ? 'selected' : ''}>${group}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="grid grid-3 top-gap">
          <label class="field-block">
            <span>組數</span>
            <input type="number" min="1" step="1" data-key="sets" data-row-id="${item.id}" value="${item.sets}" />
          </label>
          <label class="field-block">
            <span>目標次數</span>
            <input data-key="reps" data-row-id="${item.id}" value="${escapeAttr(item.reps)}" placeholder="例如：8-12" />
          </label>
          <label class="field-block">
            <span>休息秒數</span>
            <input type="number" min="0" step="5" data-key="rest" data-row-id="${item.id}" value="${item.rest || ''}" placeholder="90" />
          </label>
        </div>
        <label class="field-block top-gap">
          <span>備註</span>
          <input data-key="note" data-row-id="${item.id}" value="${escapeAttr(item.note || '')}" placeholder="例如：主力動作" />
        </label>
      </div>
    `).join('') || '<div class="empty">尚未加入動作，請先新增一個。</div>';
  };

  renderRows();

  const addRow = () => {
    editing.items.push({ id: uid(), name: '', group: '胸', sets: 3, reps: '8-12', rest: 90, note: '' });
    renderRows();
  };

  dialog.querySelector('#addTemplateRowBtn').onclick = addRow;
  dialog.querySelector('[data-close-dialog]').onclick = () => dialog.close();

  dialog.onclick = (event) => {
    const deleteBtn = event.target.closest('[data-template-row-delete]');
    if (deleteBtn) {
      editing.items = editing.items.filter((item) => item.id !== deleteBtn.dataset.rowId);
      renderRows();
      return;
    }
    const moveBtn = event.target.closest('[data-template-row-move]');
    if (moveBtn) {
      const idx = editing.items.findIndex((item) => item.id === moveBtn.dataset.rowId);
      if (idx < 0) return;
      const offset = moveBtn.dataset.templateRowMove === 'up' ? -1 : 1;
      const next = idx + offset;
      if (next < 0 || next >= editing.items.length) return;
      [editing.items[idx], editing.items[next]] = [editing.items[next], editing.items[idx]];
      renderRows();
    }
  };

  dialog.oninput = (event) => {
    const input = event.target.closest('[data-row-id][data-key]');
    if (!input) return;
    const row = editing.items.find((item) => item.id === input.dataset.rowId);
    if (!row) return;
    row[input.dataset.key] = input.value;
  };

  dialog.onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    editing.name = String(form.get('name') || '').trim();
    editing.type = String(form.get('type') || 'custom');
    editing.note = String(form.get('note') || '').trim();
    editing.enabled = form.get('enabled') === 'on';
    editing.items = editing.items
      .map((item) => ({
        ...item,
        name: String(item.name || '').trim(),
        group: String(item.group || '其他'),
        sets: Number(item.sets) || 0,
        reps: String(item.reps || '').trim(),
        rest: Number(item.rest) || 0,
        note: String(item.note || '').trim(),
      }))
      .filter((item) => item.name && item.sets > 0);

    if (!editing.name) {
      alert('請輸入模板名稱。');
      return;
    }
    if (!editing.items.length) {
      alert('至少要有一個動作。');
      return;
    }

    const existingIndex = state.templates.findIndex((t) => t.id === editing.id);
    if (existingIndex >= 0) state.templates[existingIndex] = editing;
    else state.templates.push(editing);
    dialog.close();
    await saveAndRender('templates');
  };
}

function openSessionItemDialog(prefillFromTemplate = false) {
  if (!state.activeSession) return;
  const template = state.templates.find((t) => t.id === state.activeSession.templateId);
  const suggestionItems = prefillFromTemplate && template ? template.items : [];
  const suggestionNames = [...new Set([
    ...state.templates.flatMap((t) => t.items.map((i) => i.name)),
    ...state.sessions.flatMap((s) => s.items.map((i) => i.name)),
  ])].sort();

  els.exerciseDialog.innerHTML = `
    <form method="dialog" class="dialog-form" id="sessionItemForm">
      <div class="row-between gap-12 wrap">
        <h2>${prefillFromTemplate ? '從模板補入動作' : '新增動作'}</h2>
        <button type="button" class="ghost" data-close-dialog>關閉</button>
      </div>
      <div class="muted top-gap">若這個動作有歷史紀錄，加入後會自動帶入上次正式組。</div>
      ${suggestionItems.length ? `
        <div class="top-gap stack-list">
          ${suggestionItems.map((item) => `<button type="button" class="quick-pick" data-pick-template-item="${item.id}">${escapeHtml(item.name)}｜${escapeHtml(item.group)}｜${item.sets} 組</button>`).join('')}
        </div>
      ` : ''}
      <datalist id="sessionExerciseSuggestions">${suggestionNames.map((name) => `<option value="${escapeAttr(name)}"></option>`).join('')}</datalist>
      <div class="grid grid-2 top-gap">
        <label class="field-block">
          <span>動作名稱</span>
          <input name="name" list="sessionExerciseSuggestions" placeholder="例如：槓鈴臥推" required />
        </label>
        <label class="field-block">
          <span>肌群</span>
          <select name="group">${GROUP_OPTIONS.map((group) => `<option value="${group}">${group}</option>`).join('')}</select>
        </label>
      </div>
      <div class="grid grid-3 top-gap">
        <label class="field-block">
          <span>組數</span>
          <input name="sets" type="number" min="1" value="3" />
        </label>
        <label class="field-block">
          <span>目標次數</span>
          <input name="reps" value="8-12" />
        </label>
        <label class="field-block">
          <span>休息秒數</span>
          <input name="rest" type="number" min="0" value="90" />
        </label>
      </div>
      <label class="field-block top-gap">
        <span>備註</span>
        <input name="note" placeholder="例如：收尾動作" />
      </label>
      <div class="row gap-8 wrap top-gap dialog-footer">
        <button type="submit" class="primary">加入訓練</button>
      </div>
    </form>
  `;

  const dialog = els.exerciseDialog;
  dialog.showModal();
  dialog.querySelector('[data-close-dialog]').onclick = () => dialog.close();

  dialog.onclick = (event) => {
    const quick = event.target.closest('[data-pick-template-item]');
    if (!quick || !template) return;
    const item = template.items.find((row) => row.id === quick.dataset.pickTemplateItem);
    if (!item) return;
    const prefills = buildPrefilledSetsForExercise(item.name, Number(item.sets) || 3);
    state.activeSession.items.push({
      id: uid(),
      sourceTemplateItemId: item.id,
      name: item.name,
      group: item.group,
      targetSets: Number(item.sets) || 3,
      targetReps: item.reps || '8-12',
      rest: Number(item.rest) || 90,
      note: item.note || '',
      autoFilledFromHistory: prefills.autoFilled,
      sets: prefills.sets,
    });
    dialog.close();
    schedulePersist();
    renderView('training');
  };

  dialog.onsubmit = (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const name = String(form.get('name') || '').trim();
    const sets = Number(form.get('sets') || 0);
    if (!name || sets <= 0) {
      alert('請輸入完整動作名稱與組數。');
      return;
    }
    const prefills = buildPrefilledSetsForExercise(name, sets);
    state.activeSession.items.push({
      id: uid(),
      sourceTemplateItemId: null,
      name,
      group: String(form.get('group') || '其他'),
      targetSets: sets,
      targetReps: String(form.get('reps') || '').trim(),
      rest: Number(form.get('rest') || 0),
      note: String(form.get('note') || '').trim(),
      autoFilledFromHistory: prefills.autoFilled,
      sets: prefills.sets,
    });
    dialog.close();
    schedulePersist();
    renderView('training');
  };
}


function sortTemplatesForQuickStart(templates) {
  return [...templates].sort((a, b) => {
    const score = (template) => {
      let value = Number(Boolean(template.enabled)) * 100;
      const name = template.name || '';
      if (name.includes('上肢A')) value += 60;
      if (name.includes('上肢B')) value += 40;
      if (template.type === 'legs' || name.includes('腿')) value += 20;
      return value;
    };
    return score(b) - score(a) || (a.name || '').localeCompare(b.name || '', 'zh-Hant');
  });
}

function getLatestCompletedExerciseRecord(exerciseName) {
  const sessions = [...state.sessions].sort((a, b) => b.completedAt - a.completedAt);
  for (const session of sessions) {
    const item = session.items.find((row) => row.name === exerciseName && row.sets.some((set) => set.done));
    if (!item) continue;
    const workSets = item.sets.filter((set) => set.done && !set.warmup);
    const referenceSets = workSets.length ? workSets : item.sets.filter((set) => set.done);
    const lastDone = [...referenceSets].reverse().find(Boolean) || null;
    return {
      completedAt: session.completedAt,
      sessionId: session.id,
      itemName: item.name,
      workSets: referenceSets.map((set) => ({
        weight: set.weight || '',
        reps: set.reps || '',
        rpe: set.rpe || '',
      })),
      workSetText: referenceSets.map((set) => `${set.weight || 0}×${set.reps || 0}${set.rpe ? ` / RPE ${set.rpe}` : ''}`).join('、'),
      lastDone,
    };
  }
  return null;
}

function buildPrefilledSetsForExercise(exerciseName, targetCount) {
  const safeCount = Math.max(1, Number(targetCount) || 1);
  const history = getLatestCompletedExerciseRecord(exerciseName);
  if (!history || !history.workSets.length) {
    return {
      sets: Array.from({ length: safeCount }, () => makeNewSet()),
      autoFilled: false,
    };
  }

  const sets = Array.from({ length: safeCount }, (_, index) => {
    const source = history.workSets[index] || history.workSets[history.workSets.length - 1];
    return {
      ...makeNewSet(),
      weight: source.weight || '',
      reps: source.reps || '',
      rpe: source.rpe || '',
      warmup: false,
    };
  });

  return {
    sets,
    autoFilled: true,
  };
}

function toggleSetField(itemId, setId, field) {
  const item = state.activeSession?.items.find((row) => row.id === itemId);
  if (!item) return;
  const set = item.sets.find((row) => row.id === setId);
  if (!set) return;
  set[field] = !set[field];
  schedulePersist();
  renderView('training');
}

function mergeSeedTemplates() {
  const existingNames = new Set(state.templates.map((t) => t.name));
  for (const template of seedTemplates()) {
    if (!existingNames.has(template.name)) {
      state.templates.push(template);
    }
  }
}

function migrateTemplatesToUpperSplit(existing) {
  const legacySeedNames = new Set(['推拉日（目前常用）', '推日', '拉日', '腿日']);
  const nextTemplates = existing.templates.filter((template) => !legacySeedNames.has(template.name));
  const nextNames = new Set(nextTemplates.map((template) => template.name));
  for (const template of seedTemplates()) {
    if (!nextNames.has(template.name)) {
      nextTemplates.push(template);
    }
  }
  existing.templates = nextTemplates;
}

function exportJsonBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `重訓課表備份-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function calcPeriodSummary(days) {
  const start = Date.now() - days * 24 * 60 * 60 * 1000;
  const sessions = state.sessions.filter((session) => session.completedAt >= start);
  return {
    sessions: sessions.length,
    workSets: sessions.reduce((sum, session) => sum + calcSessionWorkSets(session), 0),
    volume: sessions.reduce((sum, session) => sum + calcSessionVolume(session), 0),
  };
}

function buildGroupStats(days) {
  const start = Date.now() - days * 24 * 60 * 60 * 1000;
  const map = new Map();
  state.sessions
    .filter((session) => session.completedAt >= start)
    .forEach((session) => {
      session.items.forEach((item) => {
        if (!map.has(item.group)) map.set(item.group, { group: item.group, sets: 0, volume: 0 });
        const row = map.get(item.group);
        row.sets += item.sets.filter((set) => set.done && !set.warmup).length;
        row.volume += calcItemVolume(item);
      });
    });
  return [...map.values()].sort((a, b) => b.sets - a.sets || b.volume - a.volume);
}

function buildTemplateStats(days) {
  const start = Date.now() - days * 24 * 60 * 60 * 1000;
  const map = new Map();
  state.sessions.filter((session) => session.completedAt >= start).forEach((session) => {
    const key = session.templateName || '自由訓練';
    if (!map.has(key)) map.set(key, { name: key, sessions: 0, workSets: 0, volume: 0 });
    const row = map.get(key);
    row.sessions += 1;
    row.workSets += calcSessionWorkSets(session);
    row.volume += calcSessionVolume(session);
  });
  return [...map.values()].sort((a, b) => b.sessions - a.sessions || b.volume - a.volume);
}

function buildExerciseStats() {
  const map = new Map();
  state.sessions.forEach((session) => {
    session.items.forEach((item) => {
      if (!map.has(item.name)) map.set(item.name, { name: item.name, group: item.group, maxWeight: 0, bestE1RM: 0, volume: 0, workSets: 0 });
      const row = map.get(item.name);
      row.group = item.group || row.group;
      item.sets.filter((set) => set.done).forEach((set) => {
        const w = Number(set.weight) || 0;
        const r = Number(set.reps) || 0;
        row.maxWeight = Math.max(row.maxWeight, w);
        if (!set.warmup) {
          row.workSets += 1;
          row.volume += w * r;
          row.bestE1RM = Math.max(row.bestE1RM, estimate1RM(w, r));
        }
      });
    });
  });
  return [...map.values()].sort((a, b) => b.volume - a.volume || b.bestE1RM - a.bestE1RM || a.name.localeCompare(b.name));
}

function calcSessionWorkSets(session) {
  return session.items.reduce((sum, item) => sum + item.sets.filter((set) => set.done && !set.warmup).length, 0);
}

function calcSessionVolume(session) {
  return session.items.reduce((sum, item) => sum + calcItemVolume(item), 0);
}

function calcItemVolume(item) {
  return item.sets
    .filter((set) => set.done && !set.warmup)
    .reduce((sum, set) => sum + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0);
}

function estimate1RM(weight, reps) {
  if (!weight || !reps) return 0;
  return weight * (1 + reps / 30);
}

function sessionSummaryText(session) {
  return `${calcSessionWorkSets(session)} 組 / ${formatNumber(calcSessionVolume(session))} ${state.settings.unit}`;
}

function templateTypeLabel(type) {
  return TEMPLATE_TYPES.find((t) => t.value === type)?.label || '自訂';
}

function formatDateTime(value) {
  const d = new Date(value);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

function formatDuration(start, end) {
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m} 分`;
  return `${h} 小時 ${m} 分`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('zh-Hant-TW', { maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function makeNewSet() {
  return {
    id: uid(),
    weight: '',
    reps: '',
    rpe: '',
    warmup: false,
    done: false,
  };
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persistState(), 300);
}

async function saveAndRender(viewToRender = null) {
  await persistState();
  renderAll();
  if (viewToRender) renderView(viewToRender);
}

async function persistState() {
  await idbSet(STATE_KEY, state);
}

async function loadState() {
  const existing = await idbGet(STATE_KEY);
  if (!existing) {
    const fresh = deepClone(DEFAULT_STATE);
    await idbSet(STATE_KEY, fresh);
    return fresh;
  }
  if (!existing.settings) existing.settings = deepClone(DEFAULT_STATE.settings);
  if (!Array.isArray(existing.templates)) existing.templates = deepClone(DEFAULT_STATE.templates);
  if (!Array.isArray(existing.sessions)) existing.sessions = [];
  if (!('activeSession' in existing)) existing.activeSession = null;
  if (!('unit' in existing.settings)) existing.settings.unit = 'kg';
  if (!('showWarmup' in existing.settings)) existing.settings.showWarmup = true;
  if ((existing.version || 0) < 3) {
    migrateTemplatesToUpperSplit(existing);
  }
  existing.version = 3;
  return existing;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    els.installBtn.classList.remove('hidden');
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    els.installBtn.classList.add('hidden');
  });
}

async function confirmAction(message) {
  els.confirmDialog.innerHTML = `
    <form method="dialog" class="dialog-form small-dialog">
      <h2>確認操作</h2>
      <p class="muted">${escapeHtml(message)}</p>
      <div class="row gap-8 wrap top-gap dialog-footer">
        <button value="cancel" class="ghost">取消</button>
        <button value="ok" class="primary">確認</button>
      </div>
    </form>
  `;
  els.confirmDialog.showModal();
  return new Promise((resolve) => {
    els.confirmDialog.addEventListener('close', () => resolve(els.confirmDialog.returnValue === 'ok'), { once: true });
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((error) => console.error('SW 註冊失敗', error));
    });
  }
}
