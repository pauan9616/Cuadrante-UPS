import { firebaseConfig } from './firebase-config.js';
import { CODES, WEEKEND_LETTERS, codeInfo } from './codes.js';
import { parseWorkbookAllSheets } from './parser.js';
import { getPostGroups, ABSENCE_CODES, WORKING_CODES } from './posts.js';
import { GROUPS, DEFAULT_GROUP_ID } from './groups.js';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  setPersistence, browserSessionPersistence,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, setDoc, updateDoc, getDoc, getDocs, collection, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// La sesión solo dura mientras el navegador/pestaña esté abierto: al cerrarlo
// del todo (no al minimizarlo) hay que volver a iniciar sesión.
setPersistence(auth, browserSessionPersistence).catch((err) => {
  console.error('No se pudo configurar la persistencia de sesión:', err);
});
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
  detectedMonths: $('#detected-months'),
  publishBtn: $('#publish-btn'),
  publishStatus: $('#publish-status'),
  monthSelect: $('#month-select'),
  monthSelectLabel: $('#month-select-label'),
  groupSelect: $('#group-select'),
  groupSelectLabel: $('#group-select-label'),
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
  postAssignWarning: $('#post-assign-warning'),
  postAssignStatus: $('#post-assign-status'),
  postAssignCancel: $('#post-assign-cancel'),
  postAssignSave: $('#post-assign-save'),
  postAssignCloseX: $('#post-assign-close-x'),
  renameModal: $('#rename-modal'),
  renameInput: $('#rename-input'),
  renameGroupSelect: $('#rename-group-select'),
  renameSectionSelect: $('#rename-section-select'),
  renameStatus: $('#rename-status'),
  renameSaveBtn: $('#rename-save-btn'),
  renameCancel: $('#rename-cancel'),
  renameCloseX: $('#rename-close-x'),
  renameForm: $('#rename-form'),
  addPersonModal: $('#add-person-modal'),
  addPersonTitle: $('#add-person-title'),
  addPersonInput: $('#add-person-input'),
  addPersonCancel: $('#add-person-cancel'),
  addPersonCloseX: $('#add-person-close-x'),
  addPersonForm: $('#add-person-form'),
};

const WEEKDAY_FULL = { L: 'Lunes', M: 'Martes', X: 'Miércoles', J: 'Jueves', V: 'Viernes', S: 'Sábado', D: 'Domingo' };

const MES_NOMBRES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

let monthsCache = [];          // [{id, label, year, month}] — solo del grupo actual
let currentDocId = null;       // id del mes actualmente mostrado (incluye prefijo de grupo)
let currentMonthDoc = null;    // { label, data:{title,sections} } - copia editable en memoria
let currentGroupId = localStorage.getItem('cuadrante-grupo') || DEFAULT_GROUP_ID;
let editMode = false;
let dirty = false;
let pendingEditCtx = null;     // {sectionIndex, personIndex, dayIndex} durante el diálogo de edición
els.saveBar.style.display = 'none'; // estado inicial: sin cambios pendientes

function docIdForGroup(groupId, label) {
  const slug = slugify(label);
  // El grupo por defecto (UPS Seguridad) mantiene los identificadores tal
  // cual estaban antes de existir los grupos, para no duplicar ni romper
  // nada de lo ya publicado. Los grupos nuevos sí llevan su prefijo, para
  // no chocar nunca con los meses de otro grupo.
  return groupId === DEFAULT_GROUP_ID ? slug : `${groupId}__${slug}`;
}

function groupDocId(label) {
  return docIdForGroup(currentGroupId, label);
}

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

// ---------- Subida y publicación (varias hojas / meses a la vez) ----------

let parsedSheets = []; // [{ sheetName, title, sections }]

els.fileInput.addEventListener('change', async () => {
  const file = els.fileInput.files[0];
  if (!file) return;
  els.publishStatus.textContent = 'Leyendo archivo...';
  els.detectedMonths.innerHTML = '';
  els.publishBtn.disabled = true;
  parsedSheets = [];
  try {
    const buf = await file.arrayBuffer();
    parsedSheets = parseWorkbookAllSheets(buf);
    if (parsedSheets.length === 0) {
      els.publishStatus.textContent = 'No se ha reconocido ningún cuadrante en este archivo.';
      return;
    }
    renderDetectedMonths(file.name);
    els.publishStatus.textContent =
      parsedSheets.length === 1
        ? `Leído correctamente: ${parsedSheets[0].sections.length} secciones, listo para publicar.`
        : `Leídas ${parsedSheets.length} hojas. Revisa el nombre de cada mes antes de publicar.`;
    els.publishBtn.disabled = false;
  } catch (err) {
    console.error(err);
    els.publishStatus.textContent = 'No se ha podido leer el archivo. ¿Es un .xls o .xlsx del cuadrante?';
  }
});

function guessLabelForSheet(sheet, filename) {
  const fromTitle = parseMonthInfo(sheet.title || '');
  if (fromTitle.month && fromTitle.year) {
    const name = MES_NOMBRES[fromTitle.month - 1];
    return `${name.charAt(0)}${name.slice(1).toLowerCase()} ${fromTitle.year}`;
  }
  const upperSheetName = (sheet.sheetName || '').toUpperCase();
  const foundInSheetName = MES_NOMBRES.find((m) => upperSheetName.includes(m));
  if (foundInSheetName) {
    return `${foundInSheetName.charAt(0)}${foundInSheetName.slice(1).toLowerCase()} ${new Date().getFullYear()}`;
  }
  return guessMonthLabel(filename) || sheet.sheetName || '';
}

function renderDetectedMonths(filename) {
  els.detectedMonths.innerHTML = '';
  parsedSheets.forEach((sheet, idx) => {
    const guessed = guessLabelForSheet(sheet, filename);

    const item = document.createElement('div');
    item.className = 'detected-month-item';
    item.dataset.index = String(idx);

    const row = document.createElement('label');
    row.className = 'detected-month-check';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.className = 'detected-month-enabled';

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'detected-month-label';
    labelInput.value = guessed;
    labelInput.addEventListener('input', () => updateDetectedHint(item, sheet));

    row.appendChild(checkbox);
    row.appendChild(labelInput);
    item.appendChild(row);

    const hint = document.createElement('p');
    hint.className = 'detected-month-hint';
    item.appendChild(hint);

    els.detectedMonths.appendChild(item);
    updateDetectedHint(item, sheet);
  });
}

function updateDetectedHint(item, sheet) {
  const labelInput = item.querySelector('.detected-month-label');
  const hint = item.querySelector('.detected-month-hint');
  const label = labelInput.value.trim();
  const slug = groupDocId(label);
  const existing = monthsCache.find((m) => m.id === slug);
  const sectionsCount = sheet.sections.length;
  if (existing) {
    hint.textContent = `${sectionsCount} secciones · ⚠️ sustituirá el cuadrante ya publicado de "${existing.label}"`;
    hint.classList.add('warn');
  } else {
    hint.textContent = `${sectionsCount} secciones · se publicará como mes nuevo`;
    hint.classList.remove('warn');
  }
}

els.publishBtn.addEventListener('click', async () => {
  const items = Array.from(els.detectedMonths.querySelectorAll('.detected-month-item'));
  const selected = items.filter((item) => item.querySelector('.detected-month-enabled').checked);

  if (selected.length === 0) {
    els.publishStatus.textContent = 'No has seleccionado ningún mes para publicar.';
    return;
  }

  const overwriting = selected
    .map((item) => {
      const label = item.querySelector('.detected-month-label').value.trim();
      return monthsCache.find((m) => m.id === groupDocId(label));
    })
    .filter(Boolean);

  if (overwriting.length > 0) {
    const names = overwriting.map((m) => m.label).join(', ');
    const ok = confirm(`Esto sustituirá estos meses ya publicados: ${names}. ¿Continuar?`);
    if (!ok) return;
  }

  els.publishBtn.disabled = true;
  let okCount = 0;
  let lastDocId = null;

  for (const item of selected) {
    const idx = Number(item.dataset.index);
    const sheet = parsedSheets[idx];
    const label = item.querySelector('.detected-month-label').value.trim();
    if (!label) continue;

    const docId = groupDocId(label);
    const { month, year } = parseMonthInfo(label);
    els.publishStatus.textContent = `Publicando "${label}"...`;
    try {
      await setDoc(doc(db, 'cuadrantes', docId), {
        label,
        month,
        year,
        grupo: currentGroupId,
        data: { title: sheet.title, sections: sheet.sections },
        uploadedAt: serverTimestamp(),
      });
      okCount++;
      lastDocId = docId;
    } catch (err) {
      console.error(err);
      els.publishStatus.textContent = `Error al publicar "${label}": ${err.code || err.message || 'desconocido'}`;
      els.publishBtn.disabled = false;
      return;
    }
  }

  els.publishStatus.textContent = `Publicado${okCount === 1 ? '' : 's'} ${okCount} mes${okCount === 1 ? '' : 'es'} correctamente.`;
  parsedSheets = [];
  els.detectedMonths.innerHTML = '';
  els.fileInput.value = '';
  els.publishBtn.disabled = true;
  await loadMonthList();
  if (lastDocId) {
    els.monthSelect.value = lastDocId;
    await loadMonth(lastDocId);
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
    // Solo nos interesan los meses del grupo activo. Los documentos ya
    // publicados antes de tener grupos (sin campo "grupo") se consideran
    // del grupo por defecto, para no perder nada de lo ya publicado.
    const docGroupId = data.grupo || DEFAULT_GROUP_ID;
    if (docGroupId !== currentGroupId) return;

    let { month, year } = data;
    if (!month || !year) {
      const parsed = parseMonthInfo(data.label);
      month = month || parsed.month;
      year = year || parsed.year;
    }
    monthsCache.push({ id: d.id, label: data.label, month: month || 0, year: year || 0 });
  });
  monthsCache.sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));

  els.monthSelect.innerHTML = '';

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
  });
  // Por defecto se abre el mes en curso, si ya está publicado. Si no,
  // se usa el más reciente de los publicados (el último de la lista,
  // ya que el desplegable se muestra en orden ascendente).
  const now = new Date();
  const currentMonthEntry = monthsCache.find(
    (m) => m.month === now.getMonth() + 1 && m.year === now.getFullYear()
  );
  return currentMonthEntry ? currentMonthEntry.id : monthsCache[monthsCache.length - 1].id;
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

// ---------- Corregir nombre de una persona ----------

let pendingRenameCtx = null; // {sectionIndex, personIndex}

function openRenameEditor(sectionIndex, personIndex) {
  const person = currentMonthDoc.data.sections[sectionIndex].people[personIndex];
  pendingRenameCtx = { sectionIndex, personIndex };
  els.renameInput.value = person.name;
  els.renameStatus.textContent = '';

  els.renameGroupSelect.innerHTML = '';
  GROUPS.forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.id === currentGroupId ? `${g.label} (actual)` : g.label;
    if (g.id === currentGroupId) opt.selected = true;
    els.renameGroupSelect.appendChild(opt);
  });

  populateRenameSectionsFromCurrentMonth(sectionIndex);

  els.renameModal.showModal();
  els.renameInput.focus();
  els.renameInput.select();
}

function populateRenameSectionsFromCurrentMonth(currentSectionIndex) {
  els.renameSectionSelect.innerHTML = '';
  els.renameSectionSelect.disabled = false;
  currentMonthDoc.data.sections.forEach((section, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = i === currentSectionIndex ? `${section.name} (actual)` : section.name;
    if (i === currentSectionIndex) opt.selected = true;
    els.renameSectionSelect.appendChild(opt);
  });
}

els.renameGroupSelect.addEventListener('change', async () => {
  const targetGroupId = els.renameGroupSelect.value;
  els.renameStatus.textContent = '';

  if (targetGroupId === currentGroupId) {
    populateRenameSectionsFromCurrentMonth(pendingRenameCtx ? pendingRenameCtx.sectionIndex : -1);
    return;
  }

  els.renameSectionSelect.innerHTML = '';
  els.renameSectionSelect.disabled = true;
  els.renameStatus.textContent = 'Buscando ese mes en el otro grupo...';
  try {
    const targetDocId = docIdForGroup(targetGroupId, currentMonthDoc.label);
    const snap = await getDoc(doc(db, 'cuadrantes', targetDocId));
    if (!snap.exists()) {
      const targetLabel = GROUPS.find((g) => g.id === targetGroupId)?.label || targetGroupId;
      els.renameStatus.textContent = `${targetLabel} no tiene publicado "${currentMonthDoc.label}" todavía. No se puede mover ahí.`;
      return;
    }
    const targetData = snap.data();
    targetData.data.sections.forEach((section, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = section.name;
      els.renameSectionSelect.appendChild(opt);
    });
    els.renameSectionSelect.disabled = false;
    els.renameStatus.textContent = '';
  } catch (err) {
    console.error(err);
    els.renameStatus.textContent = `Error al buscar ese grupo: ${err.code || err.message || 'desconocido'}`;
  }
});

function closeRenameEditor() {
  pendingRenameCtx = null;
  els.renameModal.close();
}

els.renameCancel.addEventListener('click', closeRenameEditor);
els.renameCloseX.addEventListener('click', closeRenameEditor);
els.renameModal.addEventListener('click', (e) => {
  if (e.target === els.renameModal) closeRenameEditor();
});

els.renameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!pendingRenameCtx) return;
  const newName = els.renameInput.value.trim();
  if (!newName) return;

  const targetGroupId = els.renameGroupSelect.value;
  const { sectionIndex, personIndex } = pendingRenameCtx;
  const sourceSection = currentMonthDoc.data.sections[sectionIndex];

  if (targetGroupId === currentGroupId) {
    // Traslado dentro del mismo cuadrante (o solo cambio de nombre).
    const targetSectionIndex = Number(els.renameSectionSelect.value);
    if (targetSectionIndex === sectionIndex) {
      sourceSection.people[personIndex].name = newName;
    } else {
      const targetSection = currentMonthDoc.data.sections[targetSectionIndex];
      sourceSection.people.splice(personIndex, 1);
      targetSection.people.push({
        name: newName,
        shifts: new Array(targetSection.numDays).fill(null),
      });
    }
    pendingRenameCtx = null;
    els.renameModal.close();
    setDirty(true);
    reRender();
    return;
  }

  // Traslado a OTRO grupo: son dos documentos distintos de Firestore, así
  // que se guarda todo al momento (no se deja pendiente de "Guardar
  // cambios"), para no dejar a la persona a medias entre dos grupos.
  const targetSectionIndex = Number(els.renameSectionSelect.value);
  if (Number.isNaN(targetSectionIndex)) return;

  els.renameSaveBtn.disabled = true;
  els.renameStatus.textContent = 'Moviendo...';
  try {
    const targetDocId = docIdForGroup(targetGroupId, currentMonthDoc.label);
    const targetSnap = await getDoc(doc(db, 'cuadrantes', targetDocId));
    if (!targetSnap.exists()) throw new Error('Ese mes ya no existe en el grupo destino.');
    const targetDocData = targetSnap.data();
    targetDocData.data.sections[targetSectionIndex].people.push({
      name: newName,
      shifts: new Array(targetDocData.data.sections[targetSectionIndex].numDays).fill(null),
    });
    await updateDoc(doc(db, 'cuadrantes', targetDocId), {
      data: targetDocData.data,
      updatedAt: serverTimestamp(),
    });

    // Ahora quitamos a la persona de la sección de origen y lo guardamos también.
    sourceSection.people.splice(personIndex, 1);
    await updateDoc(doc(db, 'cuadrantes', currentDocId), {
      data: currentMonthDoc.data,
      updatedAt: serverTimestamp(),
    });

    pendingRenameCtx = null;
    els.renameModal.close();
    reRender();
  } catch (err) {
    console.error(err);
    els.renameStatus.textContent = `Error al mover a otro grupo: ${err.code || err.message || 'desconocido'}`;
  } finally {
    els.renameSaveBtn.disabled = false;
  }
});

// ---------- Añadir persona nueva a una sección ----------

let pendingAddSectionIndex = null;

function openAddPerson(sectionIndex) {
  pendingAddSectionIndex = sectionIndex;
  const section = currentMonthDoc.data.sections[sectionIndex];
  els.addPersonTitle.textContent = `Añadir persona — ${section.name}`;
  els.addPersonInput.value = '';
  els.addPersonModal.showModal();
  els.addPersonInput.focus();
}

function closeAddPerson() {
  pendingAddSectionIndex = null;
  els.addPersonModal.close();
}

els.addPersonCancel.addEventListener('click', closeAddPerson);
els.addPersonCloseX.addEventListener('click', closeAddPerson);
els.addPersonModal.addEventListener('click', (e) => {
  if (e.target === els.addPersonModal) closeAddPerson();
});

els.addPersonForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (pendingAddSectionIndex == null) return;
  const name = els.addPersonInput.value.trim();
  if (!name) return;

  const section = currentMonthDoc.data.sections[pendingAddSectionIndex];
  section.people.push({ name, shifts: new Array(section.numDays).fill(null) });

  pendingAddSectionIndex = null;
  els.addPersonModal.close();
  setDirty(true);
  reRender();
});

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
    const people = [];
    section.people.forEach((person, pi) => {
      const effective = effectiveShiftFor(section, pi, idx);
      // Seleccionable si está de mañana/tarde/noche, o si la casilla está en
      // blanco (turno todavía por decidir). Vacaciones, permisos, bajas,
      // liberaciones sindicales, etc. quedan excluidos.
      const eligible = !effective || WORKING_CODES.has(effective);
      if (eligible) people.push({ name: person.name, shift: effective || null });
    });
    if (people.length > 0) {
      people.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      groups.push({ sectionName: section.name, people });
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
  getPostGroups(currentGroupId).forEach((group) => {
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

// Rellena un <select> de asignación de puesto. Si el puesto tiene un turno
// asociado (mañana/tarde/noche), separa primero a quienes ya tienen ese
// turno ese día, y deja en un segundo bloque, aparte, al resto de personas
// disponibles por si hay que recolocar a alguien de otro turno.
function buildSlotOptions(select, workingGroups, slot, selectedName) {
  const targetShift = slot.shift || null;

  if (!targetShift) {
    workingGroups.forEach((g) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = g.sectionName;
      g.people.forEach((person) => {
        optgroup.appendChild(makeOption(person.name, person.name === selectedName));
      });
      select.appendChild(optgroup);
    });
    return;
  }

  let hasMatching = false;
  workingGroups.forEach((g) => {
    const matching = g.people.filter((p) => p.shift === targetShift);
    if (matching.length === 0) return;
    hasMatching = true;
    const optgroup = document.createElement('optgroup');
    optgroup.label = g.sectionName;
    matching.forEach((person) => {
      optgroup.appendChild(makeOption(person.name, person.name === selectedName));
    });
    select.appendChild(optgroup);
  });

  const otherPeople = [];
  workingGroups.forEach((g) => {
    g.people.forEach((person) => {
      if (person.shift !== targetShift) {
        otherPeople.push({ ...person, sectionName: g.sectionName });
      }
    });
  });

  if (otherPeople.length > 0) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = hasMatching ? '— Añadir de otro turno —' : 'Nadie coincide con este turno — elegir de otro turno';
    otherPeople.forEach((person) => {
      const shiftLabel = person.shift ? codeInfo(person.shift).label : 'sin turno decidido';
      const opt = makeOption(person.name, person.name === selectedName);
      opt.textContent = `${person.name} (${person.sectionName} · ${shiftLabel})`;
      optgroup.appendChild(opt);
    });
    select.appendChild(optgroup);
  }
}

function makeOption(name, selected) {
  const opt = document.createElement('option');
  opt.value = name;
  opt.textContent = name;
  if (selected) opt.selected = true;
  return opt;
}

// Devuelve el nombre final de un puesto: el elegido en el desplegable, o el
// escrito a mano si se seleccionó "Persona externa".
function resolveSlotValue(select) {
  if (select.value === '__external__') {
    const input = select.nextElementSibling;
    const typed = input && input.value ? input.value.trim() : '';
    return typed || null;
  }
  return select.value || null;
}

function openPostAssign(dayNumber) {
  assignDayNumber = dayNumber;
  const workingGroups = getWorkingPeopleGroupedForDay(dayNumber);
  const totalWorking = workingGroups.reduce((n, g) => n + g.people.length, 0);
  const existing = (currentMonthDoc.data.postAssignments && currentMonthDoc.data.postAssignments[dayNumber]) || {};

  els.postAssignTitle.textContent = `Asignar puestos — día ${dayNumber}`;
  els.postAssignStatus.textContent = '';
  els.postAssignBody.innerHTML = '';

  getPostGroups(currentGroupId).forEach((group) => {
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

        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '— Sin asignar —';
        select.appendChild(emptyOpt);

        buildSlotOptions(select, workingGroups, slot, existingNames[i]);

        const externalOpt = document.createElement('option');
        externalOpt.value = '__external__';
        externalOpt.textContent = '✏️ Persona externa (escribir nombre)';
        select.appendChild(externalOpt);

        const externalInput = document.createElement('input');
        externalInput.type = 'text';
        externalInput.className = 'post-assign-external-input';
        externalInput.placeholder = 'Nombre y apellidos';
        externalInput.dataset.slotId = slot.id;
        externalInput.dataset.slotIndex = String(i);
        externalInput.hidden = true;
        externalInput.addEventListener('input', updatePostAssignWarning);

        // Si el valor guardado no coincide con nadie del grupo, es que era
        // una persona externa escrita a mano: lo detectamos y lo mostramos.
        const isKnownValue = Array.from(select.options).some((o) => o.value === existingNames[i]);
        if (existingNames[i] && !isKnownValue) {
          select.value = '__external__';
          externalInput.hidden = false;
          externalInput.value = existingNames[i];
        }

        select.addEventListener('change', () => {
          const isExternal = select.value === '__external__';
          externalInput.hidden = !isExternal;
          if (isExternal) {
            externalInput.focus();
          } else {
            externalInput.value = '';
          }
          refreshPostAssignOptions();
          updatePostAssignWarning();
        });

        wrap.appendChild(select);
        wrap.appendChild(externalInput);
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
  updatePostAssignWarning();
  els.postAssignModal.showModal();
}

// Recalcula en tiempo real qué puestos no llegan al mínimo de personas, y
// muestra u oculta el aviso dentro del propio formulario.
function updatePostAssignWarning() {
  const grouped = {};
  els.postAssignBody.querySelectorAll('select').forEach((sel) => {
    const slotId = sel.dataset.slotId;
    const idx = Number(sel.dataset.slotIndex);
    if (!grouped[slotId]) grouped[slotId] = [];
    grouped[slotId][idx] = resolveSlotValue(sel);
  });

  const shortages = findStaffingShortages(grouped);
  if (shortages.length === 0) {
    els.postAssignWarning.hidden = true;
    els.postAssignWarning.innerHTML = '';
    return;
  }

  els.postAssignWarning.hidden = false;
  els.postAssignWarning.innerHTML = '';
  const title = document.createElement('strong');
  title.textContent = '⚠️ El cuadrante todavía no está completo:';
  els.postAssignWarning.appendChild(title);
  const ul = document.createElement('ul');
  shortages.forEach((s) => {
    const li = document.createElement('li');
    li.textContent = `${s.label}: ${s.filled} de ${s.minCount} mínimo`;
    ul.appendChild(li);
  });
  els.postAssignWarning.appendChild(ul);
}

// Oculta en cada desplegable a las personas ya elegidas en otro puesto,
// para que nadie pueda quedar asignado dos veces el mismo día.
function refreshPostAssignOptions() {
  const selects = Array.from(els.postAssignBody.querySelectorAll('select'));
  selects.forEach((sel) => {
    const currentValue = sel.value;
    const takenByOthers = new Set(
      selects
        .filter((s) => s !== sel && s.value && s.value !== '__external__')
        .map((s) => s.value)
    );
    Array.from(sel.options).forEach((opt) => {
      if (opt.value === '' || opt.value === '__external__') return;
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
    grouped[slotId][idx] = resolveSlotValue(sel);
  });

  const shortages = findStaffingShortages(grouped);
  if (shortages.length > 0) {
    const lines = shortages.map((s) => `• ${s.label}: ${s.filled} de ${s.minCount} mínimo`).join('\n');
    const ok = confirm(
      `El cuadrante no está completo:\n\n${lines}\n\n¿Seguro que quieres guardar así?`
    );
    if (!ok) return;
  }

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

// Comprueba, puesto por puesto, si se llega al mínimo de personas indicado
// en posts.js. Devuelve la lista de puestos que se quedan cortos.
function findStaffingShortages(grouped) {
  const shortages = [];
  getPostGroups(currentGroupId).forEach((group) => {
    group.slots.forEach((slot) => {
      const minCount = slot.minCount || 0;
      if (minCount <= 0) return;
      const filled = (grouped[slot.id] || []).filter(Boolean).length;
      if (filled < minCount) {
        shortages.push({ label: slot.label, filled, minCount });
      }
    });
  });
  return shortages;
}

// ---------- Render ----------

function render(monthDoc) {
  els.emptyState.hidden = true;
  els.pageTitle.textContent = `${monthDoc.data.title} — ${monthDoc.label}`;
  document.title = `Cuadrante — ${monthDoc.label}`;
  els.cuadrante.classList.toggle('edit-mode', editMode);
  renderLegend();
  els.cuadrante.innerHTML = '';
  const cards = monthDoc.data.sections.map((section, si) => renderSection(section, si));
  cards.forEach((card) => els.cuadrante.appendChild(card));
  syncGridRowHeights(cards);
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

  // Columna de nombres: divs sencillos, no una tabla — su altura se copia
  // de la tabla de días justo después de dibujarla, para que sea
  // imposible que se desalineen.
  const namesCol = document.createElement('div');
  namesCol.className = 'grid-names';

  const daysScroll = document.createElement('div');
  daysScroll.className = 'grid-scroll';
  const daysTable = document.createElement('table');
  daysTable.className = 'grid';
  daysScroll.appendChild(daysTable);

  // Fila 1: número de día
  namesCol.appendChild(nameRowDiv('', { header: true }));
  const daysHead1 = document.createElement('tr');
  section.dayNumbers.forEach((d, i) => {
    const cell = th(String(d));
    if (WEEKEND_LETTERS.has(section.weekdays[i])) cell.classList.add('weekend');
    daysHead1.appendChild(cell);
  });
  daysTable.appendChild(daysHead1);

  // Fila 2: letra del día de la semana
  namesCol.appendChild(nameRowDiv('', { header: true }));
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
    namesCol.appendChild(nameRowDiv('Turno del grupo', { italic: true }));
    const dataRow = document.createElement('tr');
    dataRow.className = 'group-shift-row';
    section.groupShift.forEach((code, i) => {
      dataRow.appendChild(td(code, WEEKEND_LETTERS.has(section.weekdays[i])));
    });
    daysTable.appendChild(dataRow);
  }

  // Filas de personas
  section.people.forEach((person, personIndex) => {
    const nameRow = nameRowDiv(person.name);
    if (editMode) {
      nameRow.classList.add('name-row-editable');
      nameRow.addEventListener('click', () => openRenameEditor(sectionIndex, personIndex));
    }
    namesCol.appendChild(nameRow);

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

  wrapper.appendChild(namesCol);
  wrapper.appendChild(daysScroll);
  card.appendChild(wrapper);

  if (editMode) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-ghost-dark add-person-btn';
    addBtn.textContent = '+ Añadir persona';
    addBtn.addEventListener('click', () => openAddPerson(sectionIndex));
    card.appendChild(addBtn);
  }

  // Referencias para poder sincronizar alturas después de insertar en el DOM.
  card._daysTable = daysTable;
  card._namesCol = namesCol;
  return card;
}

function nameRowDiv(text, opts = {}) {
  const div = document.createElement('div');
  div.className = 'name-row';
  if (opts.header) div.classList.add('name-row-header');
  if (opts.italic) div.classList.add('name-row-italic');
  div.textContent = text;
  return div;
}

// Copia la altura real (ya calculada por el navegador) de cada fila de la
// tabla de días a la fila correspondiente de la columna de nombres.
function syncGridRowHeights(cards) {
  cards.forEach((card) => {
    const rows = card._daysTable.querySelectorAll('tr');
    const nameRows = card._namesCol.querySelectorAll('.name-row');
    rows.forEach((tr, i) => {
      if (nameRows[i]) nameRows[i].style.height = `${tr.offsetHeight}px`;
    });
  });
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

// Vuelve a alinear las alturas si cambia el tamaño de la ventana (p. ej. al
// girar el móvil), por si la fila de nombres ajusta su tamaño de fuente.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (currentMonthDoc && els.cuadrante.style.display !== 'none') {
      render(currentMonthDoc);
    }
  }, 200);
});

// ---------- Selector de grupo ----------

function populateGroupSelect() {
  els.groupSelect.innerHTML = '';
  GROUPS.forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.label;
    els.groupSelect.appendChild(opt);
  });
  els.groupSelect.value = currentGroupId;
}

async function switchToGroup(groupId) {
  currentGroupId = groupId;
  localStorage.setItem('cuadrante-grupo', groupId);
  els.groupSelect.value = groupId;
  setDirty(false);
  editMode = false;
  setDayReportVisible(false);
  currentDocId = null;
  currentMonthDoc = null;

  const firstId = await loadMonthList();
  if (firstId) {
    els.monthSelect.value = firstId;
    await loadMonth(firstId);
  } else {
    els.cuadrante.innerHTML = '';
    els.legend.innerHTML = '';
    els.pageTitle.textContent = 'Cuadrante';
    els.emptyState.hidden = false;
  }
}

els.groupSelect.addEventListener('change', async () => {
  if (dirty && !confirm('Tienes cambios sin guardar. ¿Cambiar de grupo sin guardarlos?')) {
    els.groupSelect.value = currentGroupId;
    return;
  }
  await switchToGroup(els.groupSelect.value);
});

// ---------- Arranque ----------

(async function init() {
  populateGroupSelect();
  const firstId = await loadMonthList();
  if (firstId) {
    els.monthSelect.value = firstId;
    await loadMonth(firstId);
  } else {
    els.emptyState.hidden = false;
  }
})();
