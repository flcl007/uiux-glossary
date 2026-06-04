const terms = window.GLOSSARY_TERMS;
const categories = window.GLOSSARY_CATEGORIES;
const app = document.querySelector('#app');
const scrollTopBtn = document.querySelector('#scrollTopBtn');
const HISTORY_KEY = 'uiuxGlossaryRecentSearches';
const MORE_STEP = 10;
const INITIAL_COUNT = 2;
const SUGGESTION_LIMIT = 5;
let dismissedRelatedSuggestions = new Set();
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
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, SUGGESTION_LIMIT)));
}

function addRecentSearch(query) {
  const q = query.trim();
  if (!q) return;
  const next = [q, ...getRecentSearches().filter(item => item !== q)].slice(0, SUGGESTION_LIMIT);
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
      const fields = [term.ko, term.en, term.category, term.summary, term.description, term.example, term.designerNote, term.source, ...(term.synonyms || []), ...(term.tags || [])];
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
    pool.push(term.ko, term.en, ...(term.synonyms || []), ...(term.tags || []));
  }
  return [...new Set(pool)]
    .filter(item => !dismissedRelatedSuggestions.has(item))
    .filter(item => normalizeText(item).includes(q) || normalizeText(item).includes(q.slice(0, -1)))
    .slice(0, SUGGESTION_LIMIT);
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
  resetPageScroll();
}

function goDetail(id) {
  history.pushState({}, '', `#/term/${encodeURIComponent(id)}`);
  render();
  resetPageScroll();
}

function getRoute() {
  const hash = location.hash || '#/';
  const [path, qs = ''] = hash.slice(1).split('?');
  return { path, params: new URLSearchParams(qs) };
}

function resetPageScroll() {
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
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


function clearInteractiveState() {
  if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
  document.querySelectorAll('.category-item, .modal-category-grid button').forEach(el => el.blur && el.blur());
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
      <span class="category-item__label">전체</span>
    </button>
  `;

  bindSearchBox(form);

  categoryStrip.addEventListener('click', event => {
    const categoryButton = event.target.closest('[data-category]');
    const modalButton = event.target.closest('[data-open-category-modal]');
    if (categoryButton) {
      categoryButton.blur();
      goResults({ category: categoryButton.dataset.category });
    }
    if (modalButton) {
      modalButton.blur();
      openCategoryModal();
    }
  });

  requestAnimationFrame(clearInteractiveState);

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
  const trimmedQuery = query.trim();
  const recent = getRecentSearches().slice(0, SUGGESTION_LIMIT);
  const related = getRelatedSuggestions(query);

  const shouldShowRecent = trimmedQuery.length === 0 && recent.length > 0;
  const shouldShowRelated = trimmedQuery.length > 0 && related.length > 0;
  const shouldShowEmpty = trimmedQuery.length > 0 && related.length === 0;

  panel.classList.toggle('is-open', shouldShowRecent || shouldShowRelated || shouldShowEmpty);
  recentSection.hidden = !shouldShowRecent;
  relatedSection.hidden = !shouldShowRelated;
  empty.hidden = !shouldShowEmpty;

  recentList.innerHTML = recent.map(item => `
    <li>
      <button class="suggest-query" type="button" data-recent-query="${escapeHTML(item)}">${escapeHTML(item)}</button>
      <button class="delete-recent" type="button" data-delete-recent="${escapeHTML(item)}" aria-label="${escapeHTML(item)} 삭제">×</button>
    </li>
  `).join('');

  relatedList.innerHTML = related.map(item => `
    <li>
      <button class="suggest-query" type="button" data-related-query="${escapeHTML(item)}">${escapeHTML(item)}</button>
    </li>
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
      event.stopPropagation();
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

function getTermImages(term) {
  if (Array.isArray(term.images) && term.images.length) return term.images.filter(Boolean);
  if (term.image) return [term.image];
  return [];
}

function parseSources(source) {
  if (!source) return [];
  if (Array.isArray(source)) return source.map(String).map(v => v.trim()).filter(Boolean);
  return String(source)
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function findTermByLooseName(name) {
  const normalized = normalizeText(name);
  if (!normalized) return null;
  return terms.find(term => normalizeText(term.ko) === normalized || normalizeText(term.en) === normalized)
    || terms.find(term => normalizeText(term.ko).includes(normalized) || normalizeText(term.en).includes(normalized));
}

function findTermMentionAtStart(text) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return null;

  const sortedTerms = [...terms].sort((a, b) => {
    const aName = Math.max(String(a.en || '').length, String(a.ko || '').length);
    const bName = Math.max(String(b.en || '').length, String(b.ko || '').length);
    return bName - aName;
  });

  return sortedTerms.find(term => {
    const names = [term.en, term.ko].filter(Boolean);
    return names.some(name => {
      const normalizedName = normalizeText(name);
      return normalizedName && (
        normalizedText === normalizedName ||
        normalizedText.startsWith(`${normalizedName} `)
      );
    });
  }) || null;
}

function parseConfusingText(value) {
  if (!value) return [];

  return String(value)
    .split(/[\n|]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      let rawName = '';
      let description = '';

      if (item.includes(':')) {
        const parts = item.split(':');
        rawName = parts.shift().trim();
        description = parts.join(':').trim();
      } else if (item.includes('：')) {
        const parts = item.split('：');
        rawName = parts.shift().trim();
        description = parts.join('：').trim();
      } else {
        return null;
      }

      const matched = findTermByLooseName(rawName);
      if (!matched || !description) return null;

      return {
        label: matched.ko,
        termId: matched.id,
        description
      };
    })
    .filter(Boolean);
}

const MANUAL_CONFUSING_MAP = {
  'primary-button': ['secondary-button', 'tertiary-button'],
  'secondary-button': ['primary-button', 'tertiary-button'],
  'tertiary-button': ['primary-button', 'secondary-button']
};

function getManualConfusingItems(term) {
  const ids = MANUAL_CONFUSING_MAP[term.id] || [];
  return ids
    .map(id => terms.find(item => item.id === id))
    .filter(Boolean)
    .map(item => ({
      label: item.ko,
      termId: item.id,
      description: item.summary || item.description || ''
    }))
    .filter(item => item.description);
}

function getConfusingItems(term) {
  const manual = getManualConfusingItems(term);
  if (manual.length) return manual;
  return parseConfusingText(term.confusing);
}

function getTermSearchTokens(term) {
  return [
    term.ko,
    term.en,
    term.category,
    ...(term.tags || []),
    ...(term.synonyms || [])
  ].map(normalizeText).filter(Boolean);
}

function getRecommendedTerms(term, confusingItems = []) {
  const confusingIds = new Set(confusingItems.map(item => item.termId).filter(Boolean));
  const currentTokens = new Set(getTermSearchTokens(term));

  return terms
    .filter(item => item.id !== term.id)
    .map(item => {
      let score = 0;
      if (confusingIds.has(item.id)) score += 100;
      if (item.category === term.category) score += 35;
      const itemTokens = getTermSearchTokens(item);
      for (const token of itemTokens) {
        if (currentTokens.has(token)) score += 8;
      }
      if (normalizeText(item.ko).includes(normalizeText(term.ko)) || normalizeText(term.ko).includes(normalizeText(item.ko))) score += 5;
      return { ...item, _recommendScore: score };
    })
    .filter(item => item._recommendScore > 0)
    .sort((a, b) => b._recommendScore - a._recommendScore || a.ko.localeCompare(b.ko, 'ko'))
    .slice(0, 16);
}

function renderImageGallery(term) {
  const images = getTermImages(term);
  const cards = images.length ? images : [''];
  return `
    <section class="detail-image-panel" aria-label="예시 이미지">
      <div class="image-gallery-shell">
        ${images.length > 1 ? '<button class="gallery-nav gallery-nav--prev" type="button" data-gallery-prev aria-label="이전 이미지">‹</button>' : ''}
        <div class="image-gallery" data-image-gallery>
          ${cards.map((src, index) => `
            <figure class="gallery-card ${src ? '' : 'is-empty'}">
              ${src ? `<img src="${escapeHTML(src)}" alt="${escapeHTML(term.ko)} 예시 이미지 ${index + 1}" loading="lazy" onerror="this.closest('.gallery-card').classList.add('is-missing'); this.remove();" />` : ''}
              <div class="image-placeholder">
                <span>예시 이미지 준비 중</span>
                ${src ? `<strong>${escapeHTML(src.split('/').pop() || '')}</strong>` : ''}
              </div>
            </figure>
          `).join('')}
        </div>
        ${images.length > 1 ? '<button class="gallery-nav gallery-nav--next" type="button" data-gallery-next aria-label="다음 이미지">›</button>' : ''}
      </div>
    </section>
  `;
}

function bindImageGallery(scope) {
  const gallery = scope.querySelector('[data-image-gallery]');
  if (!gallery) return;
  const prev = scope.querySelector('[data-gallery-prev]');
  const next = scope.querySelector('[data-gallery-next]');
  const scrollAmount = () => Math.max(240, gallery.clientWidth * 0.92);
  prev?.addEventListener('click', () => gallery.scrollBy({ left: -scrollAmount(), behavior: 'smooth' }));
  next?.addEventListener('click', () => gallery.scrollBy({ left: scrollAmount(), behavior: 'smooth' }));
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
    related.innerHTML = '';
    return;
  }

  const confusingItems = getConfusingItems(term);
  const sourceLinks = parseSources(term.source);

  detail.innerHTML = `
    <div class="detail-split-layout">
      <div class="detail-copy-panel">
        <div class="term-header term-header--xlsx">
          <div>
            <span class="term-category">${escapeHTML(term.category || '')}</span>
            <h1>${escapeHTML(term.ko || '')}</h1>
            <p class="term-ko">${escapeHTML(term.en || '')}</p>
          </div>
        </div>

        <p class="term-summary">${escapeHTML(term.summary || term.description || '')}</p>

        ${term.description ? `
          <section class="detail-card">
            <h2>설명</h2>
            <p>${escapeHTML(term.description)}</p>
          </section>
        ` : ''}

        ${confusingItems.length ? `
          <section class="detail-card">
            <h2>헷갈리기 쉬운 용어/구분</h2>
            <div class="confusing-list">
              ${confusingItems.map(item => `
                <div class="confusing-item">
                  ${item.termId ? `<button type="button" data-term-id="${escapeHTML(item.termId)}">${escapeHTML(item.label)}</button>` : `<span class="confusing-label">${escapeHTML(item.label)}</span>`}
                  <p>${escapeHTML(item.description)}</p>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        ${sourceLinks.length ? `
          <section class="detail-card source-card">
            <h2>참고 출처</h2>
            <div class="source-links">
              ${sourceLinks.map((link, index) => `<a href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">참고 링크 ${index + 1}</a>`).join('')}
            </div>
          </section>
        ` : ''}
      </div>

      ${renderImageGallery(term)}
    </div>
  `;

  bindImageGallery(detail);
  detail.onclick = event => {
    const item = event.target.closest('[data-term-id]');
    if (item) goDetail(item.dataset.termId);
  };

  const relatedTerms = getRecommendedTerms(term, confusingItems);
  related.innerHTML = relatedTerms.length ? `
    <h2>함께 보면 좋은 용어</h2>
    <div class="related-grid related-scroll" aria-label="함께 보면 좋은 용어 목록">
      ${relatedTerms.map(item => `<button type="button" data-term-id="${escapeHTML(item.id)}">${escapeHTML(item.ko)}<span>${escapeHTML(item.en)}</span></button>`).join('')}
    </div>
  ` : '';
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
  modal.classList.add('is-open');
  document.body.classList.add('modal-open');
  modal.querySelector('[data-close-category-modal]').focus();

  grid.onclick = event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    closeCategoryModal();
    goResults({ category: button.dataset.category });
  };
}

function closeCategoryModal() {
  const modal = document.querySelector('[data-category-modal]');
  modal.classList.remove('is-open');
  modal.hidden = true;
  document.body.classList.remove('modal-open');
}

document.querySelector('[data-close-category-modal]').addEventListener('click', closeCategoryModal);
document.querySelector('[data-category-modal]').addEventListener('click', event => {
  if (event.target.matches('[data-category-modal]')) closeCategoryModal();
});

document.addEventListener('pointerdown', event => {
  const openPanel = document.querySelector('.suggest-panel.is-open');
  if (!openPanel) return;
  const ownerForm = openPanel.closest('[data-search-form]');
  if (ownerForm && !ownerForm.contains(event.target)) {
    openPanel.classList.remove('is-open');
  }
});

scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
window.addEventListener('scroll', () => scrollTopBtn.classList.toggle('is-visible', window.scrollY > 420));
window.addEventListener('popstate', () => { render(); requestAnimationFrame(clearInteractiveState); });
window.addEventListener('pageshow', () => requestAnimationFrame(clearInteractiveState));
render();
