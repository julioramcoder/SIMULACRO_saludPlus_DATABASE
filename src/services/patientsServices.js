import { getMongoDb } from "../config/mongodb.js"; 
// aqui traemos la funcion que nos da acceso a la base de datos MongoDB, la usamos porque el historial del paciente vive en mongo y no en postgres

import { HttpError } from "../utils/httpError.js"; 
// esta es nuestra clase personalizada de error, la usamos para devolver errores controlados como 400 o 404 en vez de errores genericos

import { isValidEmail, normalizeEmail } from "../utils/validators.js"; 
// estas funciones nos ayudan a limpiar y validar el email antes de usarlo, porque todo dato que venga del cliente debemos validarlo


function buildSummary(appointments = []) {
  // aqui vamos a construir un resumen del historial del paciente, partimos del arreglo de citas y calculamos total de citas, total gastado y la especialidad mas frecuente

  const totalAppointments = appointments.length; 
  // simplemente contamos cuantas citas tiene el arreglo
// con lenght podemos contar el tamaño de las citas

  let totalSpent = 0;  // creamos una variable para contar dinero gastado 
  const specialtyCount = new Map();  
  // usamos totalSpent para ir acumulando dinero
  // usamos un Map para contar cuantas veces aparece cada especialidad

  for (const a of appointments) {
    // recorremos cada cita del paciente

    totalSpent += Number(a.amountPaid ?? 0);
    // sumamos lo que el paciente pago en esa cita
    // si por alguna razon amountPaid no existe usamos 0
    // Number lo usamos porque en mongo podria venir como string

    const spec = a.specialty || "Unknown";
    // si la cita no tiene especialidad guardada usamos Unknown como valor por defecto

    specialtyCount.set(spec, (specialtyCount.get(spec) || 0) + 1); // esta estructura es como una clave valor, la espacialidad que seria spec y el numero qyue seria (specialtyCount.get(spec) || 0) + 1

    // si no existia en el map empezamos en 0 y sumamos 1
  }


  //BUSCAR UN VALOR MAXIMO DENTRO DE UN CONJUNTO

  let mostFrequentSpecialty = null; // aqui guardamos la especialidad que tiene este numero 

  let best = 0; // AQUI guardamos el numero mas grande encontrado hasta ahora, por defecto ponemos 0 
  // ahora buscamos cual especialidad se repite mas

  for (const [spec, c] of specialtyCount.entries()) // aqui se recorre el Map, cada iteracion devuelve la especialidad (spec) y las veces en que se repite (c)
  {
    if (c > best) {
      best = c; // si el c encontrado es mayor al best, reemplazalo 
      mostFrequentSpecialty = spec; // mientras que en spec va en ...
    }
  }
  // recorremos el map y nos quedamos con la especialidad que tenga mayor cantidad

  return { totalAppointments, totalSpent, mostFrequentSpecialty }; 
  // devolvemos el resumen listo de el numero de citas, total gastado y la especialidad mas requerida por el paciente 
}




export async function getPatientHistoryByEmail(email) {
  // aqui buscamos el historial completo de un paciente usando su email como identificador unico

  const e = normalizeEmail(email);
  // primero normalizamos el email, quitamos espacios y lo pasamos a minusculas para evitar problemas de comparacion

  if (!isValidEmail(e)) throw new HttpError(400, "Invalid patient email");
  // si el email no es valido lanzamos error 400 porque el cliente envio un dato incorrecto

  const db = getMongoDb();
  // obtenemos la conexion a mongo porque el historial esta almacenado ahi

  const doc = await db.collection("patient_histories").findOne({ patientEmail: e });
  // buscamos un documento cuyo patientEmail coincida con el email normalizado

  // en esta coleccion tenemos un documento por paciente y dentro un arreglo de citas

  if (!doc) throw new HttpError(404, "Patient not found");
  // si no encontramos el documento significa que ese paciente no existe en el sistema

  const appointments = Array.isArray(doc.appointments) ? doc.appointments : []; // entro de doc tambien existen los appoitments 
  // nos aseguramos de que appointments sea realmente un arreglo
  // si por alguna razon no lo es devolvemos un arreglo vacio para evitar errores

  const summary = buildSummary(appointments);
  // appoitments son todas las citas que se consiguiero del apciente, se ingresa a la funcion summary y ella se encarga de hacer el calculo de citas 
 

  return {
    patient: { 
      email: doc.patientEmail, 
      name: doc.patientName 
    },
    // devolvemos los datos basicos del paciente

    appointments,
    // devolvemos todas las citas tal como estan guardadas en mongo

    summary,
    // devolvemos el resumen calculado que seria 
  };
  
// Cuenta cuántas citas hay

// Suma cuánto dinero ha pagado el paciente

// Determina cuál es la especialidad más frecuente
// 
}