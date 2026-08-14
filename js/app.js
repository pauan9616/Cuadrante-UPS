import { firebaseConfig } from './firebase-config.js';
import { CODES, WEEKEND_LETTERS, codeInfo } from './codes.js';
import { parseWorkbookArrayBuffer } from './parser.js';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, setDoc, updateDoc, getDoc, getDocs, collection, serverTimestamp,
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
  overwriteSelect: $('#overwrite-select'),
  overwriteHint: $('#overwrite-hint'),
  editModeBtn: $('#edit-mode-btn'),
  legend: $('#legend'),
  cuadrante: $('#cuadrante'),
  pageTitle: $('#page-title'),
  emptyState: $('#empty-state'),
  saveBar: $('#save-bar'),
  saveBarText: $('#save-bar-text'),
  saveBtn: $('#save-btn'),
  discardBtn: $('#discard-btn'),
  cellEditModal: $('#cell-edit-modal'),
  cellEditTitle: $('#cell-edit-title'),
  cellEditOptions: $('#cell-edit-options'),
  cellEditCancel: $('#cell-edit-cancel'),
  exportPdfBtn: $('#export-pdf-btn'),
};

const MES_NOMBRES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

let parsedPending = null;      // cuadrante recién leído del Excel, pendiente de publicar
let monthsCache = [];          // [{id, label, year, month}]
let currentDocId = null;       // id del mes actualmente mostrado
let currentMonthDoc = null;    // { label, data:{title,sections} } - copia editable en memoria
let editMode = false;
let dirty = false;
let pendingEditCtx = null;     // {sectionIndex, personIndex, dayIndex} durante el diálogo de edición
els.saveBar.style.display = 'none'; // estado inicial: sin cambios pendientes

// ---------- Utilidades de mes ----------

function parseMonthInfo(label) {
  const upper = (label || '').toUpperCase();
  const monthIdx = MES_NOMBRES.findIndex((m) => upper.includes(m));
  const yearMatch = upper.match(/\d{4}/);
  return {
    month: monthIdx >= 0 ? monthIdx + 1 : null,
    year: yearMatch ? Number(yearMatch[0]) : null,
  };
}

function guessMonthLabel(filename) {
  const upper = filename.toUpperCase();
  const found = MES_NOMBRES.find((m) => upper.includes(m));
  const year = new Date().getFullYear();
  return found ? `${found.charAt(0)}${found.slice(1).toLowerCase()} ${year}` : '';
}

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
}

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

els.logoutBtn.addEventListener('click', () => {
  if (dirty && !confirm('Tienes cambios sin guardar. ¿Salir de todas formas?')) return;
  signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  const isAdmin = !!user;
  els.loginBtn.hidden = isAdmin;
  els.logoutBtn.hidden = !isAdmin;
  els.adminPanel.hidden = !isAdmin;
  els.editModeBtn.disabled = !isAdmin || !currentDocId;
  if (!isAdmin) {
    editMode = false;
    setDirty(false);
    reRender();
  }
});

// ---------- Subida y publicación ----------

els.fileInput.addEventListener('change', async () => {
  const file = els.fileInput.files[0];
  if (!file) return;
  els.publishStatus.textContent = 'Leyendo archivo...';
  try {
    const buf = await file.arrayBuffer();
    parsedPending = parseWorkbookArrayBuffer(buf);
    const guessedLabel = guessMonthLabel(file.name);
    els.monthLabel.value = guessedLabel;

    // ¿Coincide con un mes ya publicado? Lo preseleccionamos en el desplegable de sustitución.
    const guessedSlug = slugify(guessedLabel);
    const match = monthsCache.find((m) => m.id === guessedSlug);
    els.overwriteSelect.value = match ? match.id : '';
    updateOverwriteHint();

    els.publishStatus.textContent = `Leído correctamente: ${parsedPending.sections.length} secciones, listo para publicar.`;
    els.publishBtn.disabled = false;
  } catch (err) {
    console.error(err);
    els.publishStatus.textContent = 'No se ha podido leer el archivo. ¿Es un .xls o .xlsx del cuadrante?';
    els.publishBtn.disabled = true;
  }
});

els.overwriteSelect.addEventListener('change', () => {
  const selected = monthsCache.find((m) => m.id === els.overwriteSelect.value);
  if (selected) els.monthLabel.value = selected.label;
  updateOverwriteHint();
});

function updateOverwriteHint() {
  if (els.overwriteSelect.value) {
    const m = monthsCache.find((x) => x.id === els.overwriteSelect.value);
    els.overwriteHint.hidden = false;
    els.overwriteHint.textContent = `⚠️ Esto sustituirá el cuadrante ya publicado de "${m ? m.label : ''}".`;
  } else {
    els.overwriteHint.hidden = true;
  }
}

els.publishBtn.addEventListener('click', async () => {
  if (!parsedPending) return;
  const label = els.monthLabel.value.trim();
  if (!label) {
    els.publishStatus.textContent = 'Ponle un nombre al mes antes de publicar (ej. "Septiembre 2026").';
    return;
  }

  let docId = els.overwriteSelect.value || slugify(label);

  // Salvaguarda: si el slug coincide con un mes existente que NO se seleccionó a propósito, confirmar.
  const collision = !els.overwriteSelect.value && monthsCache.find((m) => m.id === docId);
  if (collision) {
    const ok = confirm(`Ya existe un cuadrante publicado como "${collision.label}". ¿Quieres sustituirlo por este archivo?`);
    if (!ok) return;
  }

  const { month, year } = parseMonthInfo(label);

  els.publishBtn.disabled = true;
  els.publishStatus.textContent = 'Publicando...';
  try {
    await setDoc(doc(db, 'cuadrantes', docId), {
      label,
      month,
      year,
      data: parsedPending,
      uploadedAt: serverTimestamp(),
    });
    els.publishStatus.textContent = `Publicado como "${label}". El grupo ya puede verlo.`;
    parsedPending = null;
    els.fileInput.value = '';
    els.overwriteSelect.value = '';
    updateOverwriteHint();
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

// ---------- Selector de mes ----------

els.monthSelect.addEventListener('change', async () => {
  if (dirty && !confirm('Tienes cambios sin guardar en este mes. ¿Cambiar de mes sin guardarlos?')) {
    els.monthSelect.value = currentDocId;
    return;
  }
  if (els.monthSelect.value) await loadMonth(els.monthSelect.value);
});

async function loadMonthList() {
  const snap = await getDocs(collection(db, 'cuadrantes'));
  monthsCache = [];
  snap.forEach((d) => {
    const data = d.data();
    let { month, year } = data;
    if (!month || !year) {
      const parsed = parseMonthInfo(data.label);
      month = month || parsed.month;
      year = year || parsed.year;
    }
    monthsCache.push({ id: d.id, label: data.label, month: month || 0, year: year || 0 });
  });
  monthsCache.sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month));

  els.monthSelect.innerHTML = '';
  els.overwriteSelect.innerHTML = '<option value="">Mes nuevo</option>';

  if (monthsCache.length === 0) {
    els.monthSelect.hidden = true;
    return null;
  }
  els.monthSelect.hidden = false;
  monthsCache.forEach((m) => {
    const opt1 = document.createElement('option');
    opt1.value = m.id;
    opt1.textContent = m.label;
    els.monthSelect.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = m.id;
    opt2.textContent = m.label;
    els.overwriteSelect.appendChild(opt2);
  });
  return monthsCache[0].id;
}

async function loadMonth(docId) {
  const snap = await getDoc(doc(db, 'cuadrantes', docId));
  if (!snap.exists()) return;
  currentDocId = docId;
  currentMonthDoc = JSON.parse(JSON.stringify(snap.data())); // copia editable
  setDirty(false);
  editMode = false;
  els.editModeBtn.disabled = !auth.currentUser;
  updateEditModeBtn();
  render(currentMonthDoc);
}

// ---------- Edición manual ----------

els.editModeBtn.addEventListener('click', () => {
  editMode = !editMode;
  updateEditModeBtn();
  reRender();
});

function updateEditModeBtn() {
  els.editModeBtn.textContent = editMode ? 'Desactivar edición manual' : 'Activar edición manual';
  els.editModeBtn.classList.toggle('active', editMode);
}

function setDirty(value) {
  dirty = value;
  els.saveBar.style.display = value ? 'flex' : 'none';
  if (value) els.saveBarText.textContent = 'Tienes cambios sin guardar';
}

els.discardBtn.addEventListener('click', async () => {
  if (!currentDocId) return;
  await loadMonth(currentDocId);
});

els.saveBtn.addEventListener('click', async () => {
  if (!currentDocId || !currentMonthDoc) return;
  els.saveBtn.disabled = true;
  els.saveBarText.textContent = 'Guardando...';

  const timeoutMs = 12000;
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
  );

  try {
    await Promise.race([
      updateDoc(doc(db, 'cuadrantes', currentDocId), {
        data: currentMonthDoc.data,
        updatedAt: serverTimestamp(),
      }),
      timeout,
    ]);
    setDirty(false);
  } catch (err) {
    console.error(err);
    if (err.message === 'TIMEOUT') {
      els.saveBarText.textContent = 'Está tardando demasiado (sin conexión o bloqueado). Pulsa Guardar para reintentar.';
    } else {
      els.saveBarText.textContent = `Error al guardar: ${err.code || err.message || 'desconocido'}`;
    }
  } finally {
    els.saveBtn.disabled = false;
  }
});

els.cellEditCancel.addEventListener('click', () => {
  pendingEditCtx = null;
  els.cellEditModal.close();
});

function openCellEditor(sectionIndex, personIndex, dayIndex) {
  const section = currentMonthDoc.data.sections[sectionIndex];
  const person = section.people[personIndex];
  const currentCode = person.shifts[dayIndex];

  pendingEditCtx = { sectionIndex, personIndex, dayIndex };
  els.cellEditTitle.textContent = `${person.name} — día ${section.dayNumbers[dayIndex]}`;
  els.cellEditOptions.innerHTML = '';

  if (section.groupShift) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'code-option-btn clear-option' + (!currentCode ? ' selected' : '');
    clearBtn.textContent = `Seguir turno del grupo (${section.groupShift[dayIndex] || '–'})`;
    clearBtn.addEventListener('click', () => applyCellEdit(null));
    els.cellEditOptions.appendChild(clearBtn);
  }

  Object.entries(CODES).forEach(([code, info]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-option-btn' + (currentCode === code ? ' selected' : '');
    btn.style.background = info.color;
    btn.style.color = info.text;
    btn.textContent = `${code} · ${info.label}`;
    btn.addEventListener('click', () => applyCellEdit(code));
    els.cellEditOptions.appendChild(btn);
  });

  els.cellEditModal.showModal();
}

function applyCellEdit(value) {
  if (!pendingEditCtx) return;
  const { sectionIndex, personIndex, dayIndex } = pendingEditCtx;
  currentMonthDoc.data.sections[sectionIndex].people[personIndex].shifts[dayIndex] = value;
  pendingEditCtx = null;
  els.cellEditModal.close();
  setDirty(true);
  reRender();
}

function reRender() {
  if (currentMonthDoc) render(currentMonthDoc);
}

// ---------- Exportar a PDF ----------

els.exportPdfBtn.addEventListener('click', () => {
  window.print();
});

// ---------- Render ----------

function render(monthDoc) {
  els.emptyState.hidden = true;
  els.pageTitle.textContent = `${monthDoc.data.title} — ${monthDoc.label}`;
  document.title = `Cuadrante — ${monthDoc.label}`;
  els.cuadrante.classList.toggle('edit-mode', editMode);
  renderLegend();
  els.cuadrante.innerHTML = '';
  monthDoc.data.sections.forEach((section, si) => els.cuadrante.appendChild(renderSection(section, si)));
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

function renderSection(section, sectionIndex) {
  const card = document.createElement('section');
  card.className = 'section-card';

  const h2 = document.createElement('h2');
  h2.textContent = section.name;
  card.appendChild(h2);

  const table = document.createElement('table');
  table.className = 'grid';

  const theadDays = document.createElement('tr');
  theadDays.appendChild(th(''));
  section.dayNumbers.forEach((d, i) => {
    const cell = th(String(d));
    if (WEEKEND_LETTERS.has(section.weekdays[i])) cell.classList.add('weekend');
    theadDays.appendChild(cell);
  });
  table.appendChild(theadDays);

  const theadWeek = document.createElement('tr');
  theadWeek.appendChild(th(''));
  section.weekdays.forEach((w) => {
    const cell = th(w || '');
    cell.classList.add('weekday-row');
    if (WEEKEND_LETTERS.has(w)) cell.classList.add('weekend');
    theadWeek.appendChild(cell);
  });
  table.appendChild(theadWeek);

  if (section.groupShift) {
    const row = document.createElement('tr');
    row.className = 'group-shift-row';
    row.appendChild(th('Turno del grupo'));
    section.groupShift.forEach((code, i) => {
      row.appendChild(td(code, WEEKEND_LETTERS.has(section.weekdays[i])));
    });
    table.appendChild(row);
  }

  section.people.forEach((person, personIndex) => {
    const row = document.createElement('tr');
    const nameCell = document.createElement('th');
    nameCell.scope = 'row';
    nameCell.className = 'person-name';
    nameCell.textContent = person.name;
    row.appendChild(nameCell);

    person.shifts.forEach((code, dayIndex) => {
      const effective = code || (section.groupShift ? section.groupShift[dayIndex] : null);
      const inherited = !code && !!effective;
      const cell = td(effective, WEEKEND_LETTERS.has(section.weekdays[dayIndex]), inherited);
      if (editMode) {
        cell.classList.add('editable');
        cell.addEventListener('click', () => openCellEditor(sectionIndex, personIndex, dayIndex));
      }
      row.appendChild(cell);
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
