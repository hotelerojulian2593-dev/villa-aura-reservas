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
