// Cliente mínimo de la REST API de Airtable (v0). Sin dependencias.
// Un reintento tras 1 s en 429 / 5xx / error de red; timeout de 8 s por llamada.
export class AirtableError extends Error {
  constructor(mensaje, status = 0, detalle = null) {
    super(mensaje);
    this.name = 'AirtableError';
    this.status = status;
    this.detalle = detalle;
  }
}

// Airtable responde 403 INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND (no 404) cuando el id
// de registro no existe; para la app ambos significan "no existe".
export function esNoEncontrado(e) {
  if (!(e instanceof AirtableError)) return false;
  return e.status === 404 || (e.status === 403 && e.detalle?.error?.type === 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND');
}

const dormirReal = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

function agregarQuery(url, query) {
  for (const [clave, valor] of Object.entries(query ?? {})) {
    if (valor == null) continue;
    if (clave === 'fields') valor.forEach((f) => url.searchParams.append('fields[]', f));
    else if (clave === 'sort') {
      valor.forEach((s, i) => {
        url.searchParams.set(`sort[${i}][field]`, s.field);
        url.searchParams.set(`sort[${i}][direction]`, s.direction ?? 'asc');
      });
    } else url.searchParams.set(clave, String(valor));
  }
}

export function crearCliente({ token, baseId, fetchImpl = globalThis.fetch, timeoutMs = 8000, dormir = dormirReal }) {
  const base = `https://api.airtable.com/v0/${baseId}`;

  async function llamar(metodo, ruta, { query, body } = {}, intento = 0) {
    const url = new URL(`${base}/${ruta}`);
    agregarQuery(url, query);
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), timeoutMs);
    let respuesta;
    try {
      respuesta = await fetchImpl(url.toString(), {
        method: metodo,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: control.signal,
      });
    } catch (e) {
      clearTimeout(temporizador);
      if (intento === 0) { await dormir(1000); return llamar(metodo, ruta, { query, body }, 1); }
      throw new AirtableError('Airtable no responde.', 0, e.message);
    }
    clearTimeout(temporizador);
    if (respuesta.status === 429 || respuesta.status >= 500) {
      if (intento === 0) { await dormir(1000); return llamar(metodo, ruta, { query, body }, 1); }
      throw new AirtableError(`Airtable respondió ${respuesta.status}.`, respuesta.status);
    }
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      throw new AirtableError(datos?.error?.message || `Error ${respuesta.status} de Airtable.`, respuesta.status, datos);
    }
    return datos;
  }

  return {
    async listar(tabla, { filterByFormula, fields, maxRecords, sort } = {}) {
      const registros = [];
      let offset;
      let paginas = 0;
      do {
        const datos = await llamar('GET', encodeURIComponent(tabla), {
          query: { filterByFormula, fields, maxRecords, sort, offset, pageSize: 100 },
        });
        registros.push(...(datos.records ?? []));
        offset = datos.offset;
        paginas += 1;
      } while (offset && paginas < 10);
      return registros;
    },
    obtener(tabla, id) {
      return llamar('GET', `${encodeURIComponent(tabla)}/${id}`);
    },
    crear(tabla, fields) {
      return llamar('POST', encodeURIComponent(tabla), { body: { fields, typecast: true } });
    },
    actualizar(tabla, id, fields) {
      return llamar('PATCH', `${encodeURIComponent(tabla)}/${id}`, { body: { fields, typecast: true } });
    },
  };
}

export function clienteDesdeEnv(env = process.env) {
  if (!env.AIRTABLE_TOKEN || !env.AIRTABLE_BASE_ID) {
    throw new AirtableError('Faltan las variables AIRTABLE_TOKEN y/o AIRTABLE_BASE_ID.', 500);
  }
  return crearCliente({ token: env.AIRTABLE_TOKEN, baseId: env.AIRTABLE_BASE_ID });
}
