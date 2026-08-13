import { firebaseConfig } from './firebase-config.js';
import { CODES, WEEKEND_LETTERS, codeInfo } from './codes.js';
import { parseWorkbookArrayBuffer } from './parser.js';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, setDoc, getDocs, collection, orderBy, query, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (sel) => document.querySelector(sel);

const els = {
  loginBtn: $('#login-btn'),
  logoutBtn: $('#logout-btn'),
  loginModal: $('#login-modal'),
  loginForm: $('#login-form'),
  loginError: $('#login-error'),
  cancelLogin: $('#cancel-login'),
  adminPanel: $('#admin-panel'),
  fileInput: $('#file-input'),
  monthLabel: $('#month-label'),
  publishBtn: $('#publish-btn'),
  publishStatus: $('#publish-status'),
  monthSelect: $('#month-select'),
  legend: $('#legend'),
  cuadrante: $('#cuadrante'),
  pageTitle: $('#page-title'),
  emptyState: $('#empty-state'),
};

let parsedPending = null; // último cuadrante parseado en memoria, pendiente de publicar

// ---------- Autenticación ----------

els.loginBtn.addEventListener('click', () => els.loginModal.showModal());
els.cancelLogin.addEventListener('click', () => els.loginModal.close());

els.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.loginError.textContent = '';
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    els.loginModal.close();
    els.loginForm.reset();
  } catch (err) {
    els.loginError.textContent = 'No se ha podido iniciar sesión. Revisa el correo y la contraseña.';
  }
});

els.logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  const isAdmin = !!user;
  els.loginBtn.hidden = isAdmin;
  els.logoutBtn.hidden = !isAdmin;
  els.adminPanel.hidden = !isAdmin;
});

// ---------- Subida y publicación ----------

els.fileInput.addEventListener('change', async () => {
  const file = els.fileInput.files[0];
  if (!file) return;
  els.publishStatus.textContent = 'Leyendo archivo...';
  try {
    const buf = await file.arrayBuffer();
    parsedPending = parseWorkbookArrayBuffer(buf);
    els.monthLabel.value = guessMonthLabel(file.name);
    els.publishStatus.textContent = `Leído correctamente: ${parsedPending.sections.length} secciones, listo para publicar.`;
    els.publishBtn.disabled = false;
  } catch (err) {
    console.error(err);
    els.publishStatus.textContent = 'No se ha podido leer el archivo. ¿Es un .xls o .xlsx del cuadrante?';
    els.publishBtn.disabled = true;
  }
});

function guessMonthLabel(filename) {
  const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const upper = filename.toUpperCase();
  const found = meses.find((m) => upper.includes(m));
  const year = new Date().getFullYear();
  return found ? `${found.charAt(0)}${found.slice(1).toLowerCase()} ${year}` : '';
}

els.publishBtn.addEventListener('click', async () => {
  if (!parsedPending) return;
  const label = els.monthLabel.value.trim();
  if (!label) {
    els.publishStatus.textContent = 'Ponle un nombre al mes antes de publicar (ej. "Septiembre 2026").';
    return;
  }
  const docId = slugify(label);
  els.publishBtn.disabled = true;
  els.publishStatus.textContent = 'Publicando...';
  try {
    await setDoc(doc(db, 'cuadrantes', docId), {
      label,
      data: parsedPending,
      uploadedAt: serverTimestamp(),
    });
    els.publishStatus.textContent = `Publicado como "${label}". El grupo ya puede verlo.`;
    await loadMonthList();
    els.monthSelect.value = docId;
    await loadMonth(docId);
  } catch (err) {
    console.error(err);
    els.publishStatus.textContent = 'Error al publicar. Revisa las reglas de Firestore y tu conexión.';
  } finally {
    els.publishBtn.disabled = false;
  }
});

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
}

// ---------- Selector de mes y render ----------

els.monthSelect.addEventListener('change', () => {
  if (els.monthSelect.value) loadMonth(els.monthSelect.value);
});

async function loadMonthList() {
  const snap = await getDocs(query(collection(db, 'cuadrantes'), orderBy('uploadedAt', 'desc')));
  els.monthSelect.innerHTML = '';
  if (snap.empty) {
    els.monthSelect.hidden = true;
    return null;
  }
  els.monthSelect.hidden = false;
  let first = null;
  snap.forEach((d) => {
    if (!first) first = d.id;
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.data().label;
    els.monthSelect.appendChild(opt);
  });
  return first;
}

async function loadMonth(docId) {
  const snap = await getDocs(query(collection(db, 'cuadrantes'), orderBy('uploadedAt', 'desc')));
  const target = snap.docs.find((d) => d.id === docId);
  if (!target) return;
  render(target.data());
}

function render(monthDoc) {
  els.emptyState.hidden = true;
  els.pageTitle.textContent = `${monthDoc.data.title} — ${monthDoc.label}`;
  renderLegend();
  els.cuadrante.innerHTML = '';
  monthDoc.data.sections.forEach((section) => els.cuadrante.appendChild(renderSection(section)));
}

function renderLegend() {
  els.legend.innerHTML = '';
  Object.entries(CODES).forEach(([code, info]) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.style.background = info.color;
    chip.style.color = info.text;
    chip.textContent = `${code} · ${info.label}`;
    els.legend.appendChild(chip);
  });
}

function renderSection(section) {
  const card = document.createElement('section');
  card.className = 'section-card';

  const h2 = document.createElement('h2');
  h2.textContent = section.name;
  card.appendChild(h2);

  const table = document.createElement('table');
  table.className = 'grid';

  // Cabecera: número de día
  const theadDays = document.createElement('tr');
  theadDays.appendChild(th(''));
  section.dayNumbers.forEach((d, i) => {
    const cell = th(String(d));
    if (WEEKEND_LETTERS.has(section.weekdays[i])) cell.classList.add('weekend');
    theadDays.appendChild(cell);
  });
  table.appendChild(theadDays);

  // Cabecera: letra del día de la semana
  const theadWeek = document.createElement('tr');
  theadWeek.appendChild(th(''));
  section.weekdays.forEach((w) => {
    const cell = th(w || '');
    cell.classList.add('weekday-row');
    if (WEEKEND_LETTERS.has(w)) cell.classList.add('weekend');
    theadWeek.appendChild(cell);
  });
  table.appendChild(theadWeek);

  // Fila de turno base del grupo (si existe)
  if (section.groupShift) {
    const row = document.createElement('tr');
    row.className = 'group-shift-row';
    row.appendChild(th('Turno del grupo'));
    section.groupShift.forEach((code, i) => {
      row.appendChild(td(code, WEEKEND_LETTERS.has(section.weekdays[i])));
    });
    table.appendChild(row);
  }

  // Filas de personas
  section.people.forEach((person) => {
    const row = document.createElement('tr');
    const nameCell = document.createElement('th');
    nameCell.scope = 'row';
    nameCell.className = 'person-name';
    nameCell.textContent = person.name;
    row.appendChild(nameCell);

    person.shifts.forEach((code, i) => {
      const effective = code || (section.groupShift ? section.groupShift[i] : null);
      const inherited = !code && !!effective;
      row.appendChild(td(effective, WEEKEND_LETTERS.has(section.weekdays[i]), inherited));
    });
    table.appendChild(row);
  });

  card.appendChild(table);
  return card;
}

function th(text) {
  const el = document.createElement('th');
  el.textContent = text;
  return el;
}

function td(code, isWeekend, inherited) {
  const el = document.createElement('td');
  if (isWeekend) el.classList.add('weekend');
  if (!code) {
    el.textContent = '–';
    el.classList.add('empty');
    return el;
  }
  const info = codeInfo(code);
  const chip = document.createElement('span');
  chip.className = 'chip cell-chip' + (inherited ? ' inherited' : '');
  chip.style.background = info.color;
  chip.style.color = info.text;
  chip.textContent = code;
  chip.title = info.label + (inherited ? ' (turno del grupo)' : '');
  el.appendChild(chip);
  return el;
}

// ---------- Arranque ----------

(async function init() {
  const firstId = await loadMonthList();
  if (firstId) {
    els.monthSelect.value = firstId;
    await loadMonth(firstId);
  } else {
    els.emptyState.hidden = false;
  }
})();
