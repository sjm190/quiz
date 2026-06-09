// === AUTH ===
let currentUser = null;

async function handleLogin(event) {
    event.preventDefault();
    const code = document.getElementById('totp-code').value.trim();
    const errorEl = document.getElementById('login-error');

    if (!code) {
        errorEl.textContent = 'Ingresá el código MFA';
        errorEl.classList.remove('hidden');
        return;
    }

    try {
        const res = await fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await res.json();

        if (data.success) {
            currentUser = true;
            sessionStorage.setItem('quiz_auth', 'true');
            errorEl.classList.add('hidden');
            showScreen('menu');
        } else {
            errorEl.textContent = 'Código MFA inválido. Intentá de nuevo.';
            errorEl.classList.remove('hidden');
            document.getElementById('totp-code').value = '';
            document.getElementById('totp-code').focus();
        }
    } catch (err) {
        errorEl.textContent = 'Error de conexión. Intentá de nuevo.';
        errorEl.classList.remove('hidden');
    }
}

function logout() {
    currentUser = null;
    sessionStorage.removeItem('quiz_auth');
    document.getElementById('totp-code').value = '';
    showScreen('login');
}

function checkSession() {
    if (sessionStorage.getItem('quiz_auth')) {
        currentUser = true;
        showScreen('menu');
    }
}

// === QUIZ APP ===
let allQuestions = [];
let quizQuestions = [];
let currentIndex = 0;
let answers = {};
let mode = '';
let timerInterval = null;
let timeLeft = 0;

// Load questions
async function loadQuestions() {
    const res = await fetch('questions.json');
    const data = await res.json();
    allQuestions = data.filter(q => q.options && typeof q.options === 'object' && q.number <= 625);
    document.getElementById('total-questions').textContent = allQuestions.length;
}

// Topics classification
const topics = {
    'Complejidad Organizacional': {
        keywords: ['Organizations', 'SCP', 'multi-cuenta', 'OU', 'organizat', 'centraliz'],
        icon: '🏢'
    },
    'Nuevas Soluciones': {
        keywords: ['diseñar', 'arquitectura', 'nueva', 'implementar', 'serverless', 'Lambda', 'API Gateway'],
        icon: '🆕'
    },
    'Migración y Modernización': {
        keywords: ['migra', 'Direct Connect', 'VPN', 'on-premises', 'instalaciones', 'DataSync', 'DMS', 'Snowball'],
        icon: '🚀'
    },
    'Optimización de Costos': {
        keywords: ['costo', 'cost', 'rentable', 'económic', 'Reserved', 'Spot', 'Savings'],
        icon: '💰'
    },
    'Mejora Continua': {
        keywords: ['mejorar', 'optimiz', 'rendimiento', 'monitor', 'CloudWatch', 'escal', 'Auto Scaling'],
        icon: '🔄'
    },
    'Seguridad': {
        keywords: ['seguridad', 'IAM', 'cifra', 'encrypt', 'WAF', 'Guard', 'KMS', 'SSL', 'TLS', 'firewall'],
        icon: '🔒'
    },
    'Networking': {
        keywords: ['VPC', 'subnet', 'Route 53', 'CloudFront', 'ELB', 'ALB', 'NLB', 'Transit Gateway', 'peering', 'endpoint'],
        icon: '🌐'
    },
    'Almacenamiento': {
        keywords: ['S3', 'EBS', 'EFS', 'Glacier', 'Storage Gateway', 'FSx', 'bucket'],
        icon: '💾'
    },
    'Bases de Datos': {
        keywords: ['RDS', 'Aurora', 'DynamoDB', 'Redshift', 'ElastiCache', 'base de datos', 'database'],
        icon: '🗄️'
    },
    'Contenedores y Serverless': {
        keywords: ['ECS', 'EKS', 'Fargate', 'Lambda', 'contenedor', 'container', 'Docker'],
        icon: '📦'
    }
};

function classifyQuestion(q) {
    const text = (q.question + ' ' + JSON.stringify(q.options)).toLowerCase();
    let matched = [];
    for (const [topic, config] of Object.entries(topics)) {
        for (const kw of config.keywords) {
            if (text.includes(kw.toLowerCase())) {
                matched.push(topic);
                break;
            }
        }
    }
    return matched.length > 0 ? matched : ['Otros'];
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Navigation
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function goToMenu() {
    if (timerInterval) clearInterval(timerInterval);
    showScreen('menu');
}

// EXAM MODE
function startExam() {
    mode = 'exam';
    quizQuestions = shuffle(allQuestions).slice(0, 75);
    currentIndex = 0;
    answers = {};
    timeLeft = 180 * 60;

    document.getElementById('timer').classList.remove('hidden');
    document.getElementById('btn-check').classList.add('hidden');
    document.getElementById('btn-finish').classList.remove('hidden');
    document.getElementById('total-q').textContent = '75';

    startTimer();
    showScreen('quiz');
    renderQuestion();
}

// PRACTICE MODE
function startPractice() {
    mode = 'practice';
    quizQuestions = shuffle(allQuestions).slice(0, 20);
    currentIndex = 0;
    answers = {};

    document.getElementById('timer').classList.add('hidden');
    document.getElementById('btn-check').classList.remove('hidden');
    document.getElementById('btn-finish').classList.add('hidden');
    document.getElementById('total-q').textContent = quizQuestions.length;

    showScreen('quiz');
    renderQuestion();
}

// STUDY MODE
function showStudyTopics() {
    const topicsList = document.getElementById('topics-list');
    topicsList.innerHTML = '';

    const topicCounts = {};
    const topicQuestions = {};
    for (const [topic, config] of Object.entries(topics)) {
        topicCounts[topic] = 0;
        topicQuestions[topic] = [];
    }
    topicCounts['Otros'] = 0;
    topicQuestions['Otros'] = [];

    allQuestions.forEach(q => {
        const cats = classifyQuestion(q);
        cats.forEach(cat => {
            if (!topicCounts[cat]) { topicCounts[cat] = 0; topicQuestions[cat] = []; }
            topicCounts[cat]++;
            topicQuestions[cat].push(q);
        });
    });

    for (const [topic, config] of Object.entries(topics)) {
        if (topicCounts[topic] > 0) {
            const card = document.createElement('div');
            card.className = 'topic-card';
            card.innerHTML = `<h3>${config.icon} ${topic}</h3><p class="count">${topicCounts[topic]} preguntas</p>`;
            card.onclick = () => startStudyTopic(topicQuestions[topic], topic);
            topicsList.appendChild(card);
        }
    }

    showScreen('study-topics');
}

function startStudyTopic(questions, topicName) {
    mode = 'practice';
    quizQuestions = shuffle(questions).slice(0, Math.min(20, questions.length));
    currentIndex = 0;
    answers = {};

    document.getElementById('timer').classList.add('hidden');
    document.getElementById('btn-check').classList.remove('hidden');
    document.getElementById('btn-finish').classList.add('hidden');
    document.getElementById('total-q').textContent = quizQuestions.length;

    showScreen('quiz');
    renderQuestion();
}

// Timer
function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            finishExam();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const h = Math.floor(timeLeft / 3600);
    const m = Math.floor((timeLeft % 3600) / 60);
    const s = timeLeft % 60;
    document.getElementById('timer').textContent = 
        `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

// Render question
function renderQuestion() {
    const q = quizQuestions[currentIndex];
    document.getElementById('current-q').textContent = currentIndex + 1;
    document.getElementById('question-text').textContent = q.question;

    const container = document.getElementById('options-container');
    container.innerHTML = '';

    const optionKeys = Object.keys(q.options).sort();
    optionKeys.forEach(key => {
        const div = document.createElement('div');
        div.className = 'option';
        if (answers[currentIndex] && answers[currentIndex].includes(key)) {
            div.classList.add('selected');
        }
        div.innerHTML = `<div class="option-letter">${key}</div><div class="option-text">${q.options[key]}</div>`;
        div.onclick = () => selectOption(key, div);
        container.appendChild(div);
    });

    if (mode === 'practice' && answers[currentIndex + '_checked']) {
        showCorrectAnswer();
    }

    document.getElementById('btn-prev').disabled = currentIndex === 0;
    
    if (mode === 'exam') {
        document.getElementById('btn-next').classList.toggle('hidden', currentIndex === quizQuestions.length - 1);
    }
}

function selectOption(key, div) {
    const q = quizQuestions[currentIndex];
    const correctAnswer = q.correct_answer;
    const isMultiple = correctAnswer.length > 1 && !correctAnswer.includes(' ');

    if (answers[currentIndex + '_checked']) return;

    if (!answers[currentIndex]) answers[currentIndex] = [];

    if (isMultiple) {
        if (answers[currentIndex].includes(key)) {
            answers[currentIndex] = answers[currentIndex].filter(k => k !== key);
            div.classList.remove('selected');
        } else {
            answers[currentIndex].push(key);
            div.classList.add('selected');
        }
    } else {
        document.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
        answers[currentIndex] = [key];
        div.classList.add('selected');
    }
}

function checkAnswer() {
    if (!answers[currentIndex] || answers[currentIndex].length === 0) return;
    answers[currentIndex + '_checked'] = true;
    showCorrectAnswer();
}

function showCorrectAnswer() {
    const q = quizQuestions[currentIndex];
    const correct = q.correct_answer.split('').filter(c => c.match(/[A-F]/));
    const selected = answers[currentIndex] || [];

    document.querySelectorAll('.option').forEach(div => {
        const letter = div.querySelector('.option-letter').textContent;
        div.onclick = null;
        div.style.cursor = 'default';

        if (correct.includes(letter)) {
            div.classList.add('correct');
            div.classList.remove('selected', 'incorrect');
        } else if (selected.includes(letter)) {
            div.classList.add('incorrect');
            div.classList.remove('selected');
        }
    });
}

function nextQuestion() {
    if (currentIndex < quizQuestions.length - 1) {
        currentIndex++;
        renderQuestion();
    }
}

function prevQuestion() {
    if (currentIndex > 0) {
        currentIndex--;
        renderQuestion();
    }
}

function endQuiz() {
    if (mode === 'exam') {
        if (!confirm('¿Seguro que querés salir? Perderás el progreso.')) return;
    }
    if (timerInterval) clearInterval(timerInterval);
    goToMenu();
}

function finishExam() {
    if (timerInterval) clearInterval(timerInterval);

    let correct = 0;
    let total = quizQuestions.length;

    for (let i = 0; i < total; i++) {
        const q = quizQuestions[i];
        const correctLetters = q.correct_answer.split('').filter(c => c.match(/[A-F]/)).sort().join('');
        const selectedLetters = (answers[i] || []).sort().join('');
        if (correctLetters === selectedLetters) correct++;
    }

    const percentage = Math.round((correct / total) * 100);
    const passed = percentage >= 75;

    const circle = document.getElementById('score-circle');
    circle.className = 'score-circle ' + (passed ? 'score-pass' : 'score-fail');
    circle.textContent = percentage + '%';

    document.getElementById('results-details').innerHTML = `
        <p><strong>${correct}</strong> de <strong>${total}</strong> preguntas correctas</p>
        <p>Resultado: <strong>${passed ? '✅ APROBADO' : '❌ NO APROBADO'}</strong></p>
        <p>Nota de corte: 75%</p>
        <p>Tiempo usado: ${formatTimeUsed()}</p>
    `;

    showScreen('results');
}

function formatTimeUsed() {
    const used = (180 * 60) - timeLeft;
    const m = Math.floor(used / 60);
    const s = used % 60;
    return `${m} min ${s} seg`;
}

// Init
loadQuestions();
checkSession();
