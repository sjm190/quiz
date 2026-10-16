// =====================================================================
// Quiz multi-certificación AWS (SAP-C02 + SCS-C03)
// JS vanilla, sin dependencias. Ver el diseño en
// security/.agents/tasks/security-quiz-multicert/design.md
// =====================================================================

// === REGISTRO DE CERTIFICACIONES (§8.2) ===
// Su único trabajo es pintar las tarjetas del selector antes de que haya un
// banco cargado, más resolver nombre de archivo y pantalla de menú. Todo dato
// que también exista en meta del JSON es NO autoritativo acá.
const CERTIFICATIONS = {
    'sap-c02': {
        id: 'sap-c02', code: 'SAP-C02', icon: '🏛️',
        name: 'Solutions Architect Professional',
        // Nombre histórico: este archivo está commiteado y referenciado desde
        // antes del soporte multi-certificación. No se renombra (diseño §5.2).
        dataFiles: { practice: 'questions.json' },
        schema: 'legacy-array',
        menuScreen: 'menu',
        contentLanguage: 'es',
        showSelectHint: true,   // ver §8.7 y la decisión del orquestador
        exam: { questions: 75, minutes: 180, passPercent: 75 },
        facts: ['625 preguntas disponibles',
                'Examen real: 75 preguntas / 180 min',
                'Contenido en español']
    },
    'scs-c03': {
        id: 'scs-c03', code: 'SCS-C03', icon: '🔐',
        name: 'Security Specialty',
        dataFiles: {
            practice: 'scs-c03-practica.json',
            study: 'scs-c03-estudio.json'
        },
        schema: 'envelope',
        menuScreen: 'scs-menu',
        contentLanguage: 'en',
        showSelectHint: true,
        exam: null,             // autoritativo: meta.exam del JSON
        // placeholder hasta que scs-c03-estudio.json esté cargado; se refina
        // en showScsStudyFilter()
        studyTotal: 520,
        facts: ['143 preguntas de examen + 520 de estudio',
                '6 dominios oficiales (IAM 20 %, Infra 18 %, Datos 18 %…)',
                'Examen real: 65 preguntas / 170 min / 750 de 1000',
                'Contenido en inglés, interfaz en español']
    }
};

// Último recurso, NO fuente de verdad: sólo cubre el caso de un JSON editado
// o truncado que deja meta.exam inválido y un registro sin exam. La fuente
// real son EXAM_SCS del extractor -> meta.exam (invariante I15).
const EXAM_FALLBACK = {
    questions: 65, minutes: 170, passing_scaled_score: 750,
    scale_min: 100, scale_max: 1000
};

// === MODOS (§8.6) ===
// MODE_CFG declara SI el modo es cronometrado, nunca cuánto dura: la duración
// y el corte salen de examParams() (meta.exam -> registro -> fallback).
const MODE_CFG = {
    'sap-exam': {
        cert: 'sap-c02', screen: 'quiz', timed: true, confirmExit: true,
        showCheck: false, showFinish: true, finishLabel: 'Finalizar Examen',
        hideNextOnLast: true, scoring: 'percent', showExplanation: false
    },
    'sap-practice': {
        cert: 'sap-c02', screen: 'quiz', timed: false, confirmExit: false,
        showCheck: true, showFinish: false, finishLabel: null,
        hideNextOnLast: false, scoring: null, showExplanation: false
    },
    'scs-exam': {
        cert: 'scs-c03', screen: 'quiz', timed: true, confirmExit: true,
        showCheck: false, showFinish: true, finishLabel: 'Finalizar Examen',
        hideNextOnLast: true, scoring: 'scaled', showExplanation: false
    },
    'scs-bank': {
        cert: 'scs-c03', screen: 'quiz', timed: false, confirmExit: false,
        showCheck: true, showFinish: true, finishLabel: 'Ver resultados',
        hideNextOnLast: false, scoring: 'verified', showExplanation: true
    },
    'scs-study': {
        cert: 'scs-c03', screen: 'flashcard', timed: false,
        confirmExit: false, scoring: null
    },
    'scs-reveal': {
        cert: 'scs-c03', screen: 'flashcard', timed: false,
        confirmExit: false, scoring: null
    }
};

// === ESTADO ===
let currentUser = null;
let activeCert = null;
let activeBank = null;          // {meta, questions} del banco de práctica
let studyBank = null;           // {meta, questions} del set de estudio
let allQuestions = [];
let quizQuestions = [];
let currentIndex = 0;
let answers = {};
let mode = '';
let timerInterval = null;
let timeLeft = 0;
let fcItems = [];
let fcIndex = 0;
let fcRevealed = false;
const bankCache = {};           // archivo -> Promise<{meta, questions}>

// =====================================================================
// sessionStorage defensivo (F10, hallazgo 5)
// =====================================================================
let storageWarned = false;

function warnStorage(err) {
    if (storageWarned) return;
    storageWarned = true;
    console.warn('sessionStorage no disponible; la app sigue sin ' +
                 'persistencia', err);
}

function safeGet(key) {
    try { return sessionStorage.getItem(key); }
    catch (err) { warnStorage(err); return null; }
}

function safeSet(key, value) {
    try { sessionStorage.setItem(key, value); return true; }
    catch (err) { warnStorage(err); return false; }
}

function safeDel(key) {
    try { sessionStorage.removeItem(key); return true; }
    catch (err) { warnStorage(err); return false; }
}

// =====================================================================
// AUTH (flujo TOTP intacto)
// =====================================================================
async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value.trim();
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
            body: JSON.stringify({ username, code })
        });
        const data = await res.json();

        if (data.success) {
            currentUser = username || 'Usuario';
            safeSet('quiz_auth', 'true');
            safeSet('quiz_user', currentUser);
            errorEl.classList.add('hidden');
            showScreen('cert-select');
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
    if (timerInterval) clearInterval(timerInterval);
    currentUser = null;
    activeCert = null;
    activeBank = null;
    safeDel('quiz_auth');
    safeDel('quiz_user');
    safeDel('quiz_cert');
    document.getElementById('username').value = '';
    document.getElementById('totp-code').value = '';
    showScreen('login');
}

function checkSession() {
    if (!safeGet('quiz_auth')) return;               // sigue en login
    currentUser = safeGet('quiz_user') || 'Usuario';
    const certId = safeGet('quiz_cert');
    if (isValidCertId(certId)) {
        selectCertification(certId);
    } else {
        safeDel('quiz_cert');                        // V4/F11
        showScreen('cert-select');
    }
}

// =====================================================================
// Funciones puras (§11: no leen document ni el estado global)
// =====================================================================

function isValidCertId(id) {
    return Object.prototype.hasOwnProperty.call(CERTIFICATIONS, id);
}

/** "AC" -> ["A","C"]; tolera basura y devuelve sólo letras A-F ordenadas. */
function normalizeLegacyAnswer(raw) {
    if (typeof raw !== 'string') return [];
    const out = [];
    raw.toUpperCase().split('').forEach(ch => {
        if (/[A-F]/.test(ch) && out.indexOf(ch) === -1) out.push(ch);
    });
    return out.sort();
}

/** Una respuesta multi es correcta sólo si el conjunto coincide exacto (I7). */
function isCorrect(selectedLetters, correctLetters) {
    const sel = selectedLetters || [], cor = correctLetters || [];
    if (sel.length !== cor.length) return false;
    const a = [...sel].sort().join(''), b = [...cor].sort().join('');
    return a === b;
}

/** Puntaje escalado ESTIMADO: AWS no publica su fórmula. */
function scaledScore(correct, total) {
    if (!total) return EXAM_FALLBACK.scale_min;
    return Math.round(100 + (correct / total) * 900);
}

function buildScorablePool(items) {
    return (items || []).filter(q => q.scorable);
}

/**
 * Filtra el set de estudio. Devuelve SIEMPRE un array nuevo, ordenado
 * ascendente por `number` salvo que shuffleFlag sea true.
 */
function filterStudy(items, domain, test, shuffleFlag = false) {
    const d = (domain === 'all' || domain === null || domain === undefined)
        ? null : parseInt(domain, 10);
    const t = (test === 'all' || test === null || test === undefined)
        ? null : parseInt(test, 10);
    const out = (items || []).filter(q =>
        (d === null || isNaN(d) || q.domain === d) &&
        (t === null || isNaN(t) || q.test === t));
    if (shuffleFlag) return shuffle(out);
    return out.slice().sort((a, b) => a.number - b.number);
}

/**
 * Cálculo puro del resultado. finishExam() queda como render puro.
 * -> {correct, total, verified, display, pass, isNaN, detail}
 */
function computeResults(cfg, exam, questions, answers) {
    const items = questions || [];
    const total = items.length;
    const given = answers || {};
    let verified = 0;
    let correct = 0;
    let correctVerified = 0;

    for (let i = 0; i < total; i++) {
        const hit = isCorrect(given[i] || [], items[i].correct);
        if (hit) correct++;
        if (given[i + '_checked']) {
            verified++;
            if (hit) correctVerified++;
        }
    }

    const scoring = cfg && cfg.scoring;

    if (scoring === 'verified') {
        if (verified === 0) {
            return {
                correct: 0, total: total, verified: 0,
                display: '—', pass: null, isNaN: false,
                detail: 'No verificaste ninguna pregunta todavía (0 de ' +
                        total + ').'
            };
        }
        return {
            correct: correctVerified, total: total, verified: verified,
            display: correctVerified + ' de ' + verified + ' verificadas',
            pass: null, isNaN: false,
            detail: Math.round((correctVerified / verified) * 100) +
                    ' % de acierto sobre ' + verified + ' verificadas de ' +
                    total + '.'
        };
    }

    if (scoring === 'scaled') {
        const scaled = scaledScore(correct, total);
        const cut = (exam && exam.passing_scaled_score) ||
                    EXAM_FALLBACK.passing_scaled_score;
        return {
            correct: correct, total: total, verified: verified,
            display: String(scaled), pass: scaled >= cut, isNaN: false,
            detail: 'Puntaje escalado estimado ' + scaled + ' (corte ' +
                    cut + '). AWS no publica su fórmula de escalado.'
        };
    }

    const pct = total ? Math.round((correct / total) * 100) : 0;
    const cutPct = (exam && exam.passPercent) || 75;
    return {
        correct: correct, total: total, verified: verified,
        display: pct + '%', pass: pct >= cutPct, isNaN: false,
        detail: 'Nota de corte: ' + cutPct + '%'
    };
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// =====================================================================
// Carga de datos: perezosa, con adaptador de esquema (§8.4)
// =====================================================================

class HttpError extends Error {
    constructor(file, status) {
        super('HTTP ' + status + ' al pedir ' + file);
        this.status = status;
    }
}

class FormatError extends Error {}

async function loadBank(certId, setName) {
    const cfg = CERTIFICATIONS[certId];
    const file = cfg.dataFiles[setName];
    if (!file) throw new Error('set desconocido: ' + setName);
    if (!bankCache[file]) {
        bankCache[file] = fetchBank(file, cfg)
            .catch(err => { delete bankCache[file]; throw err; });
    }
    return bankCache[file];
}

async function fetchBank(file, cfg) {
    const res = await fetch(file);                        // F1
    if (!res.ok) throw new HttpError(file, res.status);   // F2
    let raw;
    try {
        raw = await res.json();                           // F3
    } catch (err) {
        throw new FormatError('El banco de preguntas está corrupto. ' +
                              'Regenerá los datos.');
    }
    return normalizeBank(raw, cfg);                       // F4/F5/F6
}

const LETTERS = /^[A-F]$/;

function validOptions(options, min) {
    if (!options || typeof options !== 'object') return false;
    const keys = Object.keys(options);
    if (keys.length < min || keys.length > 6) return false;
    return keys.every(k => LETTERS.test(k) &&
                           typeof options[k] === 'string');
}

/** V5: un meta.exam editado no puede producir un timer de NaN segundos. */
function sanitizeExam(exam) {
    if (!exam || typeof exam !== 'object') return null;
    const minutes = exam.minutes;
    const scaled = exam.passing_scaled_score;
    const okMinutes = Number.isInteger(minutes) && minutes >= 1 &&
                      minutes <= 600;
    const okScaled = scaled === undefined ||
                     (Number.isInteger(scaled) && scaled >= 1 &&
                      scaled <= 1000);
    if (!okMinutes || !okScaled) {
        console.warn('meta.exam fuera de rango, se ignora:', exam);
        return null;
    }
    return exam;
}

function normalizeBank(raw, cfg) {
    if (Array.isArray(raw)) return normalizeLegacyBank(raw, cfg);

    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.questions)) {
        throw new FormatError('Formato de datos no reconocido.');
    }
    const meta = raw.meta || {};
    if (meta.schema_version !== 1) {                      // F4
        throw new FormatError('Formato de datos no reconocido (versión de ' +
                              'esquema ' + meta.schema_version + ').');
    }
    meta.exam = sanitizeExam(meta.exam);
    if (meta.set === 'study') return normalizeStudyBank(raw, meta);
    return normalizePracticeBank(raw, meta);
}

function normalizePracticeBank(raw, meta) {
    const out = [];
    let dropped = 0;
    raw.questions.forEach(q => {                          // V1
        const bad = !q || typeof q.id !== 'string' || !q.id ||
            (q.type !== 'mcq' && q.type !== 'hotspot') ||
            typeof q.question !== 'string' || !q.question ||
            q.question.length > 20000 ||
            !Array.isArray(q.correct_answer);
        if (bad) { dropped++; logDropped(q, dropped); return; }

        const correct = q.correct_answer.filter(c => LETTERS.test(c)).sort();
        if (q.type === 'mcq') {
            if (!validOptions(q.options, 2) || !correct.length ||
                !correct.every(c => Object.prototype.hasOwnProperty
                    .call(q.options, c))) {
                dropped++; logDropped(q, dropped); return;
            }
        } else if (q.options && Object.keys(q.options).length) {
            dropped++; logDropped(q, dropped); return;
        }

        const dep = ['none', 'stem', 'options'].indexOf(q.image_dependency) >= 0
            ? q.image_dependency : 'none';
        out.push({
            id: q.id,
            number: typeof q.number === 'number' ? q.number : 0,
            question: q.question,
            options: q.type === 'mcq' ? q.options : {},
            correct: correct,
            type: q.type,
            explanation: typeof q.explanation === 'string'
                ? q.explanation : null,
            answerText: typeof q.answer_text === 'string'
                ? q.answer_text : null,
            hasMissingImages: !!q.has_missing_images,
            imageDependency: dep,
            scorable: typeof q.scorable === 'boolean'
                ? q.scorable : (q.type === 'mcq' && dep !== 'options'),
            selectHint: Number.isInteger(q.select_hint) ? q.select_hint : null
        });
    });
    return finishBank(meta, out, dropped);
}

function normalizeStudyBank(raw, meta) {
    const out = [];
    let dropped = 0;
    raw.questions.forEach(q => {                          // V2
        const bad = !q || typeof q.id !== 'string' || !q.id ||
            !Number.isInteger(q.number) ||
            typeof q.question !== 'string' || !q.question ||
            !Array.isArray(q.answer) || !q.answer.length ||
            !q.answer.every(a => typeof a === 'string');
        if (bad) { dropped++; logDropped(q, dropped); return; }

        let fmt = q.answer_format;
        if (['inline', 'list', 'code', 'text'].indexOf(fmt) === -1) {
            fmt = q.answer.length > 1 ? 'list' : 'inline';
        }
        const domain = Number.isInteger(q.domain) && q.domain >= 1 &&
                       q.domain <= 6 ? q.domain : null;
        out.push({
            id: q.id,
            number: q.number,
            test: Number.isInteger(q.test) && q.test >= 1 && q.test <= 8
                ? q.test : null,
            domain: domain,
            domain_name: domain && typeof q.domain_name === 'string'
                ? q.domain_name : null,
            question: q.question,
            prompt: typeof q.prompt === 'string' ? q.prompt : null,
            answer: q.answer,
            answer_format: fmt,
            explanation: typeof q.explanation === 'string'
                ? q.explanation : null,
            sources: Array.isArray(q.sources)
                ? q.sources.filter(u => typeof u === 'string') : []
        });
    });
    return finishBank(meta, out, dropped);
}

function normalizeLegacyBank(raw, cfg) {
    const out = [];
    let dropped = 0;
    raw.forEach(q => {                                    // V3
        if (!q || !q.options || typeof q.options !== 'object' ||
            !(q.number <= 625)) return;                   // filtro histórico
        if (!validOptions(q.options, 3)) {
            dropped++; logDropped(q, dropped); return;
        }
        const correct = normalizeLegacyAnswer(q.correct_answer);
        if (!correct.length ||
            !correct.every(c => Object.prototype.hasOwnProperty
                .call(q.options, c))) {
            dropped++; logDropped(q, dropped); return;
        }
        out.push({
            id: 'SAP' + q.number,                         // hallazgo 12
            number: q.number,
            question: String(q.question || ''),
            options: q.options,
            correct: correct,
            type: 'mcq',
            explanation: null,
            answerText: null,
            hasMissingImages: false,
            imageDependency: 'none',
            scorable: true,
            selectHint: null
        });
    });
    const meta = {
        schema_version: 0,
        certification: cfg.code,
        set: 'practice-exam',
        content_language: cfg.contentLanguage,
        counts: { total: out.length },
        domains: null,
        exam: null
    };
    return finishBank(meta, out, dropped);
}

function logDropped(q, n) {                               // F5
    if (n <= 20) {
        console.warn('ítem descartado por datos inválidos:',
                     (q && q.id) || (q && q.number) || q);
    } else if (n === 21) {
        console.warn('más de 20 ítems descartados; se deja de listar');
    }
}

function finishBank(meta, questions, dropped) {
    if (!questions.length) {                              // F6
        throw new FormatError('El banco no tiene ninguna pregunta válida.');
    }
    if (meta.counts && typeof meta.counts.total === 'number' &&
        meta.counts.total !== questions.length + dropped) {
        console.warn('meta.counts.total (' + meta.counts.total + ') no ' +
                     'coincide con las preguntas del archivo (' +
                     (questions.length + dropped) + ')');     // F13
    }
    return { meta: meta, questions: questions, dropped: dropped };
}

// =====================================================================
// Navegación y selector de certificación
// =====================================================================

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s =>
        s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    const target = document.querySelector('#' + id + ' [data-focus]');
    if (target) target.focus();
}

function renderCertCards() {
    const host = document.getElementById('cert-cards');
    host.textContent = '';
    Object.keys(CERTIFICATIONS).forEach(certId => {
        const cfg = CERTIFICATIONS[certId];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'card cert-card';
        btn.onclick = () => selectCertification(certId);

        const icon = document.createElement('div');
        icon.className = 'card-icon';
        icon.textContent = cfg.icon;
        const code = document.createElement('h2');
        code.textContent = cfg.code;
        const name = document.createElement('p');
        name.className = 'cert-name';
        name.textContent = cfg.name;
        const list = document.createElement('ul');
        list.className = 'cert-facts';
        list.id = 'facts-' + certId;
        cfg.facts.forEach(f => {
            const li = document.createElement('li');
            li.textContent = f;
            list.appendChild(li);
        });
        btn.setAttribute('aria-describedby', list.id);
        btn.append(icon, code, name, list);
        host.appendChild(btn);
    });
}

function menuErrorNode(cfg) {
    return document.querySelector('#' + cfg.menuScreen + ' .load-error');
}

function setMenuBusy(cfg, busy) {
    document.querySelectorAll('#' + cfg.menuScreen + ' .card')
        .forEach(card => {
            card.disabled = busy;
            card.setAttribute('aria-busy', busy ? 'true' : 'false');
        });
    // El aviso vive en su propio nodo: escribirlo en la .stats-bar borraría
    // el <span id="total-questions"> que vive adentro.
    const note = document.querySelector('#' + cfg.menuScreen + ' .menu-busy');
    if (note) note.classList.toggle('hidden', !busy);
}

function showLoadError(node, cfg, err, retry) {
    if (!node) return;
    node.textContent = '';
    let msg = 'No se pudo cargar el banco de preguntas.';
    if (err instanceof HttpError) {
        msg = 'No se pudo cargar el banco de preguntas (error ' +
              err.status + ').';
    } else if (err instanceof FormatError) {
        msg = err.message;
    }
    node.appendChild(document.createTextNode(msg + ' '));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-retry';
    btn.textContent = 'Reintentar';
    btn.onclick = retry;
    node.appendChild(btn);
    node.classList.remove('hidden');
}

function clearLoadError(node) {
    if (!node) return;
    node.textContent = '';
    node.classList.add('hidden');
}

function updateMenuCounts(cfg, bank) {
    if (cfg.id === 'sap-c02') {
        document.getElementById('total-questions').textContent =
            bank.questions.length;
        return;
    }
    const counts = bank.meta.counts || {};
    const bar = document.getElementById('scs-stats');
    const studyTotal = (studyBank && studyBank.questions.length) ||
                       cfg.studyTotal;
    bar.textContent = bank.questions.length + ' de examen · ' +
        (counts.scorable || buildScorablePool(bank.questions).length) +
        ' puntuables · ' + studyTotal + ' de estudio';
    if (counts.total && counts.total !== bank.questions.length) {
        console.warn('el conteo de meta difiere del banco real');
    }
}

async function selectCertification(certId) {
    const cfg = CERTIFICATIONS[certId];
    if (!cfg) {                                           // F11 / V4
        console.warn('cert desconocida:', certId);
        safeDel('quiz_cert');
        showScreen('cert-select');
        return;
    }
    activeCert = cfg;
    safeSet('quiz_cert', certId);
    clearLoadError(menuErrorNode(cfg));
    showScreen(cfg.menuScreen);
    setMenuBusy(cfg, true);
    try {
        const bank = await loadBank(certId, 'practice');
        activeBank = bank;
        allQuestions = bank.questions;
        updateMenuCounts(cfg, bank);
        setMenuBusy(cfg, false);
    } catch (err) {
        console.error('carga de banco', err);
        const note = document.querySelector('#' + cfg.menuScreen +
                                            ' .menu-busy');
        if (note) note.classList.add('hidden');
        showLoadError(menuErrorNode(cfg), cfg, err,
                      () => selectCertification(cfg.id));
        // los botones de modo quedan deshabilitados: sin datos no se arranca
    }
}

function goToCertSelect() {
    if (timerInterval) clearInterval(timerInterval);
    safeDel('quiz_cert');       // estar en el selector ES el estado persistido
    activeCert = null;
    activeBank = null;
    showScreen('cert-select');
}

function goToMenu() {
    if (timerInterval) clearInterval(timerInterval);
    const cfg = CERTIFICATIONS[safeGet('quiz_cert')] || activeCert ||
                CERTIFICATIONS['sap-c02'];
    showScreen(cfg.menuScreen);
}

/** meta.exam del JSON manda; el registro es fallback; EXAM_FALLBACK último. */
function examParams() {
    const m = activeBank && activeBank.meta && activeBank.meta.exam;
    return m || (activeCert && activeCert.exam) || EXAM_FALLBACK;
}

// =====================================================================
// Clasificación por temas (SAP-C02, sin cambios funcionales)
// =====================================================================
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

// =====================================================================
// Arranque de modos de quiz (§8.6)
// =====================================================================

function startQuizMode(modeKey, questions) {
    const cfg = MODE_CFG[modeKey];
    mode = modeKey;
    quizQuestions = questions;
    currentIndex = 0;
    answers = {};

    const timerEl = document.getElementById('timer');
    const btnCheck = document.getElementById('btn-check');
    const btnFinish = document.getElementById('btn-finish');
    const btnNext = document.getElementById('btn-next');

    if (timerInterval) clearInterval(timerInterval);
    if (cfg.timed) {
        timeLeft = examParams().minutes * 60;
        timerEl.classList.remove('hidden');
        startTimer();
    } else {
        timeLeft = 0;
        timerEl.classList.add('hidden');
    }

    btnCheck.classList.toggle('hidden', !cfg.showCheck);
    btnFinish.classList.toggle('hidden', !cfg.showFinish);
    if (cfg.finishLabel) btnFinish.textContent = cfg.finishLabel;
    // Micro-corrección: hoy startPractice() no restauraba #btn-next, así que
    // quedaba invisible después de un examen terminado en la última pregunta.
    if (!cfg.hideNextOnLast) btnNext.classList.remove('hidden');

    document.getElementById('total-q').textContent = quizQuestions.length;
    showScreen('quiz');
    renderQuestion();
    document.getElementById('question-text').focus();
}

function startExam() {
    startQuizMode('sap-exam', shuffle(allQuestions).slice(0, 75));
}

function startPractice() {
    startQuizMode('sap-practice', shuffle(allQuestions).slice(0, 20));
}

function showStudyTopics() {
    const topicsList = document.getElementById('topics-list');
    topicsList.textContent = '';

    const topicCounts = {};
    const topicQuestions = {};
    for (const topic of Object.keys(topics)) {
        topicCounts[topic] = 0;
        topicQuestions[topic] = [];
    }
    topicCounts['Otros'] = 0;
    topicQuestions['Otros'] = [];

    allQuestions.forEach(q => {
        classifyQuestion(q).forEach(cat => {
            if (!topicQuestions[cat]) {
                topicCounts[cat] = 0; topicQuestions[cat] = [];
            }
            topicCounts[cat]++;
            topicQuestions[cat].push(q);
        });
    });

    for (const [topic, config] of Object.entries(topics)) {
        if (topicCounts[topic] > 0) {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'topic-card';
            const h3 = document.createElement('h3');
            h3.textContent = config.icon + ' ' + topic;
            const p = document.createElement('p');
            p.className = 'count';
            p.textContent = topicCounts[topic] + ' preguntas';
            card.append(h3, p);
            card.onclick = () => startStudyTopic(topicQuestions[topic]);
            topicsList.appendChild(card);
        }
    }

    showScreen('study-topics');
}

function startStudyTopic(questions) {
    startQuizMode('sap-practice',
                  shuffle(questions).slice(0, Math.min(20, questions.length)));
}

function startScsExam() {
    const exam = examParams();
    const pool = buildScorablePool(allQuestions);
    if (pool.length < exam.questions) {                   // F8
        console.warn('sólo hay ' + pool.length + ' preguntas puntuables');
    }
    startQuizMode('scs-exam', shuffle(pool).slice(0, exam.questions));
}

function startScsPractice() {
    startQuizMode('scs-bank', shuffle(buildScorablePool(allQuestions)));
}

function startScsReview() {
    const items = allQuestions.filter(q => !q.scorable);
    mode = 'scs-reveal';
    fcItems = items.map(it => toCard(
        it, it.type === 'hotspot' ? 'hotspot' : 'image-options'));
    fcIndex = 0;
    document.getElementById('fc-heading').textContent =
        '🧩 Repaso: HOTSPOT y preguntas con imagen';
    showScreen('flashcard');
    renderFlashcard();
}

// =====================================================================
// Timer
// =====================================================================

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

function formatTimeUsed(totalMinutes) {
    const used = (totalMinutes * 60) - timeLeft;
    const m = Math.floor(used / 60);
    const s = used % 60;
    return `${m} min ${s} seg`;
}

// =====================================================================
// Aviso de imagen no disponible (§8.9)
// =====================================================================

function renderImgNotice(el, item) {
    if (!el) return;
    if (!item || !item.hasMissingImages) {
        el.classList.add('hidden');
        el.textContent = '';
        return;
    }
    el.textContent = item.imageDependency === 'options'
        ? '⚠ Las opciones de esta pregunta son imágenes que no están ' +
          'disponibles; se muestra sólo como referencia y no se puntúa.'
        : '⚠ Esta pregunta hace referencia a una imagen que no está ' +
          'disponible.';
    el.classList.remove('hidden');
}

// =====================================================================
// Render del quiz (§8.7) — todo con textContent, nunca innerHTML
// =====================================================================

function renderQuestion() {
    const cfg = MODE_CFG[mode] || {};
    const q = quizQuestions[currentIndex];
    document.getElementById('current-q').textContent = currentIndex + 1;
    document.getElementById('question-text').textContent = q.question;

    renderImgNotice(document.getElementById('img-notice'), q);

    const feedback = document.getElementById('answer-feedback');
    feedback.textContent = '';
    feedback.classList.add('hidden');
    const explBox = document.getElementById('answer-explanation');
    explBox.classList.add('hidden');
    explBox.querySelector('.explanation').textContent = '';

    const hint = document.getElementById('select-hint');
    const multi = q.correct.length > 1;
    if (activeCert && activeCert.showSelectHint && multi) {
        hint.textContent = 'Seleccioná ' + q.correct.length + ' opciones';
        hint.classList.remove('hidden');
    } else {
        hint.textContent = '';
        hint.classList.add('hidden');
    }

    const container = document.getElementById('options-container');
    container.querySelectorAll('.option').forEach(n => n.remove());
    const checked = answers[currentIndex] || [];
    const locked = !!answers[currentIndex + '_checked'];

    Object.keys(q.options).sort().forEach(key => {
        const label = document.createElement('label');
        label.className = 'option';
        label.htmlFor = 'opt-' + key;

        const input = document.createElement('input');
        input.type = multi ? 'checkbox' : 'radio';
        input.name = 'answer';
        input.id = 'opt-' + key;
        input.value = key;
        input.checked = checked.includes(key);
        input.disabled = locked;

        const letter = document.createElement('span');
        letter.className = 'option-letter';
        letter.setAttribute('aria-hidden', 'true');
        letter.textContent = key;

        const text = document.createElement('span');
        text.className = 'option-text';
        text.textContent = q.options[key];

        const mark = document.createElement('span');
        mark.className = 'option-mark';

        label.append(input, letter, text, mark);
        container.appendChild(label);
    });

    if (cfg.showCheck && locked) showCorrectAnswer();

    document.getElementById('btn-prev').disabled = currentIndex === 0;
    if (cfg.hideNextOnLast) {
        document.getElementById('btn-next').classList.toggle(
            'hidden', currentIndex === quizQuestions.length - 1);
    }
}

function onOptionChange() {
    if (answers[currentIndex + '_checked']) return;
    const container = document.getElementById('options-container');
    answers[currentIndex] = [...container.querySelectorAll('input:checked')]
        .map(i => i.value);
}

function checkAnswer() {
    if (!answers[currentIndex] || answers[currentIndex].length === 0) return;
    answers[currentIndex + '_checked'] = true;
    showCorrectAnswer();
}

function showCorrectAnswer() {
    const cfg = MODE_CFG[mode] || {};
    const q = quizQuestions[currentIndex];
    const correct = q.correct;
    const selected = answers[currentIndex] || [];

    document.querySelectorAll('#options-container .option').forEach(label => {
        const input = label.querySelector('input');
        const mark = label.querySelector('.option-mark');
        input.disabled = true;
        label.classList.remove('correct', 'incorrect');
        mark.textContent = '';
        if (correct.includes(input.value)) {
            label.classList.add('correct');
            mark.textContent = '✓ Correcta';
        } else if (selected.includes(input.value)) {
            label.classList.add('incorrect');
            mark.textContent = '✗ Tu respuesta';
        }
    });

    const feedback = document.getElementById('answer-feedback');
    feedback.textContent = isCorrect(selected, correct)
        ? 'Correcto'
        : 'Incorrecto. La respuesta correcta es ' + correct.join(' y ') + '.';
    feedback.classList.remove('hidden');

    if (cfg.showExplanation) {
        const box = document.getElementById('answer-explanation');
        const pre = box.querySelector('.explanation');
        if (q.explanation) {
            pre.textContent = q.explanation;
            pre.classList.remove('explanation-empty');
        } else {
            pre.textContent = 'Esta pregunta no trae explicación en la fuente.';
            pre.classList.add('explanation-empty');
        }
        box.classList.remove('hidden');
    }
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
    const cfg = MODE_CFG[mode] || {};
    if (cfg.confirmExit) {
        if (!confirm('¿Seguro que querés salir? Perderás el progreso.')) return;
    }
    if (timerInterval) clearInterval(timerInterval);
    goToMenu();
}

// =====================================================================
// Resultados (§8.11) — finishExam es render puro
// =====================================================================

function finishExam() {
    if (timerInterval) clearInterval(timerInterval);
    const cfg = MODE_CFG[mode] || {};
    const exam = examParams();
    const r = computeResults(cfg, exam, quizQuestions, answers);

    const circle = document.getElementById('score-circle');
    circle.className = 'score-circle' +
        (r.pass === true ? ' score-pass' :
         r.pass === false ? ' score-fail' : '');
    if (r.pass === null) circle.classList.add('score-text');
    circle.textContent = r.display;

    const details = document.getElementById('results-details');
    details.textContent = '';

    if (cfg.scoring === 'verified') {
        details.appendChild(para(r.verified + ' verificadas de ' + r.total));
        details.appendChild(para(r.detail));
    } else {
        const p = document.createElement('p');
        p.append(strong(String(r.correct)), document.createTextNode(' de '),
                 strong(String(r.total)),
                 document.createTextNode(' preguntas correctas'));
        details.appendChild(p);
        const res = document.createElement('p');
        res.append(document.createTextNode('Resultado: '),
                   strong(r.pass ? '✅ APROBADO' : '❌ NO APROBADO'));
        details.appendChild(res);
        details.appendChild(para(r.detail));
    }

    if (cfg.timed) {
        details.appendChild(para('Tiempo usado: ' +
                                 formatTimeUsed(exam.minutes)));
    }

    showScreen('results');
}

function para(text) {
    const p = document.createElement('p');
    p.textContent = text;
    return p;
}

function strong(text) {
    const s = document.createElement('strong');
    s.textContent = text;
    return s;
}

// =====================================================================
// Flashcards y filtros (§8.10)
// =====================================================================

function toCard(item, kind) {
    if (kind === 'study') {
        return {
            badge: item.id + ' · Test #' + (item.test || '?') + ' · ' +
                   (item.domain_name || 'sin dominio'),
            question: item.question,
            prompt: item.prompt || null,
            answer: { type: item.answer_format, values: item.answer },
            explanation: item.explanation || null,
            sources: item.sources || [],
            hasMissingImages: false,
            imageDependency: 'none'
        };
    }
    if (kind === 'hotspot') {
        return {
            badge: item.id + ' · HOTSPOT',
            question: item.question,
            prompt: null,
            answer: {
                type: 'text',
                values: [item.answerText ||
                         'La fuente no trae respuesta para esta pregunta.']
            },
            explanation: item.explanation || null,
            sources: [],
            hasMissingImages: item.hasMissingImages,
            imageDependency: item.imageDependency
        };
    }
    // image-options
    return {
        badge: item.id + ' · opciones con imagen',
        question: item.question,
        prompt: null,
        answer: {
            type: 'options',
            values: Object.keys(item.options).sort().map(k =>
                (item.correct.includes(k) ? '✓ ' : '') + k + '. ' +
                item.options[k])
        },
        explanation: item.explanation || null,
        sources: [],
        hasMissingImages: item.hasMissingImages,
        imageDependency: item.imageDependency
    };
}

async function showScsStudyFilter() {
    const node = document.querySelector('#scs-study-filter .load-error');
    clearLoadError(node);
    const start = document.getElementById('btn-start-study');
    start.disabled = true;
    document.getElementById('filter-count').textContent = 'Cargando banco…';
    showScreen('scs-study-filter');
    try {
        studyBank = await loadBank('scs-c03', 'study');
        populateStudyFilters(studyBank);
        updateFilterCount();
        if (activeCert) updateMenuCounts(activeCert, activeBank);
    } catch (err) {
        console.error('carga del set de estudio', err);
        document.getElementById('filter-count').textContent = '';
        showLoadError(node, CERTIFICATIONS['scs-c03'], err,
                      () => showScsStudyFilter());
    }
}

function populateStudyFilters(bank) {
    const counts = bank.meta.counts || {};
    const domains = bank.meta.domains || {};
    const byDomain = counts.by_domain || {};
    const byTest = counts.by_test || {};

    const dom = document.getElementById('filter-domain');
    dom.textContent = '';
    dom.appendChild(option('all', 'Todos (' + bank.questions.length + ')'));
    Object.keys(domains).sort((a, b) => a - b).forEach(k => {
        const n = byDomain[k] || 0;
        dom.appendChild(option(k, k + ' · ' + domains[k].name +
                                  ' (' + n + ')'));
    });

    const test = document.getElementById('filter-test');
    test.textContent = '';
    test.appendChild(option('all', 'Todos'));
    Object.keys(byTest).sort((a, b) => a - b).forEach(k => {
        test.appendChild(option(k, '#' + k + ' (' + byTest[k] + ')'));
    });
}

function option(value, label) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    return o;
}

function readFilters() {
    const d = document.getElementById('filter-domain').value;
    const t = document.getElementById('filter-test').value;
    return {                                              // V6
        domain: /^[1-6]$/.test(d) ? d : 'all',
        test: /^[1-8]$/.test(t) ? t : 'all',
        shuffle: document.getElementById('filter-shuffle').checked
    };
}

function updateFilterCount() {
    if (!studyBank) return;
    const f = readFilters();
    const n = filterStudy(studyBank.questions, f.domain, f.test).length;
    document.getElementById('filter-count').textContent =
        n + (n === 1 ? ' pregunta' : ' preguntas') + ' con estos filtros';
    document.getElementById('btn-start-study').disabled = n === 0;   // F7
}

function startFlashcards() {
    if (!studyBank) return;
    const f = readFilters();
    const items = filterStudy(studyBank.questions, f.domain, f.test,
                              f.shuffle);
    if (!items.length) return;
    mode = 'scs-study';
    fcItems = items.map(it => toCard(it, 'study'));
    fcIndex = 0;
    document.getElementById('fc-heading').textContent = '📚 Estudio';
    showScreen('flashcard');
    renderFlashcard();
}

function renderFlashcard() {
    const card = fcItems[fcIndex];
    if (!card) return;
    fcRevealed = false;

    document.getElementById('fc-counter').textContent =
        (fcIndex + 1) + '/' + fcItems.length;
    document.getElementById('fc-badge').textContent = card.badge;
    renderImgNotice(document.getElementById('fc-img-notice'), card);
    document.getElementById('fc-question').textContent = card.question;

    const prompt = document.getElementById('fc-prompt');
    if (card.prompt) {
        prompt.textContent = card.prompt;
        prompt.classList.remove('hidden');
    } else {
        prompt.textContent = '';
        prompt.classList.add('hidden');
    }

    document.getElementById('fc-answer-box').classList.add('hidden');
    const reveal = document.getElementById('fc-reveal');
    reveal.classList.remove('hidden');

    document.getElementById('fc-prev').disabled = fcIndex === 0;
    document.getElementById('fc-next').disabled =
        fcIndex === fcItems.length - 1;
    reveal.focus();
}

function revealFlashcard() {
    const card = fcItems[fcIndex];
    if (!card || fcRevealed) return;
    fcRevealed = true;

    const host = document.getElementById('fc-answer');
    host.textContent = '';
    host.appendChild(answerNode(card.answer));

    const explBox = document.getElementById('fc-explanation-box');
    if (card.explanation) {
        const pre = document.createElement('pre');
        pre.className = 'explanation';
        pre.textContent = card.explanation;
        const target = document.getElementById('fc-explanation');
        target.textContent = '';
        target.appendChild(pre);
        explBox.classList.remove('hidden');
    } else {
        explBox.classList.add('hidden');
    }

    const srcBox = document.getElementById('fc-sources-box');
    const list = document.getElementById('fc-sources');
    list.textContent = '';
    if (card.sources && card.sources.length) {
        card.sources.forEach(url => {
            const li = document.createElement('li');
            if (/^https:\/\//.test(url)) {
                const a = document.createElement('a');
                a.href = url;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = url;
                li.appendChild(a);
            } else {
                li.textContent = url;
            }
            list.appendChild(li);
        });
        srcBox.classList.remove('hidden');
    } else {
        srcBox.classList.add('hidden');
    }

    document.getElementById('fc-reveal').classList.add('hidden');
    const box = document.getElementById('fc-answer-box');
    box.classList.remove('hidden');
    box.focus();
}

function answerNode(answer) {
    const values = (answer && answer.values) || [];
    const type = (answer && answer.type) || 'inline';

    if (type === 'code') {
        const pre = document.createElement('pre');
        pre.className = 'answer-code';
        pre.textContent = values[0] || '';
        return pre;
    }
    if (type === 'list' || type === 'options') {
        const list = document.createElement(type === 'list' ? 'ol' : 'ul');
        list.className = 'flashcard-answer';
        values.forEach(v => {
            const li = document.createElement('li');
            li.textContent = v;
            list.appendChild(li);
        });
        return list;
    }
    const p = document.createElement('p');
    p.className = 'flashcard-answer';
    p.textContent = values[0] || '';
    return p;
}

function fcPrev() {
    if (fcIndex > 0) { fcIndex--; renderFlashcard(); }
}

function fcNext() {
    if (fcIndex < fcItems.length - 1) { fcIndex++; renderFlashcard(); }
}

// =====================================================================
// Listeners globales (se registran una sola vez)
// =====================================================================

document.getElementById('options-container')
    .addEventListener('change', onOptionChange);
document.getElementById('filter-domain')
    .addEventListener('change', updateFilterCount);
document.getElementById('filter-test')
    .addEventListener('change', updateFilterCount);

document.addEventListener('keydown', e => {
    if (!document.getElementById('flashcard').classList.contains('active')) {
        return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (/^(SELECT|INPUT|TEXTAREA)$/.test(tag)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); fcPrev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); fcNext(); }
});

// === Init ===
renderCertCards();
checkSession();
