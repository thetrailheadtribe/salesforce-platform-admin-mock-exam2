// Configuration
const EXAM_DURATION_SECONDS = 105 * 60; // 105 minutes (change as needed)
const QUESTIONS_PER_ATTEMPT = 60; // null = use all; or set a number to sample
let timeLeft = EXAM_DURATION_SECONDS;

// State
let questions = [];
let currentQuestion = 0;
let userAnswers = {}; // { [id]: [indices] }
let timer = null;

// Utility: Fisher-Yates shuffle
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Load and init
async function loadQuestions() {
  const res = await fetch('questions.json');
  const raw = await res.json();

  // Shuffle entire question bank
  let pool = shuffle([...raw]);

  // Optionally sample a subset each attempt
  if (typeof QUESTIONS_PER_ATTEMPT === 'number' && QUESTIONS_PER_ATTEMPT > 0) {
    pool = pool.slice(0, Math.min(QUESTIONS_PER_ATTEMPT, pool.length));
  }

  // Shuffle options within each question
  questions = pool.map(q => {
    // We need to preserve answer indices while shuffling options.
    // Build paired array [{opt, originalIndex}], shuffle, then rebuild options/answers.
    const paired = q.options.map((opt, idx) => ({ opt, idx }));
    shuffle(paired);
    const newOptions = paired.map(p => p.opt);
    const idxMap = new Map(paired.map((p, newIdx) => [p.idx, newIdx]));
    const newAnswers = q.answer.map(originalIdx => idxMap.get(originalIdx));

    return {
      id: q.id,
      question: q.question,
      options: newOptions,
      answer: newAnswers,
      type: q.type // "single" or "multi"
    };
  });

  currentQuestion = 0;
  userAnswers = {};

  renderQuestion();
  updateProgress();
  startTimer();
  updateNavButtons();
}

// Render current question
function renderQuestion() {
  const q = questions[currentQuestion];
  const questionEl = document.getElementById('question');
  const optionsDiv = document.getElementById('options');
  const counterEl = document.getElementById('question-counter');

  questionEl.innerText = q.question;
  counterEl.innerText = `Question ${currentQuestion + 1} of ${questions.length}`;
  optionsDiv.innerHTML = '';

  const saved = userAnswers[q.id] || [];

  q.options.forEach((opt, i) => {
    const inputType = q.type === 'multi' ? 'checkbox' : 'radio';
    const name = `option-${q.id}`;
    const checked = saved.includes(i) ? 'checked' : '';

    const label = document.createElement('label');
    label.className = 'option';
    label.innerHTML = `
      <input type="${inputType}" name="${name}" value="${i}" ${checked} />
      ${opt}
    `;
    optionsDiv.appendChild(label);
  });
}

// Save current selection
function saveAnswer() {
  const q = questions[currentQuestion];
  const name = `option-${q.id}`;
  const selectedNodes = [...document.querySelectorAll(`input[name="${name}"]:checked`)];
  const selectedIndices = selectedNodes.map(el => parseInt(el.value, 10));

  userAnswers[q.id] = selectedIndices;
}

// Navigation
function nextQuestion() {
  saveAnswer();
  if (currentQuestion < questions.length - 1) {
    currentQuestion++;
    renderQuestion();
    updateProgress();
    updateNavButtons();
  }
}

function prevQuestion() {
  saveAnswer();
  if (currentQuestion > 0) {
    currentQuestion--;
    renderQuestion();
    updateProgress();
    updateNavButtons();
  }
}

function updateNavButtons() {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  prevBtn.disabled = currentQuestion === 0;
  nextBtn.disabled = currentQuestion === questions.length - 1;
}

// Progress bar
function updateProgress() {
  const progress = ((currentQuestion + 1) / questions.length) * 100;
  document.getElementById('progress').style.width = `${progress}%`;
}

// Timer
function startTimer() {
  stopTimer(); // ensure no duplicate intervals
  timer = setInterval(() => {
    timeLeft--;

    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const timerEl = document.getElementById('timer');
    timerEl.innerText = `Time Left: ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    // Last 5 minutes red
    if (timeLeft <= 5 * 60) timerEl.classList.add('red'); else timerEl.classList.remove('red');
    // Last 30 seconds bounce
    if (timeLeft <= 30) timerEl.classList.add('bounce'); else timerEl.classList.remove('bounce');

    if (timeLeft <= 0) {
      submitExam(); // auto-submit
    }
  }, 1000);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function pauseTimer() {
  stopTimer();
}

function resumeTimer() {
  if (!timer) startTimer();
}

// Scoring & review
function isCorrect(q) {
  const user = (userAnswers[q.id] || []).slice().sort((a, b) => a - b);
  const ans = q.answer.slice().sort((a, b) => a - b);
  if (user.length !== ans.length) return false;
  for (let i = 0; i < ans.length; i++) {
    if (user[i] !== ans[i]) return false;
  }
  return true;
}

function submitExam() {
  // ensure current saved
  saveAnswer();
  stopTimer();

  let score = 0;
  questions.forEach(q => { if (isCorrect(q)) score++; });

  // Build review page
  const container = document.querySelector('.exam-container');
  container.innerHTML = '';

  const scoreDiv = document.createElement('div');
  scoreDiv.className = 'review-score';
  scoreDiv.innerHTML = `<h2>Your Score: ${score}/${questions.length}</h2>`;
  container.appendChild(scoreDiv);

  questions.forEach((q, idx) => {
    const user = userAnswers[q.id] || [];
    const review = document.createElement('div');
    review.className = 'review-item';

    const header = document.createElement('h3');
    header.innerText = `Question ${idx + 1}: ${q.question}`;
    review.appendChild(header);

    q.options.forEach((opt, i) => {
      const isAns = q.answer.includes(i);
      const selected = user.includes(i);

      const line = document.createElement('div');
      line.className = 'option-line';

      // Classes: correct (always highlight), wrong (if user picked but it's not correct), user-selected (visual marker)
      if (isAns) line.classList.add('correct');
      if (selected && !isAns) line.classList.add('wrong');
      if (selected) line.classList.add('user-selected');

      line.innerText = opt;
      review.appendChild(line);
    });

    // Show user selection summary
    const selSummary = document.createElement('div');
    selSummary.style.marginTop = '8px';
    selSummary.style.color = '#555';
    selSummary.innerHTML = `<small>Your selection: ${user.length ? user.map(i => q.options[i]).join(', ') : 'No selection'}</small>`;
    review.appendChild(selSummary);

    container.appendChild(review);
  });

  // Add restart hint
  const hint = document.createElement('div');
  hint.className = 'review-score';
  hint.innerHTML = `<p>To retake: refresh the page. Questions and options will shuffle on each attempt.</p>`;
  container.appendChild(hint);
}

// Init
window.onload = loadQuestions;
