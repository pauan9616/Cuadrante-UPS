// groups.js
// Lista de grupos que comparten esta misma app. Cada uno tiene su propio
// cuadrante, sus propios meses publicados y su propia lista de puestos del
// parte diario (definida en posts.js). Para añadir un grupo nuevo, basta con
// añadirlo aquí y añadir su lista de puestos en posts.js.

export const GROUPS = [
  { id: 'ups-seguridad', label: 'UPS Seguridad' },
  { id: 'gac', label: 'GAC' },
  { id: 'cimacc-091', label: 'CIMACC 091' },
];

export const DEFAULT_GROUP_ID = 'ups-seguridad';
