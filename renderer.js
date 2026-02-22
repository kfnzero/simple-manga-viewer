'use strict';

// ──────────────────────────────────────────────
//  Key Bindings Configuration
//  每個動作對應一組按鍵陣列，可自行增減按鍵設定多組快捷鍵
//  Key names follow the KeyboardEvent.key spec:
//  https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values
// ──────────────────────────────────────────────
const keyBindings = {
  panUp: ['w', 'W', 'ArrowUp'],    // 向上移動畫面
  panDown: ['s', 'S', 'ArrowDown'],  // 向下移動畫面
  panLeft: ['a', 'A'],               // 向左移動畫面
  panRight: ['d', 'D'],               // 向右移動畫面
  prevPage: ['ArrowLeft', 'PageUp'],  // 上一頁
  nextPage: ['ArrowRight', 'PageDown'], // 下一頁
  firstPage: ['Home'],
  lastPage: ['End'],
  zoomIn: ['+', '='],               // 放大
  zoomOut: ['-'],                     // 縮小
  toggleFit: ['h', 'H'],               // 切換適合寬度/適合高度
};

const PAN_SPEED = 10; // pixels per animation frame
const ZOOM_STEP = 0.1; // 每次縮放比例
let slideshowTimer = null; // 幻燈片計時器

// 各目錄的側邊欄捲動位置，回到上層時還原
const sidebarScrollPositions = {};

// ── State ──
const state = {
  images: [],
  currentPage: 0,
  fitMode: 'fit-width',    // 'fit-width' | 'fit-height' | 'custom-width'
  customWidth: 800,
  pageMode: 'single',      // 'single' | 'double' | 'webtoon'
  currentDirectory: null,
  isDragging: false,
  dragStartX: 0,
  scrollStartX: 0,
  scrollStartY: 0,
};

function setCurrentPage(page) {
  state.currentPage = page;
  if (state.currentDirectory && state.images && state.images.length > 0) {
    localStorage.setItem(`manga_progress_${state.currentDirectory}`, state.currentPage.toString());
  }
}

// ── DOM Elements ──
const btnOpenDir = document.getElementById('btn-open-dir');
const btnOpenArchive = document.getElementById('btn-open-archive');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnHelp = document.getElementById('btn-help');
const btnCloseHelp = document.getElementById('btn-close-help');
const btnParent = document.getElementById('btn-parent');
const selectFitMode = document.getElementById('select-fit-mode');
const inputCustomWidth = document.getElementById('input-custom-width');
const selectPageMode = document.getElementById('select-page-mode');
const pageIndicator = document.getElementById('page-indicator');
const viewerArea = document.getElementById('viewer-area');
const imageDisplay = document.getElementById('image-display');
const welcomeMessage = document.getElementById('welcome-message');
const helpModal = document.getElementById('help-modal');
const sidebarList = document.getElementById('sidebar-list');
const sidebarTitle = document.getElementById('sidebar-title');
const sidebarResizer = document.getElementById('sidebar-resizer');
const sidebar = document.getElementById('sidebar');
const btnSlideshow = document.getElementById('btn-slideshow');
const inputSlideshowInterval = document.getElementById('input-slideshow-interval');

// ──────────────────────────────────────────────
//  Directory & Image Loading
// ──────────────────────────────────────────────

async function openDirectory() {
  const result = await window.mangaAPI.openDirectory();
  if (result) loadResult(result);
}

async function openArchive() {
  const result = await window.mangaAPI.openArchive();
  if (result) loadResult(result);
}

async function loadDirectoryByPath(dirPath) {
  const result = await window.mangaAPI.loadDirectory(dirPath);
  if (result) loadResult(result);
}

function loadResult(result) {
  if (state.currentDirectory) {
    sidebarScrollPositions[state.currentDirectory] = sidebarList.scrollTop;
  }
  state.images = result.images;

  // 載入該目錄先前的閱讀進度
  const savedProg = localStorage.getItem(`manga_progress_${result.directory}`);
  let page = savedProg ? parseInt(savedProg, 10) || 0 : 0;
  if (page >= state.images.length) page = 0;
  state.currentPage = page;

  state.currentDirectory = result.directory;
  document.title = `${result.directoryName} - Simple Manga Viewer`;
  loadSubdirectories(result.directory);
  setCurrentPage(state.currentPage); // 更新狀態
  renderCurrent();
}

async function loadSubdirectories(dirPath) {
  const entries = await window.mangaAPI.getSubdirectories(dirPath);
  sidebarTitle.textContent = dirPath.split(/[\\/]/).pop() || dirPath;
  sidebarTitle.title = dirPath;
  sidebarList.innerHTML = '';
  entries.forEach((entry) => {
    const item = document.createElement('div');
    item.title = entry.path;
    if (entry.type === 'directory') {
      item.className = 'dir-item';
      item.innerHTML = `<span class="dir-icon">📁</span>${entry.name}`;
      item.addEventListener('click', () => {
        loadDirectoryByPath(entry.path);
        document.querySelectorAll('.dir-item').forEach((el) => el.classList.remove('active'));
        item.classList.add('active');
      });
    } else {
      item.className = 'dir-item file-item';
      item.innerHTML = `<span class="dir-icon">🖼️</span>${entry.name}`;
      item.addEventListener('click', () => {
        const idx = state.images.findIndex((img) => img.path === entry.path);
        if (idx >= 0) {
          setCurrentPage(idx);
          renderCurrent();
        }
        document.querySelectorAll('.dir-item').forEach((el) => el.classList.remove('active'));
        item.classList.add('active');
      });
    }
    sidebarList.appendChild(item);
  });
  if (dirPath in sidebarScrollPositions) {
    sidebarList.scrollTop = sidebarScrollPositions[dirPath];
  }
}

async function goParentDirectory() {
  if (!state.currentDirectory) return;
  const parent = await window.mangaAPI.getParentDirectory(state.currentDirectory);
  if (parent) {
    state.currentDirectory = parent;
    loadSubdirectories(parent);
    const result = await window.mangaAPI.loadDirectory(parent);
    if (result) {
      state.images = result.images;

      const savedProg = localStorage.getItem(`manga_progress_${result.directory}`);
      let page = savedProg ? parseInt(savedProg, 10) || 0 : 0;
      if (page >= state.images.length) page = 0;
      state.currentPage = page;

      document.title = `${result.directoryName} - Simple Manga Viewer`;
      setCurrentPage(state.currentPage);
      renderCurrent();
    }
  }
}

// ──────────────────────────────────────────────
//  Rendering
// ──────────────────────────────────────────────

function renderCurrent() {
  if (state.pageMode === 'webtoon') {
    renderWebtoon();
  } else {
    renderPage();
  }
}

// Paged mode (single / double)
function renderPage() {
  if (state.images.length === 0) {
    imageDisplay.style.display = 'none';
    welcomeMessage.style.display = 'flex';
    pageIndicator.textContent = '0 / 0';
    return;
  }

  welcomeMessage.style.display = 'none';
  imageDisplay.style.display = 'flex';

  const pagesToShow = state.pageMode === 'double' ? 2 : 1;
  const endPage = Math.min(state.currentPage + pagesToShow, state.images.length);
  pageIndicator.textContent = pagesToShow === 1
    ? `${state.currentPage + 1} / ${state.images.length}`
    : `${state.currentPage + 1}–${endPage} / ${state.images.length}`;

  // 套用模糊過渡效果 (不清除舊圖片)
  imageDisplay.classList.add('page-transitioning');

  // 計算需要渲染圖片
  const targetImages = [];
  for (let i = 0; i < pagesToShow; i++) {
    const idx = state.currentPage + i;
    if (idx < state.images.length) {
      targetImages.push(state.images[idx]);
    }
  }

  // 避免連續切換閃爍，稍微等待一幀再開始替換
  requestAnimationFrame(() => {
    let loadedCount = 0;
    const requiredLoad = targetImages.length;

    // 將新圖片換上
    imageDisplay.className = `${state.fitMode} ${state.pageMode === 'double' ? 'double-page' : 'single-page'} page-transitioning`;
    imageDisplay.innerHTML = ''; // 清除舊圖 換上新的(瀏覽器會保留舊畫面直到新圖載入覆蓋)

    if (requiredLoad === 0) {
      imageDisplay.classList.remove('page-transitioning');
      return;
    }

    targetImages.forEach((imgData) => {
      const img = document.createElement('img');
      img.draggable = false;
      applyFitStyle(img, pagesToShow);

      // 當圖片載入完成
      img.onload = () => {
        loadedCount++;
        if (loadedCount === requiredLoad) {
          // 全部載入完畢，解除模糊
          imageDisplay.classList.remove('page-transitioning');
          preloadNextImages();
        }
      };

      // 容錯機制
      img.onerror = () => {
        loadedCount++;
        if (loadedCount === requiredLoad) {
          imageDisplay.classList.remove('page-transitioning');
          preloadNextImages();
        }
      }

      img.src = imgData.url;
      img.alt = imgData.name;
      imageDisplay.appendChild(img);
    });

    viewerArea.scrollTop = 0;
    viewerArea.scrollLeft = 0;
  });
}

// 預載後續圖片以加速閱讀體驗
function preloadNextImages() {
  if (state.images.length === 0 || state.pageMode === 'webtoon') return;
  const step = state.pageMode === 'double' ? 2 : 1;
  const nextIdx = state.currentPage + step;
  if (nextIdx < state.images.length) {
    const img1 = new Image();
    img1.src = state.images[nextIdx].url;
    if (state.pageMode === 'double' && nextIdx + 1 < state.images.length) {
      const img2 = new Image();
      img2.src = state.images[nextIdx + 1].url;
    }
  }
}

// Webtoon mode: render all images in a vertical strip
function renderWebtoon() {
  if (state.images.length === 0) {
    imageDisplay.style.display = 'none';
    welcomeMessage.style.display = 'flex';
    pageIndicator.textContent = '0 / 0';
    return;
  }

  welcomeMessage.style.display = 'none';
  imageDisplay.style.display = 'flex';
  imageDisplay.className = `${state.fitMode} webtoon-mode`;
  imageDisplay.innerHTML = '';

  state.images.forEach((image, idx) => {
    const img = document.createElement('img');
    img.src = image.url;
    img.alt = image.name;
    img.draggable = false;
    img.loading = 'lazy';
    img.dataset.index = String(idx);
    applyFitStyle(img, 1);
    imageDisplay.appendChild(img);
  });

  updatePageIndicator();

  // Restore scroll position to current page
  if (state.currentPage > 0) {
    requestAnimationFrame(() => scrollToImage(state.currentPage, false));
  } else {
    viewerArea.scrollTop = 0;
  }
}

function applyFitStyle(img, pageCount) {
  const vw = viewerArea.clientWidth;
  const vh = viewerArea.clientHeight;
  if (state.fitMode === 'fit-width') {
    img.style.width = `${Math.floor(vw / pageCount)}px`;
    img.style.height = 'auto';
    img.style.maxWidth = 'none';
  } else if (state.fitMode === 'fit-height') {
    img.style.height = `${vh}px`;
    img.style.width = 'auto';
    img.style.maxWidth = 'none';
  } else if (state.fitMode === 'custom-width') {
    img.style.width = `${Math.floor(state.customWidth / pageCount)}px`;
    img.style.height = 'auto';
    img.style.maxWidth = 'none';
  }
}

function updatePageIndicator() {
  pageIndicator.textContent = `${state.currentPage + 1} / ${state.images.length}`;
}

function scrollToImage(index, smooth = true) {
  const imgs = imageDisplay.querySelectorAll('img');
  if (imgs[index]) {
    imgs[index].scrollIntoView({ behavior: smooth ? 'smooth' : 'instant', block: 'start' });
  }
}

// ──────────────────────────────────────────────
//  Navigation
// ──────────────────────────────────────────────

function nextPage() {
  if (state.images.length === 0) return;
  if (state.pageMode === 'webtoon') {
    const next = state.currentPage + 1;
    if (next < state.images.length) {
      setCurrentPage(next);
      updatePageIndicator();
      scrollToImage(next);
    }
    return;
  }
  const step = state.pageMode === 'double' ? 2 : 1;
  if (state.currentPage + step < state.images.length) {
    setCurrentPage(state.currentPage + step);
    renderPage();
  }
}

function prevPage() {
  if (state.images.length === 0) return;
  if (state.pageMode === 'webtoon') {
    const prev = state.currentPage - 1;
    if (prev >= 0) {
      setCurrentPage(prev);
      updatePageIndicator();
      scrollToImage(prev);
    }
    return;
  }
  const step = state.pageMode === 'double' ? 2 : 1;
  setCurrentPage(Math.max(0, state.currentPage - step));
  renderPage();
}

function firstPage() {
  if (state.images.length === 0) return;
  setCurrentPage(0);
  if (state.pageMode === 'webtoon') {
    updatePageIndicator();
    viewerArea.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    renderPage();
  }
}

function lastPage() {
  if (state.images.length === 0) return;
  if (state.pageMode === 'webtoon') {
    setCurrentPage(state.images.length - 1);
    updatePageIndicator();
    scrollToImage(state.currentPage);
  } else if (state.pageMode === 'double') {
    let last = state.images.length - 2;
    if (last < 0) last = 0;
    if (last % 2 !== 0) last = Math.max(0, last - 1);
    setCurrentPage(last);
    renderPage();
  } else {
    setCurrentPage(state.images.length - 1);
    renderPage();
  }
}

// ──────────────────────────────────────────────
//  Hold-to-Pan with requestAnimationFrame
//  WASD + ArrowUp/Down for continuous scrolling;
//  pan keys are defined in keyBindings above.
// ──────────────────────────────────────────────

const heldKeys = new Set();

// Flat set of all pan-related keys for quick lookup
const allPanKeys = new Set([
  ...keyBindings.panUp,
  ...keyBindings.panDown,
  ...keyBindings.panLeft,
  ...keyBindings.panRight,
]);

function panLoop() {
  if (heldKeys.size > 0) {
    let dx = 0;
    let dy = 0;
    if (keyBindings.panUp.some((k) => heldKeys.has(k))) dy -= PAN_SPEED;
    if (keyBindings.panDown.some((k) => heldKeys.has(k))) dy += PAN_SPEED;
    if (keyBindings.panLeft.some((k) => heldKeys.has(k))) dx -= PAN_SPEED;
    if (keyBindings.panRight.some((k) => heldKeys.has(k))) dx += PAN_SPEED;
    if (dx !== 0) viewerArea.scrollLeft += dx;
    if (dy !== 0) viewerArea.scrollTop += dy;
  }
  requestAnimationFrame(panLoop);
}
requestAnimationFrame(panLoop);

// ──────────────────────────────────────────────
//  Keyboard Shortcuts
// ──────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  // Hold-to-pan keys: add to heldKeys and prevent default browser scroll
  if (allPanKeys.has(e.key)) {
    e.preventDefault();
    heldKeys.add(e.key);
  }

  // Single-press actions (skip keyboard auto-repeat)
  if (e.repeat) return;

  if (keyBindings.prevPage.includes(e.key)) {
    e.preventDefault();
    prevPage();
  } else if (keyBindings.nextPage.includes(e.key)) {
    e.preventDefault();
    nextPage();
  } else if (keyBindings.firstPage.includes(e.key)) {
    e.preventDefault();
    firstPage();
  } else if (keyBindings.lastPage.includes(e.key)) {
    e.preventDefault();
    lastPage();
  } else if (keyBindings.zoomIn.includes(e.key)) {
    e.preventDefault();
    zoomIn();
  } else if (keyBindings.zoomOut.includes(e.key)) {
    e.preventDefault();
    zoomOut();
  } else if (keyBindings.toggleFit.includes(e.key)) {
    e.preventDefault();
    toggleFit();
  } else {
    switch (e.key) {
      case '1': setPageMode('single'); break;
      case '2': setPageMode('double'); break;
      case '3': setPageMode('webtoon'); break;
      case 'p':
      case 'P':
        toggleSlideshow();
        break;
      case 'f':
      case 'F':
      case 'F11':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'o':
      case 'O':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          openDirectory();
        }
        break;
      case 'Escape':
        if (helpModal.style.display !== 'none') {
          helpModal.style.display = 'none';
        } else if (document.fullscreenElement) {
          document.exitFullscreen();
        }
        break;
    }
  }
});

document.addEventListener('keyup', (e) => {
  heldKeys.delete(e.key);
});

// Clear held keys when window loses focus (prevents stuck keys)
window.addEventListener('blur', () => heldKeys.clear());

// ──────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────

function setPageMode(mode) {
  state.pageMode = mode;
  selectPageMode.value = mode;
  if (mode === 'double' && state.currentPage % 2 !== 0) {
    setCurrentPage(Math.max(0, state.currentPage - 1));
  }
  renderCurrent();
}

function setFitMode(mode) {
  state.fitMode = mode;
  selectFitMode.value = mode;
  inputCustomWidth.style.display = mode === 'custom-width' ? 'inline-block' : 'none';
  renderCurrent();
}

function zoomIn() {
  const currentImg = imageDisplay.querySelector('img');
  if (!currentImg) return;
  const currentWidth = currentImg.getBoundingClientRect().width;
  state.customWidth = Math.round(currentWidth * (1 + ZOOM_STEP));
  state.fitMode = 'custom-width';
  selectFitMode.value = 'custom-width';
  inputCustomWidth.value = state.customWidth;
  inputCustomWidth.style.display = 'inline-block';
  renderCurrent();
}

function zoomOut() {
  const currentImg = imageDisplay.querySelector('img');
  if (!currentImg) return;
  const currentWidth = currentImg.getBoundingClientRect().width;
  state.customWidth = Math.max(50, Math.round(currentWidth * (1 - ZOOM_STEP)));
  state.fitMode = 'custom-width';
  selectFitMode.value = 'custom-width';
  inputCustomWidth.value = state.customWidth;
  inputCustomWidth.style.display = 'inline-block';
  renderCurrent();
}

function toggleFit() {
  if (state.fitMode === 'fit-width') {
    setFitMode('fit-height');
  } else {
    setFitMode('fit-width');
  }
}

function toggleSlideshow() {
  if (slideshowTimer) {
    stopSlideshow();
  } else {
    startSlideshow();
  }
}

function startSlideshow() {
  if (state.images.length === 0) return;
  const interval = parseInt(inputSlideshowInterval.value, 10) || 500;
  btnSlideshow.textContent = '⏸ 停止';
  btnSlideshow.classList.add('slideshow-active');
  slideshowTimer = setInterval(() => {
    const step = state.pageMode === 'double' ? 2 : 1;
    if (state.currentPage + step < state.images.length) {
      nextPage();
    } else {
      // 播放到最後一頁，自動停止
      stopSlideshow();
    }
  }, interval);
}

function stopSlideshow() {
  if (slideshowTimer) {
    clearInterval(slideshowTimer);
    slideshowTimer = null;
  }
  btnSlideshow.textContent = '▶ 幻燈片';
  btnSlideshow.classList.remove('slideshow-active');
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
  }
}

// ──────────────────────────────────────────────
//  Toolbar Event Listeners
// ──────────────────────────────────────────────

btnOpenDir.addEventListener('click', () => {
  openDirectory();
  btnOpenDir.blur();
});

btnOpenArchive.addEventListener('click', () => {
  openArchive();
  btnOpenArchive.blur();
});
btnPrev.addEventListener('click', () => { prevPage(); btnPrev.blur(); });
btnNext.addEventListener('click', () => { nextPage(); btnNext.blur(); });
btnParent.addEventListener('click', () => { goParentDirectory(); btnParent.blur(); });

selectFitMode.addEventListener('change', () => { setFitMode(selectFitMode.value); selectFitMode.blur(); });

inputCustomWidth.addEventListener('change', () => {
  state.customWidth = parseInt(inputCustomWidth.value, 10) || 800;
  if (state.fitMode === 'custom-width') renderCurrent();
  inputCustomWidth.blur(); // 編輯完畢後取消聚焦
});

// 手動取消 enter 後的 input state (避免連續按下 spacebar 重複觸發
inputCustomWidth.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    inputCustomWidth.blur();
  }
});

selectPageMode.addEventListener('change', () => { setPageMode(selectPageMode.value); selectPageMode.blur(); });

btnSlideshow.addEventListener('click', () => { toggleSlideshow(); btnSlideshow.blur(); });
btnFullscreen.addEventListener('click', () => { toggleFullscreen(); btnFullscreen.blur(); });

btnHelp.addEventListener('click', () => { helpModal.style.display = 'flex'; });
btnCloseHelp.addEventListener('click', () => { helpModal.style.display = 'none'; });
helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) helpModal.style.display = 'none';
});

// ──────────────────────────────────────────────
//  Mouse Wheel: page-turn at boundaries (paged mode only)
// ──────────────────────────────────────────────

viewerArea.addEventListener('wheel', (e) => {
  // In webtoon mode let native scroll handle everything
  if (state.pageMode === 'webtoon') return;

  const atTop = viewerArea.scrollTop <= 0;
  const atBottom = viewerArea.scrollTop + viewerArea.clientHeight >= viewerArea.scrollHeight - 2;

  if (e.deltaY > 0 && atBottom) nextPage();
  else if (e.deltaY < 0 && atTop) prevPage();
});

// ──────────────────────────────────────────────
//  Webtoon: track current page via scroll position
// ──────────────────────────────────────────────

let webtoonScrollTimer = null;

viewerArea.addEventListener('scroll', () => {
  if (state.pageMode !== 'webtoon' || state.images.length === 0) return;
  clearTimeout(webtoonScrollTimer);
  webtoonScrollTimer = setTimeout(updateWebtoonCurrentPage, 80);
});

function updateWebtoonCurrentPage() {
  const imgs = imageDisplay.querySelectorAll('img');
  if (imgs.length === 0) return;

  // Find image whose centre is closest to the viewport centre
  const viewerMid = viewerArea.scrollTop + viewerArea.clientHeight / 2;
  let closestIdx = 0;
  let closestDist = Infinity;

  imgs.forEach((img, idx) => {
    const dist = Math.abs((img.offsetTop + img.clientHeight / 2) - viewerMid);
    if (dist < closestDist) { closestDist = dist; closestIdx = idx; }
  });

  if (closestIdx !== state.currentPage) {
    setCurrentPage(closestIdx);
    updatePageIndicator();
  }
}

// ──────────────────────────────────────────────
//  Mouse Drag to Scroll
// ──────────────────────────────────────────────

viewerArea.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  state.isDragging = true;
  state.dragStartX = e.clientX;
  state.dragStartY = e.clientY;
  state.scrollStartX = viewerArea.scrollLeft;
  state.scrollStartY = viewerArea.scrollTop;
  viewerArea.classList.add('dragging');
});

document.addEventListener('mousemove', (e) => {
  if (!state.isDragging) return;
  viewerArea.scrollLeft = state.scrollStartX - (e.clientX - state.dragStartX);
  viewerArea.scrollTop = state.scrollStartY - (e.clientY - state.dragStartY);
});

document.addEventListener('mouseup', () => {
  if (state.isDragging) {
    state.isDragging = false;
    viewerArea.classList.remove('dragging');
  }
});

// ──────────────────────────────────────────────
//  Sidebar Resizer
// ──────────────────────────────────────────────

let isResizing = false;

sidebarResizer.addEventListener('mousedown', (e) => {
  isResizing = true;
  sidebarResizer.classList.add('resizing');
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const w = e.clientX;
  if (w >= 140 && w <= 450) sidebar.style.width = `${w}px`;
});

document.addEventListener('mouseup', () => {
  if (isResizing) { isResizing = false; sidebarResizer.classList.remove('resizing'); }
});

// ──────────────────────────────────────────────
//  Window Resize
// ──────────────────────────────────────────────

window.addEventListener('resize', () => {
  if (state.images.length > 0) renderCurrent();
});

// ──────────────────────────────────────────────
//  從檔案總管開啟圖片：載入所在目錄並跳到對應頁
// ──────────────────────────────────────────────

async function openFileFromPath(filePath) {
  const dirPath = await window.mangaAPI.getFileDirectory(filePath);
  if (!dirPath) return;
  const result = await window.mangaAPI.loadDirectory(dirPath);
  if (!result) return;
  // 先載入目錄結果並等待側邊欄渲染完成
  if (state.currentDirectory) {
    sidebarScrollPositions[state.currentDirectory] = sidebarList.scrollTop;
  }
  state.images = result.images;
  state.currentPage = 0;
  state.currentDirectory = result.directory;
  document.title = `${result.directoryName} - Simple Manga Viewer`;
  await loadSubdirectories(result.directory);

  // 找到對應圖片並跳到該頁（路徑正規化比對）
  const normalized = filePath.replace(/\//g, '\\');
  const idx = state.images.findIndex((img) => img.path.replace(/\//g, '\\') === normalized);
  if (idx >= 0) {
    setCurrentPage(idx);
    renderCurrent();
    // 捲動側邊欄到對應檔案並高亮
    const fileItems = sidebarList.querySelectorAll('.file-item');
    fileItems.forEach((item) => {
      if (item.title === normalized || item.title.replace(/\//g, '\\') === normalized) {
        document.querySelectorAll('.dir-item').forEach((el) => el.classList.remove('active'));
        item.classList.add('active');
        item.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    });
  } else {
    renderCurrent();
  }
}

// 載入版本資訊到 Help 視窗
window.mangaAPI.getVersion().then((ver) => {
  document.getElementById('app-version').textContent = `Simple Manga Viewer v${ver}`;
});

window.mangaAPI.onMenuOpenDirectory(() => {
  openDirectory();
});

window.mangaAPI.onOpenFile((filePath) => {
  openFileFromPath(filePath);
});

// ──────────────────────────────────────────────
//  Drag and Drop
// ──────────────────────────────────────────────

document.body.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'copy';
});

document.body.addEventListener('dragenter', (e) => {
  e.preventDefault();
  e.stopPropagation();
});

document.body.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
});

document.body.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const filePath = e.dataTransfer.files[0].path;
    handleDroppedFile(filePath);
  }
});

async function handleDroppedFile(filePath) {
  // 嘗試以資料夾方式載入
  const result = await window.mangaAPI.loadDirectory(filePath);
  if (result) {
    loadResult(result);
  } else {
    // 若並非資料夾，則作為檔案直接打開
    openFileFromPath(filePath);
  }
}
