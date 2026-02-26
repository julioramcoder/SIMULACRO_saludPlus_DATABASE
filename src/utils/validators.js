// VALIDACION DE DE DATOS ANTES DE USARLOS, DEBIDO A QUE CSV PUEDE TRAER DATOS SUCIOS, EL USARIO PUEDE MANDAR DATOS INCORRECTOS ET, VALIDAMOS EMAIL, NORMALIZAMOS EMAILS, VALIDACION DE FECHAS EN FORMATO CORRECTO 

export function isValidEmail(email) { // ESTA FUNCION RECIBE UN EMAIL Y DEVUELVE UN TRUE SI ES VALIDO Y FALSE SI ES INVALIDO 

  if (typeof email !== "string") return false; 
  const v = email.trim().toLowerCase(); // AQUI NORMALIZAMOS SIN ESPACIOS RAROS Y TODO EN MINUSCULA

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); // CON ESTO VERIFICAMOS QUE EL TEXTO TENGA LA ESTRUCTURA BASICA DEL EMAIL 
}

export function normalizeEmail(email) { // ESTA FUNCION LIMPIA
  return String(email ?? "").trim().toLowerCase(); //SI EL EMAIL ES NULL O UNDEFINED USA ""
}

export function isValidISODate(d) { // en esta funcion validamos las fechas tipo 2026-02-26
  if (typeof d !== "string") return false; // si no es texto entonces no es valido 
  // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false; // se genera el formato correcto para la fecha
  const dt = new Date(`${d}T00:00:00Z`);// esto convierte al string en un objeto Date real 
  return !Number.isNaN(dt.getTime()); // se valida que la fecha realmente exista 
}