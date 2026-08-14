import { firebaseConfig } from './firebase-config.js';
import { CODES, WEEKEND_LETTERS, codeInfo } from './codes.js';
import { parseWorkbookArrayBuffer } from './parser.js';
import { POST_GROUPS, ABSENCE_CODES, WORKING_CODES } from './posts.js';

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
  monthSelectLabel: $('#month-select-label'),
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
  splashScreen: $('#splash-screen'),
  splashGuestBtn: $('#splash-guest-btn'),
  splashLoginBtn: $('#splash-login-btn'),
  dayReportBtn: $('#day-report-btn'),
  dayPickerModal: $('#day-picker-modal'),
  dayPickerGrid: $('#day-picker-grid'),
  dayPickerCancel: $('#day-picker-cancel'),
  dayReport: $('#day-report'),
  dayReportBack: $('#day-report-back'),
  dayReportPdf: $('#day-report-pdf'),
  dayReportTitle: $('#day-report-title'),
  dayReportBody: $('#day-report-body'),
  assignPostsBtn: $('#assign-posts-btn'),
  postAssignModal: $('#post-assign-modal'),
  postAssignTitle: $('#post-assign-title'),
  postAssignBody: $('#post-assign-body'),
  postAssignStatus: $('#post-assign-status'),
  postAssignCancel: $('#post-assign-cancel'),
  postAssignSave: $('#post-assign-save'),
  postAssignCloseX: $('#post-assign-close-x'),
};

const WEEKDAY_FULL = { L: 'Lunes', M: 'Martes', X: 'Miércoles', J: 'Jueves', V: 'Viernes', S: 'Sábado', D: 'Domingo' };

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

// ---------- Pantalla de bienvenida ----------

function hideSplash() {
  els.splashScreen.classList.add('hidden');
}

els.splashGuestBtn.addEventListener('click', hideSplash);
els.splashLoginBtn.addEventListener('click', () => els.loginModal.showModal());

// ---------- Autenticación ----------

els.loginBtn.addEventListener('click', () => els.loginModal.showModal());
els.cancelLogin.addEventListener('click', () => els.loginModal.close());
$('#close-login-x').addEventListener('click', () => els.loginModal.close());
els.loginModal.addEventListener('click', (e) => {
  if (e.target === els.loginModal) els.loginModal.close();
});

els.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.loginError.textContent = '';
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    els.loginModal.close();
    els.loginForm.reset();
    hideSplash();
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
  els.assignPostsBtn.disabled = !isAdmin || !currentDocId;
  if (isAdmin) hideSplash();
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
  els.overwriteSelect.innerHTML = '<option value="">— Publicar como mes nuevo —</option>';

  if (monthsCache.length === 0) {
    els.monthSelect.hidden = true;
    els.monthSelectLabel.hidden = true;
    return null;
  }
  els.monthSelect.hidden = false;
  els.monthSelectLabel.hidden = false;
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
  setDayReportVisible(false);
  els.editModeBtn.disabled = !auth.currentUser;
  els.assignPostsBtn.disabled = !auth.currentUser;
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

// ---------- Vista de un día concreto ----------

function getMaxDayCount() {
  if (!currentMonthDoc) return 0;
  return currentMonthDoc.data.sections.reduce(
    (max, s) => Math.max(max, (s.dayNumbers || []).length),
    0
  );
}

let dayPickerMode = 'view'; // 'view' o 'assign'
let assignDayNumber = null;

function openDayPicker(mode) {
  if (!currentMonthDoc) return;
  dayPickerMode = mode;
  const max = getMaxDayCount();
  els.dayPickerGrid.innerHTML = '';
  for (let d = 1; d <= max; d++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day-picker-btn';
    btn.textContent = String(d);
    btn.addEventListener('click', () => {
      els.dayPickerModal.close();
      if (dayPickerMode === 'assign') openPostAssign(d);
      else showDayReport(d);
    });
    els.dayPickerGrid.appendChild(btn);
  }
  els.dayPickerModal.showModal();
}

els.dayReportBtn.addEventListener('click', () => openDayPicker('view'));
els.assignPostsBtn.addEventListener('click', () => openDayPicker('assign'));
els.dayPickerCancel.addEventListener('click', () => els.dayPickerModal.close());

els.dayReportBack.addEventListener('click', () => setDayReportVisible(false));
els.dayReportPdf.addEventListener('click', () => window.print());

function setDayReportVisible(visible) {
  els.dayReport.style.display = visible ? 'flex' : 'none';
  els.cuadrante.style.display = visible ? 'none' : 'flex';
}

function effectiveShiftFor(section, personIndex, idx) {
  const person = section.people[personIndex];
  const explicit = person.shifts[idx];
  return explicit || (section.groupShift ? section.groupShift[idx] : null);
}

function getWorkingPeopleGroupedForDay(dayNumber) {
  const groups = [];
  currentMonthDoc.data.sections.forEach((section) => {
    const idx = section.dayNumbers.indexOf(dayNumber);
    if (idx === -1) return;
    const names = [];
    section.people.forEach((person, pi) => {
      const effective = effectiveShiftFor(section, pi, idx);
      // Seleccionable si está de mañana/tarde/noche, o si la casilla está en
      // blanco (turno todavía por decidir). Vacaciones, permisos, bajas,
      // liberaciones sindicales, etc. quedan excluidos.
      const eligible = !effective || WORKING_CODES.has(effective);
      if (eligible) names.push(person.name);
    });
    if (names.length > 0) {
      groups.push({ sectionName: section.name, names: names.sort((a, b) => a.localeCompare(b, 'es')) });
    }
  });
  return groups;
}

function showDayReport(dayNumber) {
  let weekdayLabel = '';
  currentMonthDoc.data.sections.forEach((section) => {
    const idx = section.dayNumbers.indexOf(dayNumber);
    if (idx !== -1 && !weekdayLabel) weekdayLabel = section.weekdays[idx] || '';
  });
  const weekdayName = WEEKDAY_FULL[weekdayLabel] || weekdayLabel;
  els.dayReportTitle.textContent = `Día ${dayNumber} — ${weekdayName} — ${currentMonthDoc.label}`;
  els.dayReportBody.innerHTML = '';

  const assignments = currentMonthDoc.data.postAssignments && currentMonthDoc.data.postAssignments[dayNumber];
  if (assignments) {
    renderPostAssignmentReport(dayNumber, assignments);
  } else {
    renderShiftGroupedReport(dayNumber);
  }
  setDayReportVisible(true);
}

function renderShiftGroupedReport(dayNumber) {
  currentMonthDoc.data.sections.forEach((section) => {
    const idx = section.dayNumbers.indexOf(dayNumber);
    if (idx === -1) return;

    const card = document.createElement('div');
    card.className = 'day-section-card';

    const h3 = document.createElement('h3');
    h3.textContent = section.name;
    card.appendChild(h3);

    section.people.forEach((person, pi) => {
      const effective = effectiveShiftFor(section, pi, idx);

      const row = document.createElement('div');
      row.className = 'day-person-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'day-person-name';
      nameSpan.textContent = person.name;
      row.appendChild(nameSpan);

      if (effective) {
        const info = codeInfo(effective);
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.style.background = info.color;
        chip.style.color = info.text;
        chip.textContent = `${effective} · ${info.label}`;
        row.appendChild(chip);
      } else {
        const none = document.createElement('span');
        none.className = 'day-person-none';
        none.textContent = 'Sin dato';
        row.appendChild(none);
      }

      card.appendChild(row);
    });

    els.dayReportBody.appendChild(card);
  });

  if (auth.currentUser) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost-dark';
    btn.textContent = 'Asignar puestos para este día';
    btn.style.marginTop = '0.3rem';
    btn.addEventListener('click', () => openPostAssign(dayNumber));
    els.dayReportBody.appendChild(btn);
  }
}

function renderPostAssignmentReport(dayNumber, assignments) {
  POST_GROUPS.forEach((group) => {
    const card = document.createElement('div');
    card.className = 'day-section-card';

    const h3 = document.createElement('h3');
    h3.textContent = group.title;
    card.appendChild(h3);

    group.slots.forEach((slot) => {
      const names = assignments[slot.id] || [];
      for (let i = 0; i < slot.count; i++) {
        const row = document.createElement('div');
        row.className = 'day-person-row';

        const label = document.createElement('span');
        label.className = 'day-person-name';
        label.textContent = slot.count > 1 ? `${slot.label} (${i + 1})` : slot.label;
        row.appendChild(label);

        const val = document.createElement('span');
        if (names[i]) {
          val.textContent = names[i];
        } else {
          val.className = 'day-person-none';
          val.textContent = 'Sin asignar';
        }
        row.appendChild(val);

        card.appendChild(row);
      }
    });

    els.dayReportBody.appendChild(card);
  });

  appendAusenciasCard(dayNumber);

  if (auth.currentUser) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost-dark';
    btn.textContent = 'Editar asignación de puestos';
    btn.style.marginTop = '0.3rem';
    btn.addEventListener('click', () => openPostAssign(dayNumber));
    els.dayReportBody.appendChild(btn);
  }
}

function appendAusenciasCard(dayNumber) {
  const rows = [];
  currentMonthDoc.data.sections.forEach((section) => {
    const idx = section.dayNumbers.indexOf(dayNumber);
    if (idx === -1) return;
    section.people.forEach((person, pi) => {
      const effective = effectiveShiftFor(section, pi, idx);
      if (effective && ABSENCE_CODES.has(effective)) {
        rows.push({ name: person.name, code: effective });
      }
    });
  });
  if (rows.length === 0) return;

  const card = document.createElement('div');
  card.className = 'day-section-card';
  const h3 = document.createElement('h3');
  h3.textContent = 'Ausencias';
  card.appendChild(h3);

  rows.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'day-person-row';

    const name = document.createElement('span');
    name.className = 'day-person-name';
    name.textContent = r.name;
    row.appendChild(name);

    const info = codeInfo(r.code);
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.style.background = info.color;
    chip.style.color = info.text;
    chip.textContent = `${r.code} · ${info.label}`;
    row.appendChild(chip);

    card.appendChild(row);
  });

  els.dayReportBody.appendChild(card);
}

// ---------- Asignación de puestos (diálogo de edición) ----------

function openPostAssign(dayNumber) {
  assignDayNumber = dayNumber;
  const workingGroups = getWorkingPeopleGroupedForDay(dayNumber);
  const totalWorking = workingGroups.reduce((n, g) => n + g.names.length, 0);
  const existing = (currentMonthDoc.data.postAssignments && currentMonthDoc.data.postAssignments[dayNumber]) || {};

  els.postAssignTitle.textContent = `Asignar puestos — día ${dayNumber}`;
  els.postAssignStatus.textContent = '';
  els.postAssignBody.innerHTML = '';

  POST_GROUPS.forEach((group) => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'post-assign-group';

    const h3 = document.createElement('h3');
    h3.textContent = group.title;
    groupDiv.appendChild(h3);

    group.slots.forEach((slot) => {
      const existingNames = existing[slot.id] || [];
      for (let i = 0; i < slot.count; i++) {
        const wrap = document.createElement('div');
        wrap.className = 'post-assign-slot';

        const label = document.createElement('label');
        label.textContent = slot.count > 1 ? `${slot.label} (${i + 1})` : slot.label;
        wrap.appendChild(label);

        const select = document.createElement('select');
        select.dataset.slotId = slot.id;
        select.dataset.slotIndex = String(i);
        select.addEventListener('change', refreshPostAssignOptions);

        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '— Sin asignar —';
        select.appendChild(emptyOpt);

        workingGroups.forEach((g) => {
          const optgroup = document.createElement('optgroup');
          optgroup.label = g.sectionName;
          g.names.forEach((name) => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (existingNames[i] === name) opt.selected = true;
            optgroup.appendChild(opt);
          });
          select.appendChild(optgroup);
        });

        wrap.appendChild(select);
        groupDiv.appendChild(wrap);
      }
    });

    els.postAssignBody.appendChild(groupDiv);
  });

  if (totalWorking === 0) {
    const warn = document.createElement('p');
    warn.className = 'hint';
    warn.textContent = 'No hay nadie con turno M/T/N (o sin decidir todavía) ese día según el cuadrante.';
    els.postAssignBody.prepend(warn);
  }

  refreshPostAssignOptions();
  els.postAssignModal.showModal();
}

// Oculta en cada desplegable a las personas ya elegidas en otro puesto,
// para que nadie pueda quedar asignado dos veces el mismo día.
function refreshPostAssignOptions() {
  const selects = Array.from(els.postAssignBody.querySelectorAll('select'));
  selects.forEach((sel) => {
    const currentValue = sel.value;
    const takenByOthers = new Set(
      selects.filter((s) => s !== sel && s.value).map((s) => s.value)
    );
    Array.from(sel.options).forEach((opt) => {
      if (opt.value === '') return;
      const shouldHide = takenByOthers.has(opt.value) && opt.value !== currentValue;
      opt.hidden = shouldHide;
      opt.disabled = shouldHide;
    });
  });
}

function closePostAssign() {
  assignDayNumber = null;
  els.postAssignModal.close();
}

els.postAssignCancel.addEventListener('click', closePostAssign);
els.postAssignCloseX.addEventListener('click', closePostAssign);
els.postAssignModal.addEventListener('click', (e) => {
  if (e.target === els.postAssignModal) closePostAssign();
});

els.postAssignSave.addEventListener('click', async () => {
  if (!currentDocId || assignDayNumber == null) return;

  const grouped = {};
  els.postAssignBody.querySelectorAll('select').forEach((sel) => {
    const slotId = sel.dataset.slotId;
    const idx = Number(sel.dataset.slotIndex);
    if (!grouped[slotId]) grouped[slotId] = [];
    grouped[slotId][idx] = sel.value || null;
  });

  if (!currentMonthDoc.data.postAssignments) currentMonthDoc.data.postAssignments = {};
  currentMonthDoc.data.postAssignments[assignDayNumber] = grouped;

  els.postAssignSave.disabled = true;
  els.postAssignStatus.textContent = 'Guardando...';
  try {
    await updateDoc(doc(db, 'cuadrantes', currentDocId), {
      data: currentMonthDoc.data,
      updatedAt: serverTimestamp(),
    });
    els.postAssignStatus.textContent = 'Asignación guardada.';
    const savedDay = assignDayNumber;
    setTimeout(() => {
      closePostAssign();
      if (els.dayReport.style.display !== 'none') showDayReport(savedDay);
    }, 500);
  } catch (err) {
    console.error(err);
    els.postAssignStatus.textContent = `Error al guardar: ${err.code || err.message || 'desconocido'}`;
  } finally {
    els.postAssignSave.disabled = false;
  }
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

  const wrapper = document.createElement('div');
  wrapper.className = 'grid-wrapper';

  // Tabla fija con solo la columna de nombres (no se desplaza).
  const namesTable = document.createElement('table');
  namesTable.className = 'grid-names';

  // Tabla con los días, dentro de un contenedor que sí se desplaza horizontalmente.
  const daysScroll = document.createElement('div');
  daysScroll.className = 'grid-scroll';
  const daysTable = document.createElement('table');
  daysTable.className = 'grid';
  daysScroll.appendChild(daysTable);

  // Fila 1: número de día
  const namesHead1 = document.createElement('tr');
  namesHead1.appendChild(th(''));
  namesTable.appendChild(namesHead1);

  const daysHead1 = document.createElement('tr');
  section.dayNumbers.forEach((d, i) => {
    const cell = th(String(d));
    if (WEEKEND_LETTERS.has(section.weekdays[i])) cell.classList.add('weekend');
    daysHead1.appendChild(cell);
  });
  daysTable.appendChild(daysHead1);

  // Fila 2: letra del día de la semana
  const namesHead2 = document.createElement('tr');
  namesHead2.appendChild(th(''));
  namesTable.appendChild(namesHead2);

  const daysHead2 = document.createElement('tr');
  section.weekdays.forEach((w) => {
    const cell = th(w || '');
    cell.classList.add('weekday-row');
    if (WEEKEND_LETTERS.has(w)) cell.classList.add('weekend');
    daysHead2.appendChild(cell);
  });
  daysTable.appendChild(daysHead2);

  // Fila de turno base del grupo (si existe)
  if (section.groupShift) {
    const nameRow = document.createElement('tr');
    nameRow.className = 'group-shift-row';
    const labelCell = th('Turno del grupo');
    labelCell.classList.add('person-name');
    nameRow.appendChild(labelCell);
    namesTable.appendChild(nameRow);

    const dataRow = document.createElement('tr');
    dataRow.className = 'group-shift-row';
    section.groupShift.forEach((code, i) => {
      dataRow.appendChild(td(code, WEEKEND_LETTERS.has(section.weekdays[i])));
    });
    daysTable.appendChild(dataRow);
  }

  // Filas de personas
  section.people.forEach((person, personIndex) => {
    const nameRow = document.createElement('tr');
    const nameCell = document.createElement('th');
    nameCell.scope = 'row';
    nameCell.className = 'person-name';
    nameCell.textContent = person.name;
    nameRow.appendChild(nameCell);
    namesTable.appendChild(nameRow);

    const dataRow = document.createElement('tr');
    person.shifts.forEach((code, dayIndex) => {
      const effective = code || (section.groupShift ? section.groupShift[dayIndex] : null);
      const inherited = !code && !!effective;
      const cell = td(effective, WEEKEND_LETTERS.has(section.weekdays[dayIndex]), inherited);
      if (editMode) {
        cell.classList.add('editable');
        cell.addEventListener('click', () => openCellEditor(sectionIndex, personIndex, dayIndex));
      }
      dataRow.appendChild(cell);
    });
    daysTable.appendChild(dataRow);
  });

  wrapper.appendChild(namesTable);
  wrapper.appendChild(daysScroll);
  card.appendChild(wrapper);
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
