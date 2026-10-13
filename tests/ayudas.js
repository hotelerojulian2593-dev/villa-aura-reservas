export const ENV = { PIN_SENORAS: '123456' };

export function crearReq({ method = 'GET', query = {}, body, pin = '123456', ip = '1.1.1.1' } = {}) {
  return { method, query, body, headers: { 'x-pin': pin, 'x-forwarded-for': ip } };
}

export function crearRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(clave, valor) { this.headers[clave] = valor; },
    status(codigo) { this.statusCode = codigo; return this; },
    json(cuerpo) { this.body = cuerpo; return this; },
  };
}

const compacta = (iso) => iso.replace(/-/g, '');
// Calendario de Airbnb simulado (lo usan los tests de sincronización y de /api/sincronizar).
export function icsDe(eventos) {
  const cuerpo = eventos.map((e) => [
    'BEGIN:VEVENT', `DTSTART;VALUE=DATE:${compacta(e.inicio)}`, `DTEND;VALUE=DATE:${compacta(e.fin)}`, `UID:${e.uid}`,
    `SUMMARY:${e.resumen ?? 'Reserved'}`, ...(e.descripcion ? [`DESCRIPTION:${e.descripcion}`] : []), 'END:VEVENT',
  ].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Airbnb Inc//Hosting Calendar 0.8.8//EN', ...cuerpo, 'END:VCALENDAR', ''].join('\r\n');
}
