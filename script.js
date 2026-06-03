const terms = window.GLOSSARY_TERMS;
const categories = window.GLOSSARY_CATEGORIES;
const app = document.querySelector('#app');
const scrollTopBtn = document.querySelector('#scrollTopBtn');
const HISTORY_KEY = 'uiuxGlossaryRecentSearches';
const MORE_STEP = 10;
const INITIAL_COUNT = 2;
let lastQuery = '';
let lastCategory = '';
let sectionVisibleCounts = new Map();

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()\-_/.,]/g, '')
    .trim();
}

function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getRecentSearches() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function setRecentSearches(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 5)));
}

function addRecentSearch(query) {
  const q = query.trim();
  if (!q) return;
  const next = [q, ...getRecentSearches().filter(item => item !== q)].slice(0, 5);
  setRecentSearches(next);
}

function removeRecentSearch(query) {
  setRecentSearches(getRecentSearches().filter(item => item !== query));
}

function searchTerms(query) {
  const q = normalizeText(query);
  if (!q) return terms;

  return terms
    .map(term => {
      const fields = [term.ko, term.en, term.category, term.summary, term.description, term.example, ...(term.tags || [])];
      const normalizedFields = fields.map(normalizeText);
      let score = 0;
      if (normalizeText(term.ko) === q || normalizeText(term.en) === q) score += 100;
      if (normalizeText(term.ko).includes(q)) score += 60;
      if (normalizeText(term.en).includes(q)) score += 50;
      if ((term.tags || []).some(tag => normalizeText(tag).includes(q))) score += 35;
      if (normalizedFields.some(field => field.includes(q))) score += 20;
      if (simpleTypoMatch(q, normalizedFields)) score += 10;
      return { ...term, _score: score };
    })
    .filter(term => term._score > 0)
    .sort((a, b) => b._score - a._score || a.ko.localeCompare(b.ko, 'ko'));
}

function simpleTypoMatch(q, normalizedFields) {
  if (q.length < 2) return false;
  return normalizedFields.some(field => {
    if (!field || field.length < 2) return false;
    return field.includes(q.slice(0, -1)) || field.includes(q.slice(1));
  });
}

function getRelatedSuggestions(query) {
  const q = normalizeText(query);
  if (!q) return [];
  const pool = [];
  for (const term of terms) {
    pool.push(term.ko, term.en, ...(term.tags || []));
  }
  return [...new Set(pool)]
    .filter(item => normalizeText(item).includes(q) || normalizeText(item).includes(q.slice(0, -1)))
    .slice(0, 7);
}

function groupByCategory(list) {
  const map = new Map();
  for (const category of categories.filter(c => c.id !== 'all')) map.set(category.id, []);
  for (const term of list) {
    if (!map.has(term.category)) map.set(term.category, []);
    map.get(term.category).push(term);
  }
  return [...map.entries()].filter(([, items]) => items.length > 0);
}

function goHome() {
  history.pushState({}, '', '#/');
  render();
}

function goResults({ query = '', category = '' }) {
  const params = new URLSearchParams();
  if (query) params.set('q', query.trim());
  if (category && category !== 'all') params.set('category', category);
  if (query) addRecentSearch(query);
  history.pushState({}, '', `#/results?${params.toString()}`);
  render();
}

function goDetail(id) {
  history.pushState({}, '', `#/term/${encodeURIComponent(id)}`);
  render();
}

function getRoute() {
  const hash = location.hash || '#/';
  const [path, qs = ''] = hash.slice(1).split('?');
  return { path, params: new URLSearchParams(qs) };
}

function render() {
  const { path, params } = getRoute();
  sectionVisibleCounts.clear();

  if (path.startsWith('/term/')) {
    renderDetail(decodeURIComponent(path.replace('/term/', '')));
    return;
  }

  if (path === '/results') {
    renderResults(params.get('q') || '', params.get('category') || '');
    return;
  }

  renderHome();
}

function renderHome() {
  const template = document.querySelector('#homeTemplate').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(template);

  const input = app.querySelector('[data-search-input]');
  const clearBtn = app.querySelector('[data-clear-search]');
  const submitBtn = app.querySelector('[data-search-submit]');
  const form = app.querySelector('[data-search-form]');
  const categoryStrip = app.querySelector('[data-category-strip]');

  categoryStrip.innerHTML = categories.filter(c => c.featured).map(category => `
    <button class="category-item" type="button" data-category="${escapeHTML(category.id)}">
      <span class="category-item__icon">${escapeHTML(category.icon)}</span>
      <span class="category-item__label">${escapeHTML(category.label)}</span>
    </button>
  `).join('') + `
    <button class="category-item" type="button" data-open-category-modal>
      <span class="category-item__icon">•••</span>
      <span class="category-item__label">사전 전체</span>
    </button>
  `;

  bindSearchBox(form);

  categoryStrip.addEventListener('click', event => {
    const categoryButton = event.target.closest('[data-category]');
    const modalButton = event.target.closest('[data-open-category-modal]');
    if (categoryButton) goResults({ category: categoryButton.dataset.category });
    if (modalButton) openCategoryModal();
  });

  input.addEventListener('input', () => {
    const hasValue = input.value.trim().length > 0;
    clearBtn.classList.toggle('is-visible', hasValue);
    submitBtn.disabled = !hasValue;
    updateSuggestPanel(form, input.value);
  });
}

function bindSearchBox(form) {
  const input = form.querySelector('[data-search-input]');
  const clearBtn = form.querySelector('[data-clear-search]');
  const submitBtn = form.querySelector('[data-search-submit]');

  form.addEventListener('submit', event => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    goResults({ query });
  });

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    input.focus();
    clearBtn.classList.remove('is-visible');
    if (submitBtn) submitBtn.disabled = true;
    updateSuggestPanel(form, '');
  });

  input.addEventListener('focus', () => updateSuggestPanel(form, input.value));
}

function updateSuggestPanel(form, query) {
  const panel = form.querySelector('[data-suggest-panel]');
  if (!panel) return;
  const recentSection = form.querySelector('[data-recent-section]');
  const relatedSection = form.querySelector('[data-related-section]');
  const recentList = form.querySelector('[data-recent-list]');
  const relatedList = form.querySelector('[data-related-list]');
  const empty = form.querySelector('[data-suggest-empty]');
  const recent = getRecentSearches();
  const related = getRelatedSuggestions(query);

  panel.classList.add('is-open');
  recentSection.hidden = query.trim().length > 0 || recent.length === 0;
  relatedSection.hidden = query.trim().length === 0 || related.length === 0;
  empty.hidden = !(query.trim().length > 0 && related.length === 0);

  recentList.innerHTML = recent.map(item => `
    <li>
      <button type="button" data-recent-query="${escapeHTML(item)}">${escapeHTML(item)}</button>
      <button class="delete-recent" type="button" data-delete-recent="${escapeHTML(item)}" aria-label="${escapeHTML(item)} 삭제">×</button>
    </li>
  `).join('');

  relatedList.innerHTML = related.map(item => `
    <li><button type="button" data-related-query="${escapeHTML(item)}">${escapeHTML(item)}</button></li>
  `).join('');

  form.querySelector('[data-clear-history]')?.addEventListener('click', () => {
    setRecentSearches([]);
    updateSuggestPanel(form, query);
  }, { once: true });

  form.querySelector('[data-close-suggest]')?.addEventListener('click', () => {
    panel.classList.remove('is-open');
  }, { once: true });

  recentList.onclick = event => {
    const del = event.target.closest('[data-delete-recent]');
    const item = event.target.closest('[data-recent-query]');
    if (del) {
      removeRecentSearch(del.dataset.deleteRecent);
      updateSuggestPanel(form, query);
      return;
    }
    if (item) goResults({ query: item.dataset.recentQuery });
  };

  relatedList.onclick = event => {
    const item = event.target.closest('[data-related-query]');
    if (item) goResults({ query: item.dataset.relatedQuery });
  };
}

function renderResults(query, category) {
  lastQuery = query;
  lastCategory = category;
  const template = document.querySelector('#resultsTemplate').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(template);

  const input = app.querySelector('[data-search-input]');
  const form = app.querySelector('[data-search-form]');
  const clearBtn = app.querySelector('[data-clear-search]');
  const meta = app.querySelector('[data-result-meta]');
  input.value = query || '';
  clearBtn.classList.toggle('is-visible', input.value.length > 0);
  bindSearchBox(form);
  input.addEventListener('input', () => clearBtn.classList.toggle('is-visible', input.value.trim().length > 0));

  const base = query ? searchTerms(query) : terms;
  const filtered = category && category !== 'all' ? base.filter(term => term.category === category) : base;
  const title = query ? `“${escapeHTML(query)}” 검색 결과` : `${escapeHTML(category || '전체')} 카테고리`;
  meta.innerHTML = `<strong>${title}</strong><span>${filtered.length}개 용어</span>`;

  renderResultSections(filtered);
}

function renderResultSections(list) {
  const wrap = app.querySelector('[data-results-wrap]');
  if (!list.length) {
    wrap.innerHTML = `
      <section class="empty-result">
        <h2>검색 결과가 없습니다.</h2>
        <p>띄어쓰기, 한글/영문 용어, 약어를 바꿔 다시 검색해 보세요.</p>
        <div class="empty-actions">
          <button type="button" data-empty-all>전체 용어 보기</button>
          <button type="button" data-empty-category>추천 카테고리 보기</button>
        </div>
      </section>
    `;
    wrap.querySelector('[data-empty-all]').onclick = () => goResults({ category: 'all' });
    wrap.querySelector('[data-empty-category]').onclick = () => openCategoryModal();
    return;
  }

  const grouped = groupByCategory(list);
  wrap.innerHTML = grouped.map(([categoryName, items]) => renderCategorySection(categoryName, items)).join('');

  wrap.addEventListener('click', event => {
    const termButton = event.target.closest('[data-term-id]');
    const moreButton = event.target.closest('[data-more-category]');
    if (termButton) goDetail(termButton.dataset.termId);
    if (moreButton) toggleMore(categoryNameFromButton(moreButton), grouped);
  });
}

function categoryNameFromButton(button) {
  return button.dataset.moreCategory;
}

function renderCategorySection(categoryName, items) {
  const visibleCount = sectionVisibleCounts.get(categoryName) || INITIAL_COUNT;
  const visibleItems = items.slice(0, visibleCount);
  const isAllVisible = visibleCount >= items.length;
  const showButton = items.length > INITIAL_COUNT;

  return `
    <section class="result-section" data-section="${escapeHTML(categoryName)}">
      <h2><span>${escapeHTML(categoryName)}</span></h2>
      <div class="result-list">
        ${visibleItems.map(renderResultItem).join('')}
      </div>
      ${showButton ? `
        <button class="section-more" type="button" data-more-category="${escapeHTML(categoryName)}">
          ${isAllVisible ? '닫기' : `더보기 (${Math.min(MORE_STEP, items.length - visibleCount)}개)`}
        </button>
      ` : ''}
    </section>
  `;
}

function renderResultItem(term) {
  return `
    <button class="result-item" type="button" data-term-id="${escapeHTML(term.id)}">
      <strong>${escapeHTML(term.ko)} <span>(${escapeHTML(term.en)})</span></strong>
      <p>${escapeHTML(term.summary)}</p>
    </button>
  `;
}

function toggleMore(categoryName) {
  const current = sectionVisibleCounts.get(categoryName) || INITIAL_COUNT;
  const filtered = (lastCategory && lastCategory !== 'all' ? searchTerms(lastQuery).filter(t => t.category === lastCategory) : (lastQuery ? searchTerms(lastQuery) : terms));
  const groupedMap = new Map(groupByCategory(filtered));
  const total = groupedMap.get(categoryName)?.length || 0;
  const next = current >= total ? INITIAL_COUNT : Math.min(current + MORE_STEP, total);
  sectionVisibleCounts.set(categoryName, next);
  const section = app.querySelector(`[data-section="${CSS.escape(categoryName)}"]`);
  if (!section) return;
  section.outerHTML = renderCategorySection(categoryName, groupedMap.get(categoryName));
}

function renderDetail(id) {
  const term = terms.find(item => item.id === id);
  const template = document.querySelector('#detailTemplate').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(template);

  const detail = app.querySelector('[data-term-detail]');
  const related = app.querySelector('[data-detail-related]');
  app.querySelector('[data-back]').onclick = () => {
    if (lastQuery || lastCategory) goResults({ query: lastQuery, category: lastCategory });
    else history.back();
  };

  if (!term) {
    detail.innerHTML = `<h1>용어를 찾을 수 없습니다.</h1><p>삭제되었거나 잘못된 주소입니다.</p>`;
    return;
  }

  detail.innerHTML = `
    <div class="term-header">
      <div>
        <h1>${escapeHTML(term.en)}</h1>
        <p class="term-ko">${escapeHTML(term.ko)}</p>
        <span class="term-category">${escapeHTML(term.category)}</span>
      </div>
      <img src="${escapeHTML(term.image)}" alt="${escapeHTML(term.ko)} 예시 이미지" />
    </div>

    <p class="term-summary">${escapeHTML(term.summary)}</p>

    <details class="definition-box" open>
      <summary>What is “${escapeHTML(term.en)}”?</summary>
      <p>${escapeHTML(term.description)}</p>
    </details>

    <section class="detail-card">
      <h2>실무 예시</h2>
      <p>${escapeHTML(term.example)}</p>
    </section>

    <section class="detail-card">
      <h2>개발자와 소통할 때</h2>
      <p>${escapeHTML(term.designerNote)}</p>
    </section>

    <div class="tag-row">
      ${(term.tags || []).map(tag => `<span>${escapeHTML(tag)}</span>`).join('')}
    </div>
  `;

  const relatedTerms = terms.filter(item => item.id !== term.id && item.category === term.category).slice(0, 4);
  related.innerHTML = `
    <h2>같은 카테고리 용어</h2>
    <div class="related-grid">
      ${relatedTerms.map(item => `<button type="button" data-term-id="${escapeHTML(item.id)}">${escapeHTML(item.ko)}<span>${escapeHTML(item.en)}</span></button>`).join('')}
    </div>
  `;
  related.onclick = event => {
    const item = event.target.closest('[data-term-id]');
    if (item) goDetail(item.dataset.termId);
  };
}

function openCategoryModal() {
  const modal = document.querySelector('[data-category-modal]');
  const grid = document.querySelector('[data-modal-category-grid]');
  grid.innerHTML = categories.map(category => `
    <button type="button" data-category="${escapeHTML(category.id)}">
      <span>${escapeHTML(category.icon)}</span>
      <strong>${escapeHTML(category.label)}</strong>
      <em>${category.id === 'all' ? terms.length : terms.filter(term => term.category === category.id).length}개</em>
    </button>
  `).join('');
  modal.hidden = false;
  modal.querySelector('[data-close-category-modal]').focus();

  grid.onclick = event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    closeCategoryModal();
    goResults({ category: button.dataset.category });
  };
}

function closeCategoryModal() {
  document.querySelector('[data-category-modal]').hidden = true;
}

document.querySelector('[data-close-category-modal]').addEventListener('click', closeCategoryModal);
document.querySelector('[data-category-modal]').addEventListener('click', event => {
  if (event.target.matches('[data-category-modal]')) closeCategoryModal();
});

scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
window.addEventListener('scroll', () => scrollTopBtn.classList.toggle('is-visible', window.scrollY > 420));
window.addEventListener('popstate', render);
render();
