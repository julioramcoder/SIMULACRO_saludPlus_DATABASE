import { readFile } from "fs/promises"; //Esto viene de Node, sirve para leer archivos que vienen del CSV
import { resolve } from "path"; // También viene de Node, sirve para armar bien la ruta del archivo, ayuda a que funcione igual en Windows o Linux.
import { parse } from "csv-parse/sync"; // Esto viene de una librería que instalamos con npm, sirve para convertir el CSV (texto plano) en datos que JavaScript pueda entender un arrays, básicamente transforma filas del CSV en objetos.
import { pool } from "../config/postgres.js"; // Es la conexión a PostgreSQL, Con esto vamos a guardar los datos en la base relacional.
import { env } from "../config/env.js"; // esto guarda las variables de entorno
import { getMongoDb } from "../config/mongodb.js"; // esto guarda mi historial en mongodb
import crypto from "crypto";// Sirve para crear códigos únicos usando hash,aquí lo usamos para generar un ID de cita cuando el CSV no trae uno válido.

console.log(" MIGRATION FILE LOADED:", import.meta.url);

const normEmail = (v) => String(v ?? "").trim().toLowerCase(); // intenta comvertir lo que venga a un string emails, si viene nullo conviertelo en vacio, si si hay todo en ,minuscula con tolowercase y quitale espacios con .trim
const normText = (v) => String(v ?? "").trim().replace(/\s+/g, " ");// aqui los textos, le quitamos los espcios al inicio y al final y tambien entre cada palabra, solo deja un espcio
const toInt = (v) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
}; 
// aqui intentaremos convertir los numeros que vengan en tippo string en numeros, reemplaza , por puntos
const toNumber = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// aqui intentaremos convertir en una fecha valida
const normDate = (v) => {
  if (!v) return null; // si no viene nada devulve null
  const d = new Date(v); // ahora con una variable d intentamos gudarla pero primero
  if (isNaN(d.getTime())) return null; // es una fecha valida? si no es devulve nill
  return d.toISOString().slice(0, 10); // si es una fecha valida comviertela con toISOString esto es un formato internacional pero con slice(0, 10) solo pedimos los primeros 10 caracteres que son los que muestran como tal la fecha
};

// ahora busca un valor dentro de un objeto usando varios nombres posibles, es decir, no se como venga el nombre pero lo buscare entre las opciones que mas se asemejen
const pick = (obj, keys) => { // onj el objeto que buscara y el keys una lista de posibles nombres de columnas
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k]; //hasOwnProperty el objeto realmente tiene esa propiedad? 
  } //return obj[k] si existe la propiedad devulvelo 
  return undefined;
};

// si la cita no cuenta con un id valido lo que hara la siguiente funcion sera crearle uno 
const genAppointmentId = (r, idx) => { //r es la fila del csv, idx, es el numero de la fila

  const base = [ // como no sabemos como se llaman las columnas, entomces probare de varias formas para dar flexibilidad 
    r.patient_email,
    r.patientEmail,
    r.doctor_email,
    r.doctorEmail,
    r.appointment_Date,
    r.appointment_date,
    r.appointmentDate,
    idx,
    Date.now(),
  ]
    .map((x) => String(x ?? "")) // aqui convertiremos cada valor en texto, si algo viene null o undefine, devulve un vacio

    .join("|"); // luego lo que se convirtio en texto la representaremos separadas con esta linea, creando una sola cadena, despues con  

  return `APT-${crypto.createHash("sha1").update(base).digest("hex").slice(0, 12)}`; // con createHash("sha1") crea una maquiba qye convierte el texto en un codigo unico, el texto que teenmnos lo cargamos con update(base) y luego digest("hex"). lo convierte en un codigo hexadecimal y luego con slice(0, 12)} tomamos los primeros 12 valores y al final le ponemos APT y queda como el indentificador unico
};

// funcion principal de la migracio

export async function migration(clearBefore = false) { // por defecto si no se llama a clearBefore(true) no se limpia o se borra nada antes
  console.log("MIGRATION() CALLED - clearBefore =", clearBefore); // solo muestra que la migracion comenzzo 

  const csvpath = resolve(env.SIMULACRO_CSV_PATH); // aqui contruimos una ruta correcta del archivo csv, resolve(asegura que la ruta sea valida)
  const csv = await readFile(csvpath, "utf-8"); // aqui abrimos el archivo y leemos el contenido, aqui viene como texto pero no lo queremos asi 


  // aca convertimos el texto en una lista de filas organizadas 
  const rows = parse(csv, {
    columns: true, // usando la primera fila como encabezado
    trim: true, // quitando espacion que no funcionan
    skip_empty_lines: true, // ignorando filas vacias al final 
  });

  console.log("CSV HEADERS =", Object.keys(rows[0] ?? {}));


  // TRANSFORMACION DEL CSV

  //.map es recorre cada elemento de un arreglo y crea un nuevo arreglo transformando cada elemento 

  const normalizedRows = rows.map((r, idx) => { // rows es una arrelgo que creamos en en anterior codigo, r fila del csv e inxd numero de la fila, "por cada final del csv, crea una version mejorada"

    // ahora creamos una varibable y lo que haremos sera "noramlizar". buscamos el id de la cita (pick) en la fila r, pero como no sabemos como se llama, damos la orden de buscarlo de varias formas, usamos normtext que ya la definimos anteriormente para limpiarlos
    const appointmentIdRaw = normText(
      pick(r, ["appointment_Id", "appointment_id", "appointmentId", "id"])
    );
    // lo mismo para date
    const appointmentDateRaw = normDate(
      pick(r, ["appointment_Date", "appointment_date", "appointmentDate", "date"])
    );

    // aqui ya retornamos la normalizacion de los nombres de cada columna para asi poder meterlos en la base de datos
    return {
      appointmentId: appointmentIdRaw || genAppointmentId(r, idx),
      appointmentDate: appointmentDateRaw,

      // hacemos el mismo proceso para todos los nombres de columnss
      patientName: normText(pick(r, ["patient_name", "patientName", "patient"])),
      patientEmail: normEmail(pick(r, ["patient_email", "patientEmail", "email"])),
      patientPhone: normText(pick(r, ["patient_phone", "patientPhone", "phone"])),
      patientAddress: normText(pick(r, ["patient_address", "patientAddress", "address"])),

      doctorName: normText(pick(r, ["doctor_name", "doctorName", "doctor"])),
      doctorEmail: normEmail(pick(r, ["doctor_email", "doctorEmail"])),
      specialty: normText(pick(r, ["specialty", "doctor_specialty"])),

      treatmentCode: normText(pick(r, ["treatment_code", "treatmentCode"])),
      treatmentDescription: normText(pick(r, ["treatment_description", "treatmentDescription"])),
      treatmentCost: toNumber(pick(r, ["treatment_cost", "treatmentCost"])),

      insuranceProvider: normText(pick(r, ["insurance_provider", "insuranceProvider", "insurance"])),
      coveragePercentage: toInt(pick(r, ["coverage_percentage", "coveragePercentage"])),

      amountPaid: toNumber(pick(r, ["amount_paid", "amountPaid"])),
    };
  });

  // con console, mostramos los nombres normalizados 
  console.log("normalizedRows =", normalizedRows.length);
  console.log("sample row 0 =", normalizedRows[0]);


//MAP es un tipo especial de estructura de datos, es como una tabla rapida en memoria donde se guarda cosas usando una clave unica (clave:valor) 
  const patientsByEmail = new Map();
  const doctorsByEmail = new Map();
  const insByName = new Map();

  // en este caso por paciente. la clave unica es el email y el valor los datos del paciente, esta informacion es unica, entonces antes de insertar en la base de datos aqui los organizamos y y los deduplicamos
  for (const r of normalizedRows) {
    if (r.patientEmail) {
      patientsByEmail.set(r.patientEmail, {
        name: r.patientName,
        email: r.patientEmail,
        phone: r.patientPhone || null,
        address: r.patientAddress || null,
      });
    }
    // imaginemos esto, cada fila representa una cita medica, aunque la informacion este normalizada por columnas, todos con el nombre correspondiente pero, si hay 20 filas con el mismo pacinte, estamos duplicando la informacion por eso no es solvente, entonces lo que hacemos es guardarla en estos MAPS antes de subirlos a la base de datos 
    if (r.doctorEmail) {
      doctorsByEmail.set(r.doctorEmail, {
        name: r.doctorName,
        email: r.doctorEmail,
        specialty: r.specialty || null,
      });
    }
    if (r.insuranceProvider) {
      insByName.set(r.insuranceProvider, {
        name: r.insuranceProvider,
        coverage_percentage: r.coveragePercentage,
      });
    }
  }

  // ahora llamamos a nuestras 2 bases de datos correspondientes y las conexiones las gurdamos en 2 variables

  const client = await pool.connect();
  const db = getMongoDb();

  // ahora intentaremos hacer una transaccion en postgres
  try {
    await client.query("BEGIN"); // Desde ahora todo lo que haga en la base de datos es parte de un solo paquete, esto lo indicamos con el begin, si todo sale bien se ejecuta, si algo falla se cancela todo 

// si la funcion es llamada como true entonces, entonces ejecuta lo siguiente 
    if (clearBefore) {
      await client.query("TRUNCATE appointments, patients, doctors, insurances RESTART IDENTITY CASCADE");
      await db.collection("patient_histories").deleteMany({});
    } 
// Borra completamente esas tablas.”

// TRUNCATE = vaciar tabla rápidamente.

// RESTART IDENTITY = reiniciar los contadores de ID (empiezan otra vez en 1).

// CASCADE = si hay relaciones, bórralas también sin que falle.

    const patientIdByEmail = new Map(); // creamos otro map para gurdar ahora si con un nombre difernete
    for (const p of patientsByEmail.values()) {
      const q = `
        INSERT INTO patients (name, email, phone)
        VALUES ($1,$2,$3)
        ON CONFLICT (email) DO UPDATE 
          SET name = EXCLUDED.name,
              phone = EXCLUDED.phone
        RETURNING id;
      `;
// extraemos la informacion del primer MAP que hicimos y damos la orden de, si ya existe, actualiza la informacion del paciente y al finalizar retorname el id
      const { rows: out } = await client.query(q, [p.name, p.email, p.phone]); // basicamente aqui damos la orden de insertar en la base de datos y como desde un comienzo estipulamos que se nos devuelva el id entonces con   { rows: out } lo extraemos, el id que creo postgres 
      patientIdByEmail.set(p.email, out[0].id); // ahora guardamos la relacion de id con respecto al email en patientidbyemail, para que en la tabla apointment haya una relacion del id con el email y el email con su tabla correspondiente del paciente
    }

    const doctorIdByEmail = new Map();
    for (const d of doctorsByEmail.values()) {
      const q = `
        INSERT INTO doctors(name, email, specialty)
        VALUES ($1,$2,$3)
        ON CONFLICT (email) DO UPDATE
          SET name = EXCLUDED.name,
              specialty = EXCLUDED.specialty
        RETURNING id;
      `;
      const { rows: out } = await client.query(q, [d.name, d.email, d.specialty]); //await client.query(q, [d.name, d.email, d.specialty]) seria como decirle a la base de datos que guarde esta informacion 
      doctorIdByEmail.set(d.email, out[0].id);
    }

    const insuranceIdByName = new Map();
    for (const i of insByName.values()) {
      const q = `
        INSERT INTO insurances (name, coverage_percentage)
        VALUES ($1,$2)
        ON CONFLICT (name) DO UPDATE
          SET coverage_percentage = EXCLUDED.coverage_percentage
        RETURNING id;
      `;
      const { rows: out } = await client.query(q, [i.name, i.coverage_percentage]);
      insuranceIdByName.set(i.name, out[0].id);
    }

const qAppointments = `
  INSERT INTO appointments (
    appointment_id,
    appointment_date,
    patient_id,
    doctor_id,
    insurance_id,
    treatment_code,
    treatment_description,
    treatment_cost,
    amount_paid
  )
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
  ON CONFLICT (appointment_id) DO UPDATE SET
    appointment_date = EXCLUDED.appointment_date,
    patient_id = EXCLUDED.patient_id,
    doctor_id = EXCLUDED.doctor_id,
    insurance_id = EXCLUDED.insurance_id,
    treatment_code = EXCLUDED.treatment_code,
    treatment_description = EXCLUDED.treatment_description,
    treatment_cost = EXCLUDED.treatment_cost,
    amount_paid = EXCLUDED.amount_paid
  RETURNING id;
`;
 
// estos contadores solo sirven para llevar un control de lo que pasa 
    let withDate = 0; // cuantas citas sí tienen fechas validas
    let insertedAppointments = 0; // el numero de citas que se lograron insertar
    let missingFK = 0; // cuantas citas no se pudieron insertar porque faltaba paciente o doctor 


    for (const r of normalizedRows) {
      if (!r.appointmentDate) continue; // si no tiene una una fecha de cita definida salta esta linea

      withDate++; // y si sí la tiene entonces aumenta el contador  

      const patientId = patientIdByEmail.get(r.patientEmail); // aqui pedimos el id del paciente que corresponde a este email
      const doctorId = doctorIdByEmail.get(r.doctorEmail); // igual 
      const insuranceId = r.insuranceProvider ? (insuranceIdByName.get(r.insuranceProvider) ?? null) : null; // si la cita tieene seguro entonces buscamos el id y si no guarda como null

      if (!patientId || !doctorId) {
        missingFK++; // aqui si no existe paciente o doctor entones aumenta este contador 
        continue;
      } 



 const res = await client.query(qAppointments, [ // aqui ya se da la orden de subir los valores a la base de datos con la estructura que se creo 
  r.appointmentId,       
  r.appointmentDate,     
  patientId,             
  doctorId,              
  insuranceId,           
  r.treatmentCode,
  r.treatmentDescription,
  r.treatmentCost,
  r.amountPaid,
]);

      insertedAppointments += res.rowCount ?? 0; // con esto contamos el numero de citas que se inserto
    }

    const { rows: c1 } = await client.query("SELECT COUNT(*)::int AS c FROM appointments;");
    const appointmentsCountDb = c1[0].c; // conteo en postgres, del numero de citas que se ingreesaron, antes del commit


    // control de resultados
    console.log("withDate =", withDate, "insertedAppointments =", insertedAppointments, "missingFK =", missingFK);
    console.log("COUNT appointments BEFORE COMMIT =", appointmentsCountDb);


//  CONTRUCCION DE HISTORIALES EN MONGO DB 

    const historiesByEmail = new Map(); // CREAMOS UN NUEVO OBEJTO CON EL MAP UNA LIBRETA, AQUI AGRUPAREMOS TODAS LAS CITAS POR PACIENTE
    for (const r of normalizedRows) // SE RECORRE TODAS LAS CITAS CELDAS, SIENDO R EL ITERADOR
        { 
      const patientEmailKey = r.patientEmail?.trim().toLowerCase(); // AQUI TOMAMOS EL EMAIL DEL PACIENTE QUE ES UNICO, LEQUITAMOS ESPACIO Y LO PASAMOS A MINUSCULA, 
      if (!patientEmailKey) continue; // SI NO HAY EMAIL, LA CITA NO SE AGREGA 

      if (!historiesByEmail.has(patientEmailKey)) { // SI EL PACIENTE DE ESTE EMAIL AUN NO TIENE HISTORIAL, CREALO, HAS ES EXISTE O SEA SI NO EXISTE
        historiesByEmail.set(patientEmailKey, { patientEmail: patientEmailKey, appointment: [] }); // ESE ESPACIO VACCIO ES PARA SUBIR TODA LA INFORMACION DEL PACIENTE RELACIONADO CON ESE CORREO ELECTRONICO
      }

      historiesByEmail.get(patientEmailKey).appointment.push({
        appointmentId: r.appointmentId,
        date: r.appointmentDate,
        doctorName: r.doctorName,
        doctorEmail: r.doctorEmail, //  NUEVO
        specialty: r.specialty,
        treatmentCode: r.treatmentCode,
        treatmentDescription: r.treatmentDescription,
        treatmentCost: r.treatmentCost,
        insuranceProvider: r.insuranceProvider,
        coveragePercentage: r.coveragePercentage,
        amountPaid: r.amountPaid,
      });
    }

    const col = db.collection("patient_histories");
    for (const doc of historiesByEmail.values()) { // EN ESTA PARTE LO QUE HACEMOS ES RECORRER TODOS LOS HISTORIALES QUE CONSTRUIMOS EN MEMORIA
      await col.replaceOne({ patientEmail: doc.patientEmail }, doc, { upsert: true });
    } // patientEmail: doc.patientEmail BUSCA EN LA COLECCION UN DOCUMENTO, CUYA PATIENTEMAIL SEA ESTE, EL DOC SIGNIFICA, SI LO ENCUENTRAS REEMPLAZADO CON ESTE DOC, Y SI NO ENTONCES CREA UNO NUEVO Y EL UPSERT TRUE ES HAZLO 

    await client.query("COMMIT"); // ESTO ES COMO UN TODO SALIO BIEN, AHORA SI GUARDA LOS CAMBIOS DEFINITIVOS EN POSTGRES

    return {
      ok: true,
      message: "Migration completed successfully",
      result: { // A CONTINUACION SE MUESTRA EL NUMERO DE PACIENTES UNICOS REGISTRADOS
        patients: patientsByEmail.size,
        doctors: doctorsByEmail.size,
        insurances: insByName.size,
        appointments: insertedAppointments,
        histories: historiesByEmail.size,
        csvPath: csvpath,
        appointments_withDate: withDate,
        appointments_missingFK: missingFK,
        appointments_count_db: appointmentsCountDb,
      },
    }; // SI SE PRESENTA UN PROBLEMA ESTA ERROR LO MOSTRARA 
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}