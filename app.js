/* ── Database ── */
const db = new Dexie('BookmarkAI');
db.version(1).stores({
  bookmarks: '++id, url, title, category, tags',
  meta: 'key'
});
db.version(2).stores({
  bookmarks: '++id, url, title, category, tags, sortOrder',
  meta: 'key'
}).upgrade(tx => {
  return tx.table('bookmarks').toCollection().modify(bm => {
    bm.sortOrder = bm.id;
  });
});

/* ── State ── */
const state = {
  bookmarks: [],
  activeCategory: 'all',
  searchQuery: '',
  editingId: null,
  editingTags: [],
  addingTags: [],
  customCategories: []
};

/* ── DOM refs ── */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const dom = {
  sidebar: $('#sidebar'),
  content: $('#content'),
  search: $('#search'),
  stats: $('#stats'),
  categoryList: $('#category-list'),
  overlay: $('#overlay'),
  dropZone: $('#drop-zone'),
  fileInput: $('#file-input'),
  importStats: $('#import-stats'),
  btnImport: $('#btn-import'),
  btnImportSidebar: $('#btn-import-sidebar'),
  btnExport: $('#btn-export'),
  btnClear: $('#btn-clear'),
  btnAdd: $('#btn-add'),
  btnBatchAi: $('#btn-batch-ai'),
  btnCancel: $('#btn-cancel'),
  editOverlay: $('#edit-overlay'),
  editTitle: $('#edit-title'),
  editCategory: $('#edit-category'),
  editTagChips: $('#edit-tag-chips'),
  editTagInput: $('#edit-tag-input'),
  editSummary: $('#edit-summary'),
  categoryOptions: $('#category-options'),
  editCategoryChips: $('#edit-category-chips'),
  addOverlay: $('#add-overlay'),
  addCategoryChips: $('#add-category-chips'),
  addUrl: $('#add-url'),
  addTitle: $('#add-title'),
  addCategory: $('#add-category'),
  addTagChips: $('#add-tag-chips'),
  addTagInput: $('#add-tag-input'),
  addSummary: $('#add-summary'),
  addCategoryInput: $('#add-category-input'),
};

/* ── Init ── */
async function init() {
  await loadCustomCategories();
  await loadBookmarks();
  renderAll();
  dom.editOverlay.addEventListener('click', e => { if (e.target === dom.editOverlay) closeEditModal(); });
  $('#btn-edit-close').addEventListener('click', closeEditModal);
  $('#btn-edit-cancel').addEventListener('click', closeEditModal);
  $('#btn-edit-save').addEventListener('click', saveEdit);
  dom.editTagInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      dom.editTagInput.value.split(',').forEach(v => addEditTag(v));
    }
    if (e.key === 'Backspace' && !dom.editTagInput.value && state.editingTags.length > 0) {
      removeEditTag(state.editingTags.length - 1);
    }
  });
  dom.btnBatchAi.addEventListener('click', batchAiOptimize);
  dom.btnAdd.addEventListener('click', openAddModal);
  dom.addOverlay.addEventListener('click', e => { if (e.target === dom.addOverlay) closeAddModal(); });
  $('#btn-add-close').addEventListener('click', closeAddModal);
  $('#btn-add-cancel').addEventListener('click', closeAddModal);
  $('#btn-add-save').addEventListener('click', saveAdd);
  dom.addCategoryInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCategory(dom.addCategoryInput.value.trim());
    }
  });
  dom.addTagInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      dom.addTagInput.value.split(',').forEach(v => addAddTag(v));
    }
    if (e.key === 'Backspace' && !dom.addTagInput.value && state.addingTags.length > 0) {
      removeAddTag(state.addingTags.length - 1);
    }
  });
}

/* ── Load / Save ── */
async function loadBookmarks() {
  state.bookmarks = await db.bookmarks.toArray();
}

async function loadCustomCategories() {
  const row = await db.meta.get('customCategories');
  state.customCategories = row ? row.value : [];
}

async function saveCustomCategories() {
  await db.meta.put({ key: 'customCategories', value: state.customCategories });
}

async function addCategory(name) {
  if (!name) return;
  if (state.customCategories.includes(name)) { dom.addCategoryInput.value = ''; return; }
  state.customCategories.push(name);
  await saveCustomCategories();
  dom.addCategoryInput.value = '';
  renderAll();
}

async function deleteCategory(name) {
  state.customCategories = state.customCategories.filter(c => c !== name);
  // Revert bookmarks in this category back to 未分类
  const bms = state.bookmarks.filter(b => (b.category || '未分类') === name);
  for (const bm of bms) { bm.category = '未分类'; await db.bookmarks.put(bm); }
  await saveCustomCategories();
  await loadBookmarks();
  renderAll();
}

/* ── Render ── */
function renderAll() {
  renderSidebar();
  renderContent();
  renderStats();
}

function renderSidebar() {
  const cats = getCategories();
  dom.categoryList.innerHTML = cats.map(c => {
    const active = state.activeCategory === c.name ? ' active' : '';
    const delBtn = c.isCustom ? `<span class="btn-del-cat" onclick="event.stopPropagation();deleteCategory('${escAttr(c.name)}')" title="删除此分类">&times;</span>` : '';
    return `<button class="sidebar-filter${active}" data-category="${escAttr(c.name)}"
        ondragover="onCatDragOver(event)" ondragleave="onCatDragLeave(event)" ondrop="onCatDrop(event, '${escAttr(c.name)}')">
      ${escHtml(c.display)} <span class="sidebar-count">${c.count}</span>${delBtn}
    </button>`;
  }).join('');
  $('#count-all').textContent = state.bookmarks.length;
}

function getCategories() {
  const map = {};
  // Count bookmarks per category
  for (const b of state.bookmarks) {
    const cat = b.category || '未分类';
    map[cat] = (map[cat] || 0) + 1;
  }
  // Merge custom categories (ensure they appear even with count 0)
  for (const c of state.customCategories) {
    if (!map[c]) map[c] = 0;
  }
  const entries = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      display: `${emojiForCat(name)} ${name}`,
      isCustom: state.customCategories.includes(name)
    }));
  return entries;
}

function emojiForCat(cat) {
  const m = {
    '技术': '💻', '工具': '🔧', '阅读': '📖', '视频': '🎬',
    '购物': '🛒', '法律': '⚖️', '新闻': '📰', '社交': '💬',
    '学习': '🎓', '设计': '🎨', '音乐': '🎵', '其他': '📌',
    '未分类': '📂'
  };
  return m[cat] || '📌';
}

function renderContent() {
  const list = filterBookmarks();
  if (list.length === 0) {
    dom.content.innerHTML = state.bookmarks.length === 0
      ? `<div class="empty"><div class="icon">📚</div><h2>还没有书签</h2><p>点击上方「📥 导入」按钮，导入 Chrome 导出的书签 HTML 文件，AI 会自动帮你整理分类</p></div>`
      : `<div class="empty"><div class="icon">🔍</div><h2>没有匹配的书签</h2><p>试试换个关键词或筛选条件</p></div>`;
    return;
  }
  dom.content.innerHTML = renderGroupedContent(list);
}

function groupByHost(bookmarks) {
  const sorted = [...bookmarks].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const groups = new Map();
  for (const b of sorted) {
    const host = extractHost(b.url);
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host).push(b);
  }
  return groups;
}

function renderGroupedContent(list) {
  const groups = groupByHost(list);
  const multi = [];
  const singles = [];
  for (const [host, bms] of groups) {
    if (bms.length >= 2) multi.push({ host, bookmarks: bms });
    else singles.push(bms[0]);
  }
  multi.sort((a, b) => b.bookmarks.length - a.bookmarks.length);
  let html = '';
  for (const g of multi) html += domainGroupHtml(g.host, g.bookmarks);
  if (singles.length > 0) html += `<div class="card-grid">${singles.map(cardHtml).join('')}</div>`;
  return html;
}

function domainGroupHtml(host, bookmarks) {
  const favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
  return `
  <div class="domain-group">
    <div class="domain-header" onclick="toggleDomainGroup(this)"
        draggable="true" ondragstart="event.stopPropagation(); onGroupDragStart(event, '${escAttr(host)}')" ondragend="onDragEnd(event)"
        ondragover="onCardDragOver(event)" ondrop="onGroupDrop(event, '${escAttr(host)}')"
        title="点击折叠/展开，拖拽可整体移动">
      <img class="domain-favicon" src="${favicon}" loading="lazy" onerror="this.style.display='none'">
      <span class="domain-name">${escHtml(host)}</span>
      <span class="domain-count">${bookmarks.length} 条书签</span>
      <span class="domain-toggle">▼</span>
    </div>
    <div class="domain-cards">
      ${bookmarks.map(cardHtml).join('')}
    </div>
  </div>`;
}

function toggleDomainGroup(headerEl) {
  const group = headerEl.closest('.domain-group');
  const cards = group.querySelector('.domain-cards');
  const toggle = headerEl.querySelector('.domain-toggle');
  cards.classList.toggle('hidden');
  toggle.classList.toggle('collapsed');
}

function filterBookmarks() {
  let list = state.bookmarks;
  if (state.activeCategory !== 'all') {
    list = list.filter(b => (b.category || '未分类') === state.activeCategory);
  }
  const q = state.searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter(b => {
      const text = [b.title, b.summary, b.url, (b.tags || []).join(' '), b.folder].join(' ').toLowerCase();
      return text.includes(q);
    });
  }
  return list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

function cardHtml(b) {
  const host = extractHost(b.url);
  const favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
  const tags = (b.tags || []).map(t => `<span class="tag">${escHtml(t)}</span>`).join('');
  const summary = b.summary ? `<div class="card-summary">${escHtml(b.summary)}</div>` : '';
  const folder = b.folder ? `<div class="card-folder">📁 ${escHtml(b.folder)}</div>` : '';

  return `
  <div class="card" data-id="${b.id}" draggable="true"
      ondragstart="onDragStart(event, ${b.id})" ondragend="onDragEnd(event)"
      ondragover="onCardDragOver(event)" ondrop="onCardDrop(event, ${b.id})">
    <div class="card-header">
      <img class="card-favicon" src="${favicon}" loading="lazy" onerror="this.style.display='none'">
      <div style="flex:1;min-width:0">
        <div class="card-title"><a href="${escAttr(b.url)}" target="_blank" rel="noopener">${escHtml(b.title || '无标题')}</a></div>
        <div class="card-url">${escHtml(host)}</div>
      </div>
    </div>
    ${summary}
    <div class="card-tags">${tags}</div>
    ${folder}
    <div class="card-actions">
      <button class="btn btn-ghost btn-sm" onclick="editBookmark(${b.id})" title="编辑">✏️</button>
      <button class="btn btn-ghost btn-sm" onclick="aiAnalyze(${b.id})" title="AI 智能填充">✨</button>
      <button class="btn btn-ghost btn-sm" onclick="deleteBookmark(${b.id})" title="删除">🗑</button>
    </div>
  </div>`;
}

function renderStats() {
  dom.stats.textContent = `共 ${state.bookmarks.length} 条书签`;
  if (state.bookmarks.length > 0 && dom.btnClear.style.display === 'none') {
    dom.btnClear.style.display = '';
  }
  if (state.bookmarks.length > 0 && dom.btnBatchAi.style.display === 'none') {
    dom.btnBatchAi.style.display = '';
  }
}

function extractHost(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

/* ── Sidebar click ── */
dom.sidebar.addEventListener('click', e => {
  const btn = e.target.closest('.sidebar-filter');
  if (!btn) return;
  state.activeCategory = btn.dataset.category;
  $$('.sidebar-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderContent();
});

/* ── Search ── */
dom.search.addEventListener('input', () => {
  state.searchQuery = dom.search.value;
  renderContent();
});

/* ── Import flow ── */
dom.btnImport.addEventListener('click', openOverlay);
dom.btnImportSidebar.addEventListener('click', openOverlay);
dom.btnCancel.addEventListener('click', closeOverlay);
dom.overlay.addEventListener('click', e => { if (e.target === dom.overlay) closeOverlay(); });

function openOverlay() {
  dom.overlay.classList.remove('hidden');
  dom.importStats.textContent = '';
}

function closeOverlay() {
  dom.overlay.classList.add('hidden');
}

/* ── Drop zone ── */
dom.dropZone.addEventListener('click', () => dom.fileInput.click());
dom.dropZone.addEventListener('dragover', e => { e.preventDefault(); dom.dropZone.classList.add('drag-over'); });
dom.dropZone.addEventListener('dragleave', () => dom.dropZone.classList.remove('drag-over'));
dom.dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dom.dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
dom.fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

/* ── Bookmark Parser ── */
async function handleFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    const bookmarks = parseBookmarkHTML(reader.result);
    dom.importStats.innerHTML = `📦 已解析 <b>${bookmarks.length}</b> 条书签，正在分类...`;
    let added = 0, skipped = 0;
    for (const bm of bookmarks) {
      const dup = await isDuplicateURL(bm.url);
      if (dup) { skipped++; continue; }
      autoCategorize(bm);
      bm.sortOrder = Date.now();
      await db.bookmarks.put(bm);
      added++;
    }
    dom.importStats.innerHTML = `✅ 导入完成！新增 <b>${added}</b> 条` + (skipped > 0 ? `，跳过 <b>${skipped}</b> 条重复` : '');
    setTimeout(closeOverlay, 1500);
    await loadBookmarks();
    renderAll();
  };
  reader.readAsText(file);
}

function parseBookmarkHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const bookmarks = [];
  const folderStack = [];

  function walk(node) {
    if (node.nodeType !== 1) return;
    if (node.tagName === 'DT') {
      const h3 = node.querySelector(':scope > H3');
      if (h3) {
        folderStack.push(h3.textContent.trim());
        const dl = node.querySelector(':scope > DL');
        if (dl) walkDL(dl);
        folderStack.pop();
      }
      const a = node.querySelector(':scope > A');
      if (a) {
        const url = a.getAttribute('HREF');
        const title = a.textContent.trim();
        const addDate = a.getAttribute('ADD_DATE');
        if (url && !url.startsWith('javascript:') && !url.startsWith('chrome://')) {
          bookmarks.push({
            url,
            title: title || url,
            folder: folderStack.length > 0 ? folderStack.join(' / ') : null,
            addedAt: addDate ? new Date(parseInt(addDate) * 1000) : null,
            category: null,
            tags: [],
            summary: null
          });
        }
      }
    }
  }

  function walkDL(dl) {
    for (const child of dl.children) {
      walk(child);
    }
  }

  const rootDL = doc.querySelector('DL');
  if (rootDL) walkDL(rootDL);
  return bookmarks;
}

/* ── Auto Categorize ── */
const CATEGORY_RULES = [
  ['技术', /(github|gitlab|bitbucket|stackoverflow|npmjs|pypi|npm|docker|kubernetes|linux|kernel|apache|nginx|nodejs|typescript|python\.org|java\.com|golang|rust|react|vue|angular|webpack|vite|eslint|babel|tailwind|graphql)/i],
  ['工具', /(tool|generator|converter|formatter|validator|checker|tester|analyzer|calculator|crontab|encoder|decoder|compressor|json|regex101|codepen|jsfiddle|jsbin|playcode)/i],
  ['视频', /(bilibili|youtube|douyin|tiktok|iqiyi|youku|vimeo|twitch|acfun|huya|douyu|netflix)/i],
  ['购物', /(taobao|jd\.com|pinduoduo|amazon|aliexpress|ebay|shopify|smzdm|tmall|fliggy|yangkeduo|mogujie)/i],
  ['阅读', /(zhihu|juejin|csdn|segmentfault|jianshu|ruanyifeng|infoq|medium|dev\.to|36kr|sspai|ifanr|huxiu|geekbang|woshipm|mp\.weixin)/i],
  ['新闻', /(news|toutiao|thepaper|bbc|cnn|sina\.com|sohu|163\.com|ifeng|huanqiu|xinhua|people\.com)/i],
  ['社交', /(weibo|twitter|facebook|douban|tieba|reddit|v2ex|hupu|nga|tgbus|zhihu\.com\/people)/i],
  ['学习', /(course|learn|edu|class|wiki|tutorial|guide|doc|docs|handbook|lesson|mooc|w3school|runoob|liaoxuefeng|coursera|udemy|khanacademy)/i],
  ['设计', /(dribbble|behance|figma|sketch|zeplin|pinterest|huaban|zcool|ui\.cn|awwwards|design|colorhunt|coolors|fontawesome|iconfont)/i],
  ['音乐', /(music\.163|qq\.com\/music|kugou|kuwo|xiami|spotify|soundcloud|last\.fm|y\.qq)/i],
  ['法律', /(gov\.cn|law|legal|statute|regulation|chinalaw|pkulaw|court|justice|法规|法律)/i],
  ['AI', /(chatgpt|openai|claude|gemini|copilot|midjourney|dall-e|stable-diffusion|huggingface|llm|aigc|deepseek|poe\.com|bard)/i],
];

const TAG_KEYWORDS = {
  '教程': /(教程|tutorial|guide|入门|handbook|上手|详解|实战|从零)/i,
  '开源': /(github|gitlab|开源|open.source)/i,
  'API': /(api|rest|graphql|swagger|接口)/i,
  '框架': /(react|vue|angular|svelte|next|nuxt|框架)/i,
  '工具': /(tool|工具|generator|在线|cool|awesome)/i,
  '前端': /(css|html|javascript|js|前端|frontend|webpack|vite)/i,
  '后端': /(python|java|golang|rust|node|django|flask|spring|后端|backend)/i,
  '文章': /(blog|post|article|阅读|news|文章)/i,
  '视频': /(video|视频|bilibili|youtube|watch|live)/i,
  '文档': /(doc|docs|documentation|reference|手册|文档|api)/i,
  '社区': /(forum|community|社区|bbs|discussion)/i,
  '设计': /(design|ui|ux|设计|图标|icon|color|配色)/i,
};

function categorizeByURL(url) {
  for (const [cat, re] of CATEGORY_RULES) {
    if (re.test(url)) return cat;
  }
  return null;
}

function categorizeByTitle(title) {
  for (const [cat, re] of CATEGORY_RULES) {
    if (re.test(title)) return cat;
  }
  return '未分类';
}

function extractTags(title, url) {
  const tags = [];
  // Extract brand/domain
  const host = extractHost(url);
  const brandMap = {
    'github.com': 'GitHub', 'gitlab.com': 'GitLab', 'stackoverflow.com': 'Stack Overflow',
    'npmjs.com': 'npm', 'bilibili.com': 'B站', 'youtube.com': 'YouTube',
    'zhihu.com': '知乎', 'juejin.cn': '掘金', 'csdn.net': 'CSDN',
    'douban.com': '豆瓣', 'weibo.com': '微博', 'v2ex.com': 'V2EX',
    'figma.com': 'Figma', 'dribbble.com': 'Dribbble',
  };
  if (brandMap[host]) tags.push(brandMap[host]);

  // Match title keywords
  for (const [tag, re] of Object.entries(TAG_KEYWORDS)) {
    if (tags.length >= 3) break;
    if (re.test(title) || re.test(url)) {
      if (!tags.includes(tag)) tags.push(tag);
    }
  }

  // Fallback: extract first meaningful word from title
  if (tags.length === 0) {
    const clean = title.replace(/[|\[\]【】\-–—·•].*$/, '').trim();
    const word = clean.split(/[\s·]+/).filter(w => w.length >= 2 && !/^\d/.test(w))[0];
    if (word && word.length <= 10) tags.push(word);
  }

  return tags.slice(0, 3);
}

function generateSummary(title) {
  let s = title
    .replace(/^GitHub\s*[-–—]\s*/i, '')
    .replace(/\s*[-–—|·•].*$/, '')
    .replace(/\s*[\[【].*?[\]】]/g, '')
    .replace(/\b20\d{2}[年-]?\d{0,2}月?\d{0,2}日?\s*/g, '')
    .replace(/\s*[（(]?\s*(最新|新版|202\d|推荐|必看|收藏|热帖|置顶)\s*[）)]?\s*/gi, '')
    .trim();
  return s || title;
}

function autoCategorize(bm) {
  bm.category = categorizeByURL(bm.url) || categorizeByTitle(bm.title);
  bm.tags = extractTags(bm.title, bm.url);
  bm.summary = generateSummary(bm.title);
  return bm;
}

// [AI-EXTENSION] 如需 AI 增强：在此处引入 AI 分类/标签/摘要，override autoCategorize 的结果

/* ── AI Single Analyze ── */
const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

function getApiKey() {
  return localStorage.getItem('ds_api_key') || '';
}

function buildAIPrompt(title, url) {
  const catList = [
    ...state.customCategories,
    '技术', '工具', '阅读', '视频', '购物', '新闻', '社交', '学习', '设计', '音乐', '法律', 'AI', '其他'
  ].join('/');
  return `分析以下书签，返回 JSON：
- category: 选择一个最合适的分类（${catList}）
- tags: 1-3个中文标签
- summary: 一句话中文摘要（20字以内）

书签标题: ${title}
书签 URL: ${url}

只返回 JSON，格式：{"category":"分类","tags":["标签1","标签2"],"summary":"摘要"}`;
}

async function callDeepSeek(prompt) {
  const res = await fetch(DEEPSEEK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 300
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API 请求失败 (${res.status}): ${err}`);
  }
  const data = await res.json();
  const content = data.choices[0].message.content.trim();
  const cleaned = content.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

async function aiAnalyze(id) {
  const bm = state.bookmarks.find(b => b.id === id);
  if (!bm) return;
  const apiKey = getApiKey();
  if (!apiKey) {
    const key = prompt('请输入你的 DeepSeek API Key（仅保存在本地浏览器）：');
    if (!key) { toast('已取消', 'error'); return; }
    localStorage.setItem('ds_api_key', key);
  }

  toast('✨ AI 分析中...', 'success');
  try {
    const ai = await callDeepSeek(buildAIPrompt(bm.title, bm.url));
    openEditModal(bm);
    state.editingTags = ai.tags || [];
    renderEditTagChips();
    dom.editCategory.value = ai.category || '';
    dom.editSummary.value = ai.summary || '';
    toast('✅ AI 建议已填入，请确认后保存', 'success');
  } catch (e) {
    console.error('AI analyze error:', e);
    toast('❌ AI 分析失败: ' + e.message, 'error');
  }
}

async function batchAiOptimize() {
  const apiKey = getApiKey();
  if (!apiKey) {
    const key = prompt('请输入你的 DeepSeek API Key（仅保存在本地浏览器）：');
    if (!key) { toast('已取消', 'error'); return; }
    localStorage.setItem('ds_api_key', key);
  }

  const targets = state.bookmarks.filter(b =>
    (b.category || '未分类') === '未分类' || (b.tags || []).length === 0
  );
  if (targets.length === 0) { toast('✅ 所有书签已完善，无需优化', 'success'); return; }

  const btn = dom.btnBatchAi;
  const origText = btn.textContent;
  btn.textContent = '⏳ 处理中...';
  btn.disabled = true;
  dom.stats.textContent = `🤖 0 / ${targets.length}`;
  let done = 0, failed = 0;

  for (const bm of targets) {
    try {
      const ai = await callDeepSeek(buildAIPrompt(bm.title, bm.url));
      bm.category = ai.category || '未分类';
      bm.tags = ai.tags || [];
      bm.summary = ai.summary || '';
      await db.bookmarks.put(bm);
      done++;
      dom.stats.textContent = `🤖 ${done} / ${targets.length}`;
    } catch (e) {
      failed++;
      console.error('Batch AI error for', bm.title, e);
    }
  }

  await loadBookmarks();
  renderAll();
  btn.textContent = origText;
  btn.disabled = false;
  toast(`✅ 完成！优化 ${done} 条` + (failed > 0 ? `，失败 ${failed} 条` : ''), 'success');
}

/* ── Delete ── */
async function deleteBookmark(id) {
  if (!confirm('确定删除这条书签吗？')) return;
  await db.bookmarks.delete(id);
  toast('已删除', 'success');
  await loadBookmarks();
  renderAll();
}

/* ── Edit ── */
async function editBookmark(id) {
  try {
    const bm = state.bookmarks.find(b => b.id === id);
    if (!bm) { console.warn('editBookmark: bookmark not found for id', id); return; }
    openEditModal(bm);
  } catch (e) { console.error('editBookmark error:', e); }
}

function openEditModal(bm) {
  state.editingId = bm.id;
  state.editingTags = [...(bm.tags || [])];
  dom.editTitle.value = bm.title || '';
  dom.editCategory.value = bm.category || '';
  dom.editSummary.value = bm.summary || '';
  const cats = getCategories();
  dom.categoryOptions.innerHTML = cats.map(c => `<option value="${escAttr(c.name)}">`).join('');
  dom.editCategoryChips.innerHTML = cats.map(c =>
    `<span class="category-chip" onclick="document.getElementById('edit-category').value='${escAttr(c.name)}'">${escHtml(c.display || c.name)}</span>`
  ).join('');
  renderEditTagChips();
  dom.editOverlay.classList.remove('hidden');
  dom.editTitle.focus();
}

function closeEditModal() {
  dom.editOverlay.classList.add('hidden');
  state.editingId = null;
  state.editingTags = [];
}

function renderEditTagChips() {
  dom.editTagChips.innerHTML = state.editingTags.map((t, i) =>
    `<span class="tag-chip">${escHtml(t)}<span class="tag-chip-remove" onclick="removeEditTag(${i})">&times;</span></span>`
  ).join('');
}

function addEditTag(value) {
  const v = value.trim();
  if (!v || state.editingTags.includes(v)) return;
  state.editingTags.push(v);
  renderEditTagChips();
  dom.editTagInput.value = '';
}

function removeEditTag(index) {
  state.editingTags.splice(index, 1);
  renderEditTagChips();
}

async function saveEdit() {
  if (state.editingId === null) return;
  const bm = state.bookmarks.find(b => b.id === state.editingId);
  if (!bm) return;
  bm.title = dom.editTitle.value.trim();
  bm.category = dom.editCategory.value.trim() || '未分类';
  bm.tags = [...state.editingTags];
  bm.summary = dom.editSummary.value.trim();
  await db.bookmarks.put(bm);
  toast('已更新', 'success');
  await loadBookmarks();
  renderAll();
  closeEditModal();
}

/* ── Add Bookmark ── */
function openAddModal() {
  state.addingTags = [];
  dom.addUrl.value = '';
  dom.addTitle.value = '';
  dom.addCategory.value = '';
  dom.addSummary.value = '';
  const cats = getCategories();
  dom.categoryOptions.innerHTML = cats.map(c => `<option value="${escAttr(c.name)}">`).join('');
  dom.addCategoryChips.innerHTML = cats.map(c =>
    `<span class="category-chip" onclick="document.getElementById('add-category').value='${escAttr(c.name)}'">${escHtml(c.display || c.name)}</span>`
  ).join('');
  renderAddTagChips();
  dom.addOverlay.classList.remove('hidden');
  dom.addUrl.focus();
}

function closeAddModal() {
  dom.addOverlay.classList.add('hidden');
  state.addingTags = [];
}

function renderAddTagChips() {
  dom.addTagChips.innerHTML = state.addingTags.map((t, i) =>
    `<span class="tag-chip">${escHtml(t)}<span class="tag-chip-remove" onclick="removeAddTag(${i})">&times;</span></span>`
  ).join('');
}

function addAddTag(value) {
  const v = value.trim();
  if (!v || state.addingTags.includes(v)) return;
  state.addingTags.push(v);
  renderAddTagChips();
  dom.addTagInput.value = '';
}

function removeAddTag(index) {
  state.addingTags.splice(index, 1);
  renderAddTagChips();
}

async function isDuplicateURL(url) {
  let bm = await db.bookmarks.where('url').equals(url).first();
  if (bm) return bm;
  const alt = url.includes('://www.')
    ? url.replace('://www.', '://')
    : url.replace('://', '://www.');
  bm = await db.bookmarks.where('url').equals(alt).first();
  return bm || null;
}

async function saveAdd() {
  const url = dom.addUrl.value.trim();
  if (!url) { toast('请输入 URL', 'error'); return; }
  try { new URL(url); } catch { toast('URL 格式不正确', 'error'); return; }

  const dup = await isDuplicateURL(url);
  if (dup) {
    if (!confirm(`该书签已存在（"${dup.title}"），是否仍要添加？`)) return;
  }

  const title = dom.addTitle.value.trim() || extractHost(url);
  const auto = { url, title };
  autoCategorize(auto);
  const bm = {
    url,
    title,
    category: dom.addCategory.value.trim() || auto.category,
    tags: state.addingTags.length > 0 ? [...state.addingTags] : auto.tags,
    summary: dom.addSummary.value.trim() || auto.summary,
    folder: null,
    addedAt: new Date(),
    sortOrder: Date.now()
  };
  await db.bookmarks.put(bm);
  toast('已添加', 'success');
  await loadBookmarks();
  renderAll();
  closeAddModal();
}

/* ── Export ── */
dom.btnExport.addEventListener('click', () => {
  if (state.bookmarks.length === 0) return toast('没有可导出的书签', 'error');
  const html = generateExportHTML(state.bookmarks);
  downloadFile('bookmarks-export.html', html);
  toast('导出成功', 'success');
});

function generateExportHTML(bookmarks) {
  const byFolder = {};
  for (const b of bookmarks) {
    const f = b.folder || b.category || '未分类';
    (byFolder[f] = byFolder[f] || []).push(b);
  }
  const items = Object.entries(byFolder).map(([folder, bms]) => {
    const links = bms.map(b => `        <DT><A HREF="${escAttr(b.url)}" ADD_DATE="${Math.floor((b.addedAt?.getTime() || Date.now()) / 1000)}">${escHtml(b.title)}</A>`).join('\n');
    return `    <DT><H3>${escHtml(folder)}</H3>\n    <DL><p>\n${links}\n    </DL><p>`;
  }).join('\n');

  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${items}
</DL><p>`;
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ── Clear ── */
dom.btnClear.addEventListener('click', async () => {
  if (!confirm('确定删除所有书签数据吗？此操作不可恢复。')) return;
  await db.bookmarks.clear();
  toast('已清空', 'success');
  await loadBookmarks();
  renderAll();
});

/* ── Toast ── */
function toast(msg, type) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

/* ── Helpers ── */
function escHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Drag & Drop ── */
function onDragStart(e, id) {
  e.dataTransfer.setData('text/plain', 'card:' + id);
  e.dataTransfer.effectAllowed = 'move';
  e.target.classList.add('dragging');
}

function onDragEnd(e) {
  e.target.classList.remove('dragging');
}

function onCardDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
  // Remove highlight on leave
  const el = e.currentTarget;
  const rm = () => { el.removeEventListener('dragleave', rm); el.classList.remove('drag-over'); };
  el.addEventListener('dragleave', rm);
}

async function onCardDrop(e, targetId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const raw = e.dataTransfer.getData('text/plain');
  if (raw.startsWith('group:')) {
    await moveGroup(raw.replace('group:', ''), targetId);
    return;
  }
  const dragId = parseInt(raw.replace('card:', ''));
  if (isNaN(dragId) || dragId === targetId) return;
  const a = state.bookmarks.find(b => b.id === dragId);
  const b = state.bookmarks.find(b => b.id === targetId);
  if (!a || !b) return;
  const tmp = a.sortOrder || 0;
  a.sortOrder = b.sortOrder || 0;
  b.sortOrder = tmp;
  await db.bookmarks.bulkPut([a, b]);
  await loadBookmarks();
  renderAll();
}

async function moveGroup(host, targetId) {
  const target = state.bookmarks.find(b => b.id === targetId);
  if (!target) return;
  const groupBms = state.bookmarks.filter(b => extractHost(b.url) === host);
  if (groupBms.length === 0) return;
  const targetOrder = target.sortOrder || 0;
  const later = state.bookmarks.filter(b => (b.sortOrder || 0) >= targetOrder && !groupBms.some(g => g.id === b.id));
  const shift = groupBms.length;
  for (const bm of later) { bm.sortOrder = (bm.sortOrder || 0) + shift; }
  for (let i = 0; i < groupBms.length; i++) { groupBms[i].sortOrder = targetOrder + i; }
  await db.bookmarks.bulkPut([...groupBms, ...later]);
  await loadBookmarks();
  renderAll();
}

function onGroupDragStart(e, host) {
  e.dataTransfer.setData('text/plain', 'group:' + host);
  e.dataTransfer.effectAllowed = 'move';
  e.target.classList.add('dragging');
}

async function onGroupDrop(e, host) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const raw = e.dataTransfer.getData('text/plain');
  const dragId = parseInt(raw.replace('card:', ''));
  if (isNaN(dragId)) return;
  const bm = state.bookmarks.find(b => b.id === dragId);
  if (!bm) return;
  const groupBms = state.bookmarks.filter(b => extractHost(b.url) === host);
  const maxOrder = groupBms.length > 0 ? Math.max(...groupBms.map(b => b.sortOrder || 0)) : 0;
  bm.sortOrder = maxOrder + 1;
  await db.bookmarks.put(bm);
  await loadBookmarks();
  renderAll();
}

function onCatDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('droppable');
}

function onCatDragLeave(e) {
  e.currentTarget.classList.remove('droppable');
}

async function onCatDrop(e, category) {
  e.preventDefault();
  e.currentTarget.classList.remove('droppable');
  const raw = e.dataTransfer.getData('text/plain');
  if (raw.startsWith('group:')) {
    const host = raw.replace('group:', '');
    const groupBms = state.bookmarks.filter(b => extractHost(b.url) === host);
    for (const bm of groupBms) { bm.category = category; }
    if (groupBms.length > 0) {
      await db.bookmarks.bulkPut(groupBms);
      await loadBookmarks();
      renderAll();
    }
    return;
  }
  const id = parseInt(raw.replace('card:', ''));
  if (isNaN(id)) return;
  const bm = state.bookmarks.find(b => b.id === id);
  if (!bm) return;
  bm.category = category;
  await db.bookmarks.put(bm);
  await loadBookmarks();
  renderAll();
}

/* ── Keyboard shortcut ── */
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    dom.search.focus();
  }
  if (e.key === 'Escape') {
    if (!dom.addOverlay.classList.contains('hidden')) {
      closeAddModal();
      return;
    }
    if (!dom.editOverlay.classList.contains('hidden')) {
      closeEditModal();
      return;
    }
    closeOverlay();
    dom.search.blur();
  }
});

/* ── Start ── */
init();
