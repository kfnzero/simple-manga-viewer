// State
const state = {
  images: [],
  currentPage: 0,
  fitMode: 'fit-width',     // 'fit-width' | 'fit-height' | 'custom-width'
  customWidth: 800,
  pageMode: 'single',       // 'single' | 'double'
  currentDirectory: null,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  scrollStartX: 0,
  scrollStartY: 0,
};

// DOM Elements
const btnOpen = document.getElementById('btn-open');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
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

// ── Directory & Image Loading ──

async function openDirectory() {
  const result = await window.mangaAPI.openDirectory();
  if (result) {
    loadResult(result);
  }
}

async function loadDirectoryByPath(dirPath) {
  const result = await window.mangaAPI.loadDirectory(dirPath);
  if (result) {
    loadResult(result);
  }
}

function loadResult(result) {
  state.images = result.images;
  state.currentPage = 0;
  state.currentDirectory = result.directory;

  document.title = `${result.directoryName} - Simple Manga Viewer`;

  loadSubdirectories(result.directory);
  renderPage();
}

async function loadSubdirectories(dirPath) {
  const dirs = await window.mangaAPI.getSubdirectories(dirPath);
  sidebarTitle.textContent = dirPath.split(/[\\/]/).pop() || dirPath;
  sidebarTitle.title = dirPath;

  sidebarList.innerHTML = '';
  dirs.forEach((dir) => {
    const item = document.createElement('div');
    item.className = 'dir-item';
    item.innerHTML = `<span class="dir-icon">📁</span>${dir.name}`;
    item.title = dir.path;
    item.addEventListener('click', () => {
      loadDirectoryByPath(dir.path);
      // Highlight active
      document.querySelectorAll('.dir-item').forEach((el) => el.classList.remove('active'));
      item.classList.add('active');
    });
    sidebarList.appendChild(item);
  });
}

async function goParentDirectory() {
  if (!state.currentDirectory) return;
  const parent = await window.mangaAPI.getParentDirectory(state.currentDirectory);
  if (parent) {
    // Reload the sidebar to show parent's subdirectories
    state.currentDirectory = parent;
    loadSubdirectories(parent);

    // Also load images from parent
    const result = await window.mangaAPI.loadDirectory(parent);
    if (result) {
      state.images = result.images;
      state.currentPage = 0;
      document.title = `${result.directoryName} - Simple Manga Viewer`;
      renderPage();
    }
  }
}

// ── Rendering ──

function renderPage() {
  if (state.images.length === 0) {
    imageDisplay.style.display = 'none';
    welcomeMessage.style.display = 'flex';
    pageIndicator.textContent = '0 / 0';
    return;
  }

  welcomeMessage.style.display = 'none';
  imageDisplay.style.display = 'flex';

  // Clear
  imageDisplay.innerHTML = '';

  // Set CSS classes
  imageDisplay.className = '';
  imageDisplay.classList.add(state.fitMode);
  imageDisplay.classList.add(state.pageMode === 'double' ? 'double-page' : 'single-page');

  // Determine which images to show
  const pagesToShow = state.pageMode === 'double' ? 2 : 1;
  const maxPage = state.images.length - 1;

  for (let i = 0; i < pagesToShow; i++) {
    const pageIndex = state.currentPage + i;
    if (pageIndex > maxPage) break;

    const img = document.createElement('img');
    img.src = state.images[pageIndex].url;
    img.alt = state.images[pageIndex].name;
    img.draggable = false;

    applyFitStyle(img);
    imageDisplay.appendChild(img);
  }

  // Update page indicator
  const endPage = Math.min(state.currentPage + pagesToShow, state.images.length);
  if (pagesToShow === 1) {
    pageIndicator.textContent = `${state.currentPage + 1} / ${state.images.length}`;
  } else {
    pageIndicator.textContent = `${state.currentPage + 1}-${endPage} / ${state.images.length}`;
  }

  // Scroll to top of viewer
  viewerArea.scrollTop = 0;
}

function applyFitStyle(img) {
  const viewerRect = viewerArea.getBoundingClientRect();

  if (state.fitMode === 'fit-width') {
    const pageCount = state.pageMode === 'double' ? 2 : 1;
    const availableWidth = viewerRect.width - (pageCount > 1 ? 4 : 0); // gap
    img.style.width = `${Math.floor(availableWidth / pageCount)}px`;
    img.style.height = 'auto';
  } else if (state.fitMode === 'fit-height') {
    img.style.height = `${viewerRect.height}px`;
    img.style.width = 'auto';
  } else if (state.fitMode === 'custom-width') {
    const pageCount = state.pageMode === 'double' ? 2 : 1;
    img.style.width = `${state.customWidth / pageCount}px`;
    img.style.height = 'auto';
  }
}

// ── Navigation ──

function nextPage() {
  if (state.images.length === 0) return;
  const step = state.pageMode === 'double' ? 2 : 1;
  const maxPage = state.images.length - 1;
  if (state.currentPage + step <= maxPage) {
    state.currentPage += step;
    renderPage();
  }
}

function prevPage() {
  if (state.images.length === 0) return;
  const step = state.pageMode === 'double' ? 2 : 1;
  if (state.currentPage - step >= 0) {
    state.currentPage -= step;
  } else {
    state.currentPage = 0;
  }
  renderPage();
}

function firstPage() {
  if (state.images.length === 0) return;
  state.currentPage = 0;
  renderPage();
}

function lastPage() {
  if (state.images.length === 0) return;
  if (state.pageMode === 'double') {
    state.currentPage = Math.max(0, state.images.length - 2);
    // Make it even-aligned
    if (state.currentPage % 2 !== 0) state.currentPage--;
  } else {
    state.currentPage = state.images.length - 1;
  }
  renderPage();
}

function scrollUp() {
  viewerArea.scrollBy({ top: -120, behavior: 'smooth' });
}

function scrollDown() {
  viewerArea.scrollBy({ top: 120, behavior: 'smooth' });
}

// ── Event Listeners ──

// Toolbar buttons
btnOpen.addEventListener('click', openDirectory);
btnPrev.addEventListener('click', prevPage);
btnNext.addEventListener('click', nextPage);
btnParent.addEventListener('click', goParentDirectory);

// Fit mode
selectFitMode.addEventListener('change', () => {
  state.fitMode = selectFitMode.value;
  inputCustomWidth.style.display = state.fitMode === 'custom-width' ? 'inline-block' : 'none';
  renderPage();
});

inputCustomWidth.addEventListener('change', () => {
  state.customWidth = parseInt(inputCustomWidth.value, 10) || 800;
  if (state.fitMode === 'custom-width') renderPage();
});

// Page mode
selectPageMode.addEventListener('change', () => {
  state.pageMode = selectPageMode.value;
  // Align current page for double mode
  if (state.pageMode === 'double' && state.currentPage % 2 !== 0) {
    state.currentPage = Math.max(0, state.currentPage - 1);
  }
  renderPage();
});

// Help modal
btnHelp.addEventListener('click', () => {
  helpModal.style.display = 'flex';
});

btnCloseHelp.addEventListener('click', () => {
  helpModal.style.display = 'none';
});

helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) {
    helpModal.style.display = 'none';
  }
});

// ── Keyboard Shortcuts ──

document.addEventListener('keydown', (e) => {
  // Ignore when typing in input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  switch (e.key) {
    case 'ArrowRight':
    case 'PageDown':
      e.preventDefault();
      nextPage();
      break;
    case 'ArrowLeft':
    case 'PageUp':
      e.preventDefault();
      prevPage();
      break;
    case 'ArrowUp':
      e.preventDefault();
      scrollUp();
      break;
    case 'ArrowDown':
      e.preventDefault();
      scrollDown();
      break;
    case 'Home':
      e.preventDefault();
      firstPage();
      break;
    case 'End':
      e.preventDefault();
      lastPage();
      break;
    case '1':
      state.pageMode = 'single';
      selectPageMode.value = 'single';
      renderPage();
      break;
    case '2':
      state.pageMode = 'double';
      selectPageMode.value = 'double';
      if (state.currentPage % 2 !== 0) {
        state.currentPage = Math.max(0, state.currentPage - 1);
      }
      renderPage();
      break;
    case 'w':
    case 'W':
      state.fitMode = 'fit-width';
      selectFitMode.value = 'fit-width';
      inputCustomWidth.style.display = 'none';
      renderPage();
      break;
    case 'h':
    case 'H':
      state.fitMode = 'fit-height';
      selectFitMode.value = 'fit-height';
      inputCustomWidth.style.display = 'none';
      renderPage();
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
});

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
  }
}

// ── Mouse Wheel Page Navigation ──

viewerArea.addEventListener('wheel', (e) => {
  // If the content is scrollable and we're not at the boundary, let it scroll naturally
  const atTop = viewerArea.scrollTop <= 0;
  const atBottom = viewerArea.scrollTop + viewerArea.clientHeight >= viewerArea.scrollHeight - 2;

  if (e.deltaY > 0 && atBottom) {
    // Scrolling down at bottom -> next page
    nextPage();
  } else if (e.deltaY < 0 && atTop) {
    // Scrolling up at top -> prev page
    prevPage();
  }
});

// ── Mouse Drag to Scroll ──

viewerArea.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // Only left click
  state.isDragging = true;
  state.dragStartX = e.clientX;
  state.dragStartY = e.clientY;
  state.scrollStartX = viewerArea.scrollLeft;
  state.scrollStartY = viewerArea.scrollTop;
  viewerArea.classList.add('dragging');
});

document.addEventListener('mousemove', (e) => {
  if (!state.isDragging) return;
  const dx = e.clientX - state.dragStartX;
  const dy = e.clientY - state.dragStartY;
  viewerArea.scrollLeft = state.scrollStartX - dx;
  viewerArea.scrollTop = state.scrollStartY - dy;
});

document.addEventListener('mouseup', () => {
  if (state.isDragging) {
    state.isDragging = false;
    viewerArea.classList.remove('dragging');
  }
});

// ── Sidebar Resizer ──

let isResizing = false;

sidebarResizer.addEventListener('mousedown', (e) => {
  isResizing = true;
  sidebarResizer.classList.add('resizing');
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const newWidth = e.clientX;
  if (newWidth >= 140 && newWidth <= 450) {
    sidebar.style.width = `${newWidth}px`;
  }
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    sidebarResizer.classList.remove('resizing');
  }
});

// ── Window Resize ──

window.addEventListener('resize', () => {
  if (state.images.length > 0) {
    renderPage();
  }
});
