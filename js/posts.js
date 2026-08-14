// posts.js
// Estructura de "puestos" del parte diario, basada en el formato del Excel
// de ejemplo. Para añadir, quitar o renombrar un puesto, basta con editar
// este archivo — el formulario de asignación y el PDF del día se generan
// automáticamente a partir de esta lista.

export const POST_GROUPS = [
  {
    id: 'conducciones',
    title: 'CONDUCCIONES',
    slots: [
      { id: 'conducciones_1', label: 'Conducciones', count: 4 },
    ],
  },
  {
    id: 'seguridad',
    title: 'SEGURIDAD',
    slots: [
      { id: 'calabozos_manana', label: 'Calabozos Jefatura (7h–15h)', count: 3 },
      { id: 'calabozos_tarde', label: 'Calabozos Jefatura (15h–22h)', count: 3 },
      { id: 'calabozos_noche', label: 'Calabozos Jefatura (22h–7h)', count: 3 },
    ],
  },
  {
    id: 'jefatura_comp',
    title: 'SEGURIDAD JEFATURA COMPLEMENTARIO',
    slots: [
      { id: 'jefatura_comp_1', label: 'Jefatura Complementario (7:30h–14:30h)', count: 1 },
    ],
  },
  {
    id: 'comisaria',
    title: 'COMISARÍA DE CENTRO',
    slots: [
      { id: 'comisaria_manana', label: 'Comisaría Centro (07:30–14:30)', count: 1 },
      { id: 'comisaria_tarde', label: 'Comisaría Centro (14:30–21:30)', count: 1 },
    ],
  },
  {
    id: 'delegacion',
    title: 'DELEGACIÓN DEL GOBIERNO',
    slots: [
      { id: 'delegacion_manana', label: 'Delegación (07:00–14:00)', count: 1 },
      { id: 'delegacion_tarde', label: 'Delegación (14:00–21:00)', count: 1 },
    ],
  },
];

// Códigos que cuentan como "ausencia" en el parte diario (no aparecen como
// disponibles para asignar a un puesto, y sí aparecen en el bloque de
// Ausencias del PDF).
export const ABSENCE_CODES = new Set(['V', 'B', 'P', 'AP', 'CH', 'L/S']);

// Códigos que cuentan como "trabajando" ese día (aparecen como opciones
// disponibles al asignar puestos).
export const WORKING_CODES = new Set(['M', 'T', 'N']);
