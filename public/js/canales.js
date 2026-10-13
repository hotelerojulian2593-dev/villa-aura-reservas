// Fuentes de una reserva. Compartido por navegador y servidor. Los nombres coinciden
// con las opciones del campo `Fuente` de Airtable y con `Canal` en la tabla Canales.
export const FUENTES = { directo: 'Directo', airbnb: 'Airbnb', booking: 'Booking.com' };
export const CANALES = [FUENTES.airbnb, FUENTES.booking];

export function esDeCanal(reserva) {
  const fuente = reserva?.fuente;
  return Boolean(fuente) && fuente !== FUENTES.directo;
}
