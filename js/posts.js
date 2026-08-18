// posts.js
// Estructura de "puestos" del parte diario, por grupo. Para añadir, quitar
// o renombrar un puesto de un grupo, basta con editar su lista aquí abajo —
// el formulario de asignación y el PDF del día se generan automáticamente
// a partir de esta lista.

const UPS_SEGURIDAD_POSTS = [
  {
    id: 'conducciones',
    title: 'CONDUCCIONES',
    slots: [
      { id: 'conducciones_1', label: 'Conducciones', count: 4, shift: null, minCount: 0 },
    ],
  },
  {
    id: 'seguridad',
    title: 'SEGURIDAD',
    slots: [
      { id: 'calabozos_manana', label: 'Calabozos Jefatura (7h–15h)', count: 3, shift: 'M', minCount: 3 },
      { id: 'calabozos_tarde', label: 'Calabozos Jefatura (15h–22h)', count: 3, shift: 'T', minCount: 3 },
      { id: 'calabozos_noche', label: 'Calabozos Jefatura (22h–7h)', count: 3, shift: 'N', minCount: 3 },
    ],
  },
  {
    id: 'jefatura_comp',
    title: 'SEGURIDAD JEFATURA COMPLEMENTARIO',
    slots: [
      { id: 'jefatura_comp_1', label: 'Jefatura Complementario (7:30h–14:30h)', count: 1, shift: 'M', minCount: 1 },
    ],
  },
  {
    id: 'comisaria',
    title: 'COMISARÍA DE CENTRO',
    slots: [
      { id: 'comisaria_manana', label: 'Comisaría Centro (07:30–14:30)', count: 1, shift: 'M', minCount: 1 },
      { id: 'comisaria_tarde', label: 'Comisaría Centro (14:30–21:30)', count: 1, shift: 'T', minCount: 1 },
    ],
  },
  {
    id: 'delegacion',
    title: 'DELEGACIÓN DEL GOBIERNO',
    slots: [
      { id: 'delegacion_manana', label: 'Delegación (07:00–14:00)', count: 1, shift: 'M', minCount: 1 },
      { id: 'delegacion_tarde', label: 'Delegación (14:00–21:00)', count: 1, shift: 'T', minCount: 1 },
    ],
  },
];

// Puestos "de ejemplo" para GAC — sustituye este bloque por los puestos
// reales de GAC en cuanto los tengas. Mientras tanto, el cuadrante, "Ver un
// día" y la edición manual funcionan con normalidad; solo afecta a la
// pantalla de "Asignar puestos de un día".
const GAC_POSTS = [
  {
    id: 'gac_generico',
    title: 'PUESTOS GAC (pendiente de definir)',
    slots: [
      { id: 'gac_puesto_1', label: 'Puesto 1', count: 1, shift: null, minCount: 0 },
    ],
  },
];

// Puestos "de ejemplo" para CIMACC 091 — mismo caso que GAC.
const CIMACC_091_POSTS = [
  {
    id: 'cimacc_generico',
    title: 'PUESTOS CIMACC 091 (pendiente de definir)',
    slots: [
      { id: 'cimacc_puesto_1', label: 'Puesto 1', count: 1, shift: null, minCount: 0 },
    ],
  },
];

export const POST_GROUPS_BY_GROUP = {
  'ups-seguridad': UPS_SEGURIDAD_POSTS,
  'gac': GAC_POSTS,
  'cimacc-091': CIMACC_091_POSTS,
};

export function getPostGroups(groupId) {
  return POST_GROUPS_BY_GROUP[groupId] || [];
}

// Códigos que cuentan como "ausencia" en el parte diario (no aparecen como
// disponibles para asignar a un puesto, y sí aparecen en el bloque de
// Ausencias del PDF). Comunes a todos los grupos.
export const ABSENCE_CODES = new Set(['V', 'B', 'P', 'AP', 'CH', 'L/S']);

// Códigos que cuentan como "trabajando" ese día (aparecen como opciones
// disponibles al asignar puestos). Comunes a todos los grupos.
export const WORKING_CODES = new Set(['M', 'T', 'N']);
