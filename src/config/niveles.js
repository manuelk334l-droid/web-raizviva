// Reglas de niveles y comisiones del programa de vendedoras.
// ⚠ Valores de EJEMPLO: ajústalos a las reglas reales de RaízViva.
// El nivel se calcula por número de referidas con estado "activo".
const NIVELES = [
  { clave: 'brote',  nombre: 'Brote',  emoji: '🌱', desde: 0,  comisionPct: 10 },
  { clave: 'raiz',   nombre: 'Raíz',   emoji: '🌳', desde: 4,  comisionPct: 15 },
  { clave: 'bosque', nombre: 'Bosque', emoji: '🌲', desde: 10, comisionPct: 20 }
];

function nivelPara(activas) {
  let actual = NIVELES[0];
  for (const n of NIVELES) if (activas >= n.desde) actual = n;
  return actual;
}

function siguienteNivel(nivel) {
  const i = NIVELES.findIndex(n => n.clave === nivel.clave);
  return NIVELES[i + 1] || null;
}

module.exports = { NIVELES, nivelPara, siguienteNivel };
