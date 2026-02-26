import { pool } from "../config/postgres.js"; // pool viene de postgres, es el manejador de conexiones, sirve para hacer query y tambien para pedir un client y usar transacciones
import { getMongoDb } from "../config/mongodb.js"; // esta funcion devuelve la conexion a mongo, para poder escribir en la coleccion patient_histories
import { HttpError } from "../utils/httpError.js"; // clase de error personalizada, sirve para lanzar errores con codigo http y mensaje claro
import { isValidEmail, normalizeEmail } from "../utils/validators.js"; // validadores, normalizeEmail limpia el email, isValidEmail valida el formato


// =============================================
// BLOQUE 1 LISTAR DOCTORES, CON FILTRO OPCIONAL
// =============================================
export async function listDoctors({ specialty } = {}) { // esta funcion lista doctores, si mandan specialty filtra, si no mandan nada lista todos
  const params = []; // params es el arreglo de valores para el query parametrizado, evita inyeccion sql
  let sql = `SELECT id, name, email, specialty FROM doctors`; // query base, seleccionamos solo lo que necesitamos

  if (specialty) { // si nos mandan una especialidad, aplicamos filtro
    params.push(String(specialty).trim()); // normalizamos texto, quitamos espacios, y lo metemos como parametro
    sql += ` WHERE specialty = $1`; // $1 es el primer parametro del arreglo params
  }

  sql += ` ORDER BY id ASC`; // ordenamos por id, para tener una salida estable y predecible

  const { rows } = await pool.query(sql, params); // ejecutamos el query en postgres, rows es el arreglo de doctores
  return rows; // devolvemos la lista
}


// =============================================
// BLOQUE 2 TRAER DOCTOR POR ID, VALIDAR INPUT
// =============================================
export async function getDoctorById(id) { // busca un doctor especifico por id, y valida que el id sea correcto
  const doctorId = Number(id); // convertimos lo que llega a numero
  if (!Number.isInteger(doctorId) || doctorId <= 0) { // si no es entero o es menor o igual a 0, es invalido
    throw new HttpError(400, "Invalid doctor id"); // error 400 porque el cliente mando un dato malo
  }

  const { rows } = await pool.query( // query parametrizado, id va como $1 para evitar sql injection
    `SELECT id, name, email, specialty FROM doctors WHERE id = $1`,
    [doctorId]
  );

  if (rows.length === 0) throw new HttpError(404, "Doctor not found"); // si no existe, 404
  return rows[0]; // si existe devolvemos el primer resultado
}


// ======================================================
// BLOQUE 3 PROPAGAR CAMBIOS DE DOCTOR A MONGO, HISTORIALES
// ======================================================
async function propagateDoctorChangeToMongo({ oldEmail, newEmail, newName, newSpecialty }) { // esta funcion NO se exporta, solo se usa dentro del modulo, sirve para actualizar historiales en mongo
  const db = getMongoDb(); // pedimos conexion a mongo
  const col = db.collection("patient_histories"); // coleccion donde vive el historial, un doc por paciente, y adentro un arreglo de appointments

  // Actualiza solo elementos del array que coinciden con oldEmail (arrayFilters)
  // Cambia doctorEmail y/o doctorName y specialty según venga
  const setDoc = {}; // aqui armamos el $set dinamico, solo ponemos lo que realmente cambio
  if (newEmail) setDoc["appointments.$[elem].doctorEmail"] = newEmail; // si cambio email, actualiza solo los elementos del array donde el doctorEmail era el viejo
  if (newName) setDoc["appointments.$[elem].doctorName"] = newName; // si cambio nombre, igual actualiza dentro del array
  if (newSpecialty) setDoc["appointments.$[elem].specialty"] = newSpecialty; // si cambio especialidad, actualiza

  if (Object.keys(setDoc).length === 0) return; // si no hay nada que cambiar, salimos y no pegamos a mongo innecesariamente

  await col.updateMany( // updateMany porque un doctor puede estar en muchos historiales y muchas citas
    { "appointments.doctorEmail": oldEmail }, // filtro principal, solo docs que tengan alguna cita con ese email
    { $set: setDoc }, // aplicamos el set dinamico
    { arrayFilters: [{ "elem.doctorEmail": oldEmail }] } // arrayFilters es para que solo cambie los elementos que coinciden, no todo el arreglo
  );
}


// =============================================
// BLOQUE 4 UPDATE DOCTOR, TRANSACCION SQL, Y PROPAGACION A MONGO
// =============================================
export async function updateDoctor(id, payload) { // esta funcion actualiza un doctor, permite cambiar name email specialty, y sincroniza mongo
  const doctorId = Number(id); // convertimos id a numero
  if (!Number.isInteger(doctorId) || doctorId <= 0) { // validacion de id
    throw new HttpError(400, "Invalid doctor id"); // 400 dato malo
  }

  const name = payload?.name != null ? String(payload.name).trim() : undefined; // si payload trae name, lo limpiamos, si no trae queda undefined y no se actualiza
  const emailRaw = payload?.email != null ? payload.email : undefined; // email puede venir, lo dejamos sin normalizar por ahora
  const specialty = payload?.specialty != null ? String(payload.specialty).trim() : undefined; // specialty igual, limpiamos

  if (name === "" || specialty === "") throw new HttpError(400, "name/specialty cannot be empty"); // si mandan string vacio, es mala data

  let newEmail; // aqui guardamos el email normalizado si vino
  if (emailRaw !== undefined) { // si mandaron email
    newEmail = normalizeEmail(emailRaw); // normalizamos, lower, trim, etc segun tu validador
    if (!isValidEmail(newEmail)) throw new HttpError(400, "Invalid email format"); // si el formato no cuadra, 400
  }

  // Obtener doctor actual (para saber oldEmail/oldName)
  const current = await getDoctorById(doctorId); // consultamos el doctor actual para comparar cambios y para saber el oldEmail
  const oldEmail = current.email; // este es el email viejo, sirve para buscar en mongo

  // Construir UPDATE dinámico (solo campos enviados)
  const fields = []; // aqui guardamos los pedazos del SET, ej name = $1, email = $2
  const values = []; // aqui guardamos los valores reales, en el mismo orden de los placeholders
  let idx = 1; // contador de parametros, se usa para armar $1 $2 $3

  if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); } // si vino name, lo agregamos
  if (newEmail !== undefined) { fields.push(`email = $${idx++}`); values.push(newEmail); } // si vino email, lo agregamos
  if (specialty !== undefined) { fields.push(`specialty = $${idx++}`); values.push(specialty); } // si vino specialty, lo agregamos

  if (fields.length === 0) throw new HttpError(400, "No fields to update"); // si no mandaron nada, no hay update, entonces error

  values.push(doctorId); // el ultimo valor es el id para el WHERE

  // Transacción: update SQL + propagación Mongo
  const client = await pool.connect(); // pedimos un client, porque con pool.query no controlamos bien la transaccion en varios pasos
  try {
    await client.query("BEGIN"); // iniciamos transaccion, todo o nada en postgres

    const q = `
      UPDATE doctors
      SET ${fields.join(", ")}
      WHERE id = $${idx}
      RETURNING id, name, email, specialty
    `; // q es el update final, se arma dinamico, idx aqui apunta al placeholder del WHERE

    const { rows } = await client.query(q, values); // ejecutamos update con valores parametrizados

    if (rows.length === 0) throw new HttpError(404, "Doctor not found"); // por seguridad, si no actualizo nada, entonces no existe el doctor

    // Si email ya existe en otro doctor, Postgres lanza error UNIQUE -> capturamos
    const updated = rows[0]; // el doctor actualizado ya con valores finales segun postgres

    await client.query("COMMIT"); // confirmamos el update en postgres, ya queda persistido

    // Propaga a Mongo DESPUÉS de confirmar SQL (consistencia eventual controlada)
    const emailChanged = newEmail !== undefined && oldEmail !== updated.email; // cambio real de email
    const nameChanged = name !== undefined && current.name !== updated.name; // cambio real de nombre
    const specChanged = specialty !== undefined && current.specialty !== updated.specialty; // cambio real de especialidad

    if (emailChanged || nameChanged || specChanged) { // si algo cambio, sincronizamos mongo
      await propagateDoctorChangeToMongo({
        oldEmail, // buscamos con el email viejo
        newEmail: emailChanged ? updated.email : undefined, // solo mandamos lo que cambio, si no cambio mandamos undefined
        newName: nameChanged ? updated.name : undefined,
        newSpecialty: specChanged ? updated.specialty : undefined,
      });
    }

    return updated; // devolvemos al cliente el doctor actualizado
  } catch (err) {
    await client.query("ROLLBACK"); // si algo falla, deshacemos la transaccion en postgres

    // UNIQUE email violation (Postgres)
    if (err?.code === "23505") { // 23505 es unique_violation en postgres, ejemplo email repetido
      throw new HttpError(400, "Doctor email already exists"); // devolvemos 400 porque el cliente mando un email que ya existe
    }

    // Si ya es HttpError, re-lanzar
    if (err instanceof HttpError) throw err; // si nosotros ya lo armamos, solo lo devolvemos

    throw err; // si es otro error raro, lo lanzamos para que lo maneje el middleware
  } finally {
    client.release(); // pase lo que pase devolvemos el client al pool, si no, se te fugan conexiones
  }
}