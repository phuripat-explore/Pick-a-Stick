(() => {
  const $ = (s) => document.querySelector(s);
  const els = {
    stage: $('#stage'),
    question: $('#question'),
    stick: $('#stick'),
    pickedName: $('#pickedName'),
    cupWrap: $('#cupWrap'),
    peeks: $('#peeks'),
    cupCount: $('#cupCount'),
    countdown: $('#countdown'),
    drawBtn: $('#drawBtn'),
    status: $('#status'),
    names: $('#names'),
    saveBtn: $('#saveBtn'),
    noRepeat: $('#noRepeat'),
    answeredTitle: $('#answeredTitle'),
    answeredList: $('#answeredList'),
    answeredEmpty: $('#answeredEmpty'),
    resetBtn: $('#resetBtn'),
    fullscreenBtn: $('#fullscreenBtn'),
    timerBtns: document.querySelectorAll('.seg button'),
  };

  const STORE_KEY = 'pick-a-stick-v1';
  const TIPS = ['#D9483B', '#3C7DD9', '#4FA866', '#8A5CC9', '#E07B24', '#2BA3A3'];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let state = { names: [], answered: [], question: '', noRepeat: true, timer: 0 };
  let drawing = false;
  let lastPick = null;
  let timerId = null;

  // ---------- Storage (saved in this browser only) ----------
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved) state = { ...state, ...saved };
    } catch (e) { /* storage unavailable, start fresh */ }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // ---------- Helpers ----------
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const parseNames = (text) => text.split(/\r?\n/).map((n) => n.trim()).filter(Boolean);

  function randomIndex(max) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return Math.floor((a[0] / 2 ** 32) * max);
  }

  // Names still in the cup
  function pool() {
    if (!state.noRepeat) return [...state.names];
    const p = [...state.names];
    for (const a of state.answered) {
      const i = p.indexOf(a);
      if (i > -1) p.splice(i, 1);
    }
    return p;
  }

  function setStatus(msg) { els.status.textContent = msg; }

  function fitName() {
    const el = els.stick;
    el.style.fontSize = '';
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth && size > 16) {
      size -= 2;
      el.style.fontSize = size + 'px';
    }
  }

  // ---------- Rendering ----------
  function renderPeeks(n) {
    els.peeks.innerHTML = '';
    const count = Math.min(n, 14);
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'peek';
      const spread = count > 1 ? i / (count - 1) - 0.5 : 0;
      s.style.transform = `translateX(${spread * 90}px) rotate(${spread * 36}deg)`;
      s.style.height = 130 + ((i * 37) % 30) + 'px';
      s.style.setProperty('--tip', TIPS[i % TIPS.length]);
      els.peeks.appendChild(s);
    }
  }

  function render() {
    const left = pool().length;
    els.cupCount.textContent = left;
    renderPeeks(left);

    const allDone = state.names.length > 0 && state.noRepeat && left === 0;
    els.drawBtn.textContent = allDone ? 'Put all sticks back' : 'Draw a name';

    els.answeredTitle.textContent = state.noRepeat ? 'Already answered' : 'Picked so far';
    els.answeredList.innerHTML = '';
    state.answered.forEach((name, i) => {
      const li = document.createElement('li');
      li.append(document.createTextNode(name));
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '×';
      b.setAttribute('aria-label', `Put ${name} back in the cup`);
      b.addEventListener('click', () => {
        state.answered.splice(i, 1);
        save();
        render();
        setStatus(`${name} is back in the cup.`);
      });
      li.append(b);
      els.answeredList.append(li);
    });
    els.answeredEmpty.hidden = state.answered.length > 0;

    if (!state.names.length) {
      els.stick.className = 'stick empty idle';
      els.pickedName.textContent = 'Add names to start';
      els.stick.style.fontSize = '';
    }
  }

  // ---------- Timer ----------
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      o.start();
      o.stop(ctx.currentTime + 0.6);
    } catch (e) { /* no audio */ }
  }
  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
    els.countdown.hidden = true;
  }
  function startTimer(sec) {
    let left = sec;
    els.countdown.classList.remove('done');
    els.countdown.textContent = left;
    els.countdown.hidden = false;
    timerId = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(timerId);
        timerId = null;
        els.countdown.textContent = "Time's up";
        els.countdown.classList.add('done');
        beep();
      } else {
        els.countdown.textContent = left;
      }
    }, 1000);
  }

  // ---------- Actions ----------
  function resetAll() {
    state.answered = [];
    lastPick = null;
    stopTimer();
    save();
    render();
    setStatus('All sticks are back in the cup.');
  }

  async function draw() {
    if (drawing) return;
    if (!state.names.length) {
      setStatus('Add your class list first, one name per line, then press Save list.');
      els.names.focus();
      return;
    }
    let p = pool();
    if (!p.length) { resetAll(); return; }

    // Avoid the same person twice in a row when repeats are allowed
    if (p.length > 1 && lastPick) {
      const others = p.filter((n) => n !== lastPick);
      if (others.length) p = others;
    }
    const pick = p[randomIndex(p.length)];

    drawing = true;
    els.drawBtn.disabled = true;
    stopTimer();
    setStatus('');
    els.stick.className = 'stick';

    if (!reduceMotion) {
      els.cupWrap.classList.add('rattle');
      await wait(900);
      els.cupWrap.classList.remove('rattle');
    }

    els.pickedName.textContent = pick;
    els.stick.style.setProperty('--tip', TIPS[randomIndex(TIPS.length)]);
    els.stick.className = reduceMotion ? 'stick idle' : 'stick show';
    fitName();

    lastPick = pick;
    state.answered.push(pick);
    save();
    render();

    const left = pool().length;
    setStatus(state.noRepeat
      ? `${pick}, your turn! ${left} ${left === 1 ? 'stick' : 'sticks'} left in the cup.`
      : `${pick}, your turn!`);

    drawing = false;
    els.drawBtn.disabled = false;
    if (state.timer) startTimer(state.timer);
  }

  // ---------- Events ----------
  els.drawBtn.addEventListener('click', draw);
  els.resetBtn.addEventListener('click', resetAll);

  els.saveBtn.addEventListener('click', () => {
    state.names = parseNames(els.names.value);
    els.names.value = state.names.join('\n');
    state.answered = state.answered.filter((n) => state.names.includes(n));
    save();
    render();
    if (state.names.length) {
      els.stick.className = 'stick idle';
      els.stick.style.fontSize = '';
      els.pickedName.textContent = 'Who will answer?';
    }
    setStatus(state.names.length ? `Saved ${state.names.length} names.` : 'The class list is empty.');
  });

  els.question.addEventListener('input', () => {
    state.question = els.question.value;
    save();
  });

  els.noRepeat.addEventListener('change', () => {
    state.noRepeat = els.noRepeat.checked;
    save();
    render();
  });

  els.timerBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.timer = Number(btn.dataset.time);
      els.timerBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      if (!state.timer) stopTimer();
      save();
    });
  });

  els.fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (els.stage.requestFullscreen) els.stage.requestFullscreen();
  });
  document.addEventListener('fullscreenchange', () => {
    els.fullscreenBtn.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
  });

  // Space or Enter draws a name (when not typing)
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('textarea, input, button')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      draw();
    }
  });

  window.addEventListener('resize', () => {
    if (els.stick.classList.contains('show') || els.stick.classList.contains('idle')) fitName();
  });

  // ---------- Start ----------
  load();
  els.names.value = state.names.join('\n');
  els.question.value = state.question || '';
  els.noRepeat.checked = state.noRepeat;
  els.timerBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.time) === state.timer)));
  render();
  if (state.names.length) {
    els.stick.className = 'stick idle';
    els.pickedName.textContent = 'Who will answer?';
  } else {
    setStatus('Add your class list on the right to get started.');
  }
})();
