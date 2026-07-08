import { parseCSV } from './csv.js';

const $ = id => document.getElementById(id);

const els = {
  topbar:    $('fc-topbar'),
  welcome:   $('fc-welcome'),
  study:     $('fc-study'),
  title:     $('fc-title'),
  progress:  $('fc-progress'),
  card:      $('fc-card'),
  frontText: $('fc-front-text'),
  backText:  $('fc-back-text'),
  openBtn:   $('fc-open-btn'),
  fileInput: $('fc-file-input'),
  loadBtn:   $('fc-load-btn'),
  shuffleBtn: $('fc-shuffle-btn'),
  restartBtn: $('fc-restart-btn'),
  prevBtn:   $('fc-prev-btn'),
  flipBtn:   $('fc-flip-btn'),
  nextBtn:   $('fc-next-btn'),
};

let deck = [];    // [{front, back}]
let order = [];   // shuffled/sequential index array into deck
let cursor = 0;
let flipped = false;
let deckName = 'Flashcards';

// ---- file loading ----

function triggerPicker() {
  els.fileInput.value = '';
  els.fileInput.click();
}

async function loadFile(file) {
  if (!file) return;
  const text = await file.text();
  const cards = parseCSV(text);
  if (cards.length === 0) {
    alert('No cards found. Make sure the CSV has two columns: front and back.');
    return;
  }
  deckName = file.name.replace(/\.csv$/i, '');
  deck = cards;
  startStudy(false);
}

els.openBtn.addEventListener('click', triggerPicker);
els.loadBtn.addEventListener('click', triggerPicker);
els.fileInput.addEventListener('change', e => loadFile(e.target.files[0]));

// ---- study session ----

function startStudy(shuffled) {
  order = deck.map((_, i) => i);
  if (shuffled) fisherYates(order);
  cursor = 0;
  flipped = false;

  els.welcome.classList.add('hidden');
  els.topbar.classList.remove('hidden');
  els.study.classList.remove('hidden');
  els.title.textContent = deckName;
  els.shuffleBtn.classList.toggle('active', shuffled);
  render();
}

function render() {
  const { front, back } = deck[order[cursor]];
  els.frontText.textContent = front;
  els.backText.textContent = back;
  els.card.classList.toggle('flipped', flipped);
  els.card.setAttribute('aria-pressed', String(flipped));
  els.progress.textContent = `${cursor + 1} / ${deck.length}`;
  els.prevBtn.disabled = cursor === 0;
  els.nextBtn.disabled = cursor === order.length - 1;
}

function flip() {
  flipped = !flipped;
  els.card.classList.toggle('flipped', flipped);
  els.card.setAttribute('aria-pressed', String(flipped));
}

function go(dir) {
  const next = cursor + dir;
  if (next < 0 || next >= order.length) return;
  cursor = next;
  flipped = false;
  render();
}

// ---- controls ----

els.card.addEventListener('click', flip);
els.card.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
});

let touchStartX = 0;
let touchStartY = 0;
els.card.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].clientX;
  touchStartY = e.changedTouches[0].clientY;
}, { passive: true });
els.card.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  // Ignore taps and vertical scrolls; only handle clear horizontal swipes
  if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
  e.preventDefault(); // suppress the subsequent click (would flip)
  go(dx < 0 ? 1 : -1);
});

els.flipBtn.addEventListener('click', flip);
els.prevBtn.addEventListener('click', () => go(-1));
els.nextBtn.addEventListener('click', () => go(1));

els.shuffleBtn.addEventListener('click', () => {
  const willShuffle = !els.shuffleBtn.classList.contains('active');
  startStudy(willShuffle);
});

els.restartBtn.addEventListener('click', () => {
  startStudy(els.shuffleBtn.classList.contains('active'));
});

document.addEventListener('keydown', e => {
  if (els.study.classList.contains('hidden')) return;
  if      (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft')  go(-1);
  else if (e.key === ' ')          { e.preventDefault(); flip(); }
});

// ---- utils ----

function fisherYates(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
