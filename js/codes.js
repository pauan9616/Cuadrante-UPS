// codes.js
// Diccionario central de códigos de turno. Añadir un código nuevo aquí
// es lo único que hace falta para que aparezca en la leyenda y se pinte
// correctamente en la parrilla.

export const CODES = {
  M:    { label: 'Mañana',                    color: '#F2A93B', text: '#1C2430' },
  T:    { label: 'Tarde',                     color: '#D9622B', text: '#FFFFFF' },
  N:    { label: 'Noche',                     color: '#2B3A67', text: '#FFFFFF' },
  L:    { label: 'Libre',                     color: '#E4E7EC', text: '#1C2430' },
  S:    { label: 'Saliente',                  color: '#7FA6C9', text: '#1C2430' },
  V:    { label: 'Vacaciones',                color: '#4C9A6A', text: '#FFFFFF' },
  AP:   { label: 'Asunto particular',         color: '#2F9C95', text: '#FFFFFF' },
  CH:   { label: 'Compensación horaria',      color: '#A67C3D', text: '#FFFFFF' },
  'L/S':{ label: 'Liberado sindical',         color: '#C15B8F', text: '#FFFFFF' },
  P:    { label: 'Permiso',                   color: '#8DBF3A', text: '#1C2430' },
  B:    { label: 'Baja',                      color: '#D6483C', text: '#FFFFFF' },
  ST:   { label: 'Sustitución en otro puesto',color: '#7A5CC2', text: '#FFFFFF' },
};

export const WEEKEND_LETTERS = new Set(['S', 'D']); // Sábado / Domingo para sombrear la columna

export function codeInfo(code) {
  if (!code) return null;
  return CODES[code] || { label: code, color: '#BFC6D1', text: '#1C2430' };
}
