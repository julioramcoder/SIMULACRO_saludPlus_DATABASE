
import {readFile} from  "fs/promises"; // viene de node.js y nos permite leer docuemntos de mi pc
import {resolve} from "path"; // viene de node.js, nos permite poder construir la ruta correcta del archivo csv
import {parse} from "csv-parse/sync"; // viene de una libreria externa, toma el formato de csv y lo convierte en un texto legible en js como un arrye de objetos
import {pool} from "../config/postgres.js"; // llaamos el pool para las conexiones con la base de datos de postgreSQl, para poder inser, gaurdar datos en la base de datos
import { env } from "../config/env.js"; // aqui gaurdamos las variables de entorno
import { getMongoDb } from "../config/mongodb.js";// con esta funcion devolvemos la conexion a mongo db
import { migration } from "./migration.js";


//BLQUE #2 CON ESTO PODEMOS CREAR FUNCIONES QUE NOS PERMITE LIMPIAR Y ACOMODAR LOS DATOS ANTES DE GUARDARLOS EN LA BASE DE DATOS

// convierte el valor que viene en v en texto o si viene null regresa espacio vacio, quita espacios con trim y todo en minuscula con tolowercase
const normEmail = (v) => String(v ?? "").trim().toLocaleLowerCase();

// el replace(...busca cualquier grupo de muchos espacios seguidos y deja un solo epacio)
const normText = (v) => String(v ?? "").trim().replace(/\s+/g, " ");

//parseInt(...10) convierte texto en un numero entero y guarda en la variable n
const toInt = (v) => {
    const n = parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n: 0; //es un numero valido? 
};

const toNumber = (v) => {
    const n = Number(String(v ?? "").replace(",",".")); // si el numero viene con , entones quitaselo ponle .
    return Number.isFinite(n) ? n:0;
}; // si es un numero valido devulve n si no devulve 0
 
// clearbefore es un parametro, un valor que puede venir desde afuera y si nadie manda nada ponemos false
export async function migration(clearBefore = false){
    const csvpath = resolve(env.SIMULACRO_CSV_PATH);
} // resolve toma la ruta y la convierte en una ruta correcta y completa, ahora csvpath tiene la ruta correcta

//==============================================
// 1) leer + parsear CVS
//==============================================

const csv = await readFile(csvpath, "utf-8"); //es uan funcion que nos lee los archivos en texto normal y para eso funciona "utf-8"
 
// parse (csv) tomamos el texto y lo convertimos en objeto
const rows = parse(csv, {
    columns: true,
    trim: true,
    skip_empty_lines: true,
});
// la primera fila del csv contiene nombre de las columnas, trim: true quita los expasios de cada valor, skipe_empty... si hay lineas vacias, ignoralas

//=====================================
// 2) NORMALIZACION DE FILAS
//=====================================


//row es el array que salio de parse.map, recorre todo el array, (r) = cada fila individual ({....}) dentro va a entrar una fila del csv y sale una fila limpia y ordenada
const normalizedRows = rows.map((r) => ({
    appointmentId: normText(r.appointment_Id), 
    //(r.appointment_Id) el valor que vino del csv el normText limpia espacios y formatea texto, y se guarda en appointmentId, todo limpio y listo
    appointmentDate: normText(r.appointment_Date), 

    patientName: normText(r.patient_name),
    patientEmail: normEmail(r.patient_email),
    patientPhone: normText(r.patient_phone),
    patientAddress: normText(r.patient_address),

    doctorName: normText(r.doctor_name),
    doctorEmail: normText(r.doctor_email),
    specialty: normText(r.specialty),

    treatmentCode: normText (r.treatment_code),
    treatmentDescription : normText(r.treatment_description), // el normText limpia espacios
    treatmentCost: toNumber (r.treatment_cost), //el toNumber convierte el numero que viene en texto en numero decimal 

    insuranceProvider: normText(r.insurance_provider),
    coveragePercentage: toInt(r.coverage_percentage),

    amountPaid: toNumber(r.amount_paid)
}));

//===================================================
//BLOQUE 5 DEDUP (EVITAR DUPLICADOS)
//3) DEDUP (MAESTROS)
// ESTE BLOQUE DE CODIGO ESTA CREADO PARA EVITAR DUPLICADOS EN LAS BASES DE DATOS

// crear los 3 contebnedores sin duplicados 
const patientsByEmail = new Map(); // new map crea una extructura donde se guarda clave-valor
const doctorByEmail = new Map();
const insByName = new Map();


// en este caso solo se asegura que no se dupliquen estas tablas porque son segun nuestro analisis las unicas que no dependen de otras, su existencia generaria muchas dubplicidades, el resto de tablas y como funcionan dependen de estas 3 tablas 


for (const r of normalizedRows){ // aqui normalizedRows es el arrays limpio que ya hicimos
    //r= una fila individual entonces recorre cada elemento del arryas del arrys normalizado
    if (r.patientEmail) {
        patientsByEmail.set(r.patientEmail, { // set lo que hace es guardar usando una clave, si ya la clave existe la reemplaza, SET  es una funcion que tiene Map Y MAP ES LA ESTRUCTURA DONDE SE GUARDA UNA CLAVE VALOR EN ESTE CADO LA CLAVE ES EL CORREO ELECTONICO DEL PACIENTE EL CUAL ES UN REGISTRO UNICO Y EL VALOR ES INFORMACION ESPECIFICA DEL USUARIO
            name: r.patientName,
            email: r.patientEmail,
            phone: r.patientPhone || null,
            address: r.patientAddress,
        });
    }

    if (r.doctorEmail) { // si se cumple que en la fila actual de un registro ya normalizado es el email del doctor es el email del doctor en esa fila, entonces ejecuta lo siguiente
        doctorByEmail.set(r.doctorEmail, { // doctorbyEmail seria el map donde creamos para guardar doctores no duplicados }, el set /({......}) entonces guarda en el map el valor clave valor que tenemos aqui
            name: r.doctorName,
            email: r.doctorEmail,
            specialty: r.specialty,
        });
    }

    if(r.insuranceProvider) {
        insByName.set(r.insuranceProvider,{ 
            name: r.insuranceProvider,
            coverage_percentage: r.coveragePercentage
        });
    }
}

//==============================================

// AHORA VAMOS A GUARDAR TODO EN LA BASE DE DATOS 
// CUAL PROBLEMA ESTAMOS RESOLVIENDO AQUI?
// 1) TODO DEBE GUARDARSE EN FORMA SEGURA 
// 2) PUEDA QUE QUERRAMOS EMPEZAR DESDE CERO 
   // POR ESO EXISTE CLEARBEFORE
// 3) NECESITAMOS LOS IDS QUE GENERA LA BASE 
//4) INSERT SQL(UPSERT) + CAPTURAR IDs

// AQUI ABRIMOS CONEXION A POSTGRES, ABRIMOS CONEXION A MONGO, INICIAMOS TRANSACCION Y OPCIONALMENTE BORRA TODO SI CLEAR BEFORE ES TRUE

 const client = await pool.connect(); // llamamos a la conexion entre postgres y la aseguramos en client
  const db = getMongoDb(); // aqui obtenemos la conexion de mongo db

  // el try es porque los procesos a coninuacion son rigurosos por ende es uan forma de manejar errores 
  try {
    await client.query("BEGIN"); // empieza una transaccion y desde aqui nada queda definitivo hasta que yo haga una commit

    if (clearBefore) { // aqui se evalua si la variable es true , si es false se ignora este bloque
      // Limpieza controlada (opcional)
      await client.query("TRUNCATE appointments, patients, doctors,insurances RESTART IDENTITY CASCADE");
      await db.collection("patient_histories").deleteMany({});
    } // el truncate borra todos los datos de esas tablas que se ingresan y el reset reinicia los ids automatic since 1 el CASCADE es si hay relaciones entre tablas tambien las limpis

    //await db.collection le decimos en mongo ve a la tabla o coleccion indicada y borra todo todooo y el {} quiere decir sin filtros o sea todo 
  

  //4.1 patients ->Emails -> id
  // ahora insertaremos cada paciente en postgres
  //obetener el id que la base le asigna
  // guardar ese id en memoria
  // asociarlo con su email

      const patientIdByEmail= new Map(); // el nuevo map es para guardar el id del paciente base
  for (const p of patientsByEmail.values()) { // aqui del map donde se guardo los valores de pacientes los vamos a devolver por cada p sacara un valor

    // ahora intentamos crear un string con la consulta SQL
    const q= `INSERT INTO patients (name, email, phone, address)
        VALUES ($1,$2,$3,$4) 
        ON CONFLICT (email) DO UPDATE
          SET name = EXCLUDED.name,
              phone = EXCLUDED.phone,
              address = EXCLUDED.address
        RETURNING id;`;

        // VALUES ($....) esto nos da a entender que ahi van los valores que aunque no se escriben directamente en el texto sql
        // ON CONFLICT ...... HABLA DE QUE NO EXISTE CONFLICTO SI EXISTE, SOLO actualiza el nuevo valor
        // EXCLUDED es el valor que se intenta insertar 
        // returning id= en ambos casos devuelveme el id

    const {rows: out} = await client.query (q, [p.name, p.email, p.phone, p.address]);
    patientIdByEmail.set(p.email, out[0].id);
  }

  // client.query, vas a consultar en en el sql, con await esperamos la respuesta, lo que postgres devuleve es un objeto, el objeto tiene una propiedad llamada rows, aqui rows es un arreglo con lo que debolvio la base al usar returning id la base devuelve un id:5, ahora en {rows: out}, seria toma la propiedad rows y guardala en la variable out y asi out es un arreglo

  // ahora en PATIENTIBYEMAIL....ahora out es un arreglo, ejemplo numero 5, el id del paciente base, arriba creamos el map para guardar el id con p.email como clave y el out[0] como valor


  //4.2 doctors ->Emails -> id
     const doctorIdByEmail = new Map();
    for (const d of doctorByEmail.values()) {
      const q = `
      INSERT INTO doctors(name, email, specialty)
      VALUES ($1,$2,$3)
      ON CONFLICT (email) DO UPDATE
            SET name = EXCLUDED.name,
                specialty = EXCLUDED.specialty
        RETURNING id;
         `;
        const {rows: out} = await client.query(q,[d.name, d.email, d.specialty]);
        doctorByEmail.set(d.email, out[0].id); // aqui se sube la clave valor 
    }

    // 4.3 Insurances -> name -> id
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

     // =========================
    // 5) INSERT APPOINTMENTS (UPSERT por appointment_id)
    // =========================
    // EN ESTE BLOQUE INSERTAMOS LAS CITAS MEDICAS (UPSERT USANDO LOS IDS QUE YA CAPTURAMOS), EN ESTE CASO LO QUE SE HACE ES RECORRER CADA FILA DEL CSV Y LO CONVIERTE EN UNA CITA EN LA TABLA APPOINTMENT, EN SI LA INFORMACION DESORGANIZADA REPRESENTAN CITA MEDICAS, CONECTANDOLA CON LA TABLA DE PACIENTES, DOCTOR Y SEGUROS MEDICOS 

    for (const r of normalizedRows) {
        const patientId = patientIdByEmail.get(r.patientEmail);
        const doctorId = doctorIdByEmail.get(r.doctorEmail);
        const insuranceId = insuranceIdByName.get(r.insuranceProvider)?? null; // se devulve null porque una cita puede no tener seguro 
    } // aqui estamnos obteniendo los id de paciente, email y del seguro O "CONVIORTIENDOLA"


    // ahora vamos a insertar el SQL que hicimos en nuestra base de datos de la parte appointment, dentro dela tabla de appointment vamos a crear las relaciones correctamente al ser una tabla relacional, el SQL se arma como string poprque esta instruccion se enviara a postgres

    const q=`        INSERT INTO appointments (
          appointment_id, appointment_date,
          patient_id, doctor_id, insurance_id,
          treatment_code, treatment_description, treatment_cost,
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
          amount_paid = EXCLUDED.amount_paid;`;
    // en la primera paerte del codigo del SQL le decimos que lista de colunas se van a llenar, ($1,$2,$3,....) estos son l os espacios para los 9 valores que se van a crear en un arrays, ON CONFLIC... esto quiere decir que no existe ningun conflicto, si no existe creala y si ya existe actualiza la informacion, evita duplicidad si ejecutamos la migracion varias veces 

    await client.query(q, [ // aqui q dice, ejecuta el SQL guardado en q, 
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



    // esto funciona por pasos, primero al ser flujo de datos debemos dejar estipulado el await, entonces primero se manda el texto SQl, despues de mandan los valores de csv, postgre lo ejecuta, depsues posgre responde y y node recibe la respuesta

// postgres termina de ejecutar el INSERT
// VERIFICA LAS CLAVES FORANEAS
// APLICA EL ON CONFLICT SI ES NECESARIO
// GUARDA LA CITA EN LA BASE
// DEVULVE UNA RESPUESTA, CUANDO TERMINE CON ESTO CONTINUA CON LA SIGUINTE CITA//


    // =========================
    // 6) MONGO: patient_histories (1 doc por paciente)
    // =========================


// MONGO ESTA DISEÑADO PARA GUARDAR ALGO QUE SEA FACIL DE CONSULTAR
// EJEMPLO: DAME EL HISTORIAL COMPLETO DE PACIENTES, CON TODAS SUS CITAS EN UN SOLO OBJETO
// EN POSTGRE ESO IMPLICA HACER VARIAS CONSULTAS Y UNIR TABLAS
// MONGO GUARDA LOS DOCUMENTOS DE FORMA DIFERENTE
// 1 DOCUEMNTO POR PACIENTE
// TODAS LAS CITAS ADENTRO 
// FACIL DE LEER Y DEVOLVER EN UNA API//

// EN LA COLECCION PATIENTS_histories SE GUARDA UN DOCUMENTO POR PACIENTE Y DENTRO VA UN ARRREGLO APPOITMENT CON TODAS LAS CITAS


    const historiesByEmail = new Map(); // EN MAP GAURDAREMOS LA CLAVE VALOR (EMAIL-DOC HISTORIAL DEL PACIENTE) pero esto es solo temporal y vivve en memoria no en mongo

    for (const r of normalizedRows) { // obtnemos los valores normalizados con r es decir por fila individual del csv (una cita)

        if (!historiesByEmail.has(r.patientEmail)) {
            historiesByEmail.set(r.patientEmail, {
                patientEmail: r.patientEmail,
                appointment: [],
            });
        } // r.patientEmail es el email del paciente en esa cita/
        // historiesbyemail.has es ya existe un historial para este paciente? y con el ! seria, si todavia no hemos creado un historial para este paciente
        
        //historiesByEmail.set(r.patientEmail, crea una entrada en el map /

        // patientEmail: r.patientemail, lo que se esta haciendo es crear una etiqueta llamada patientemail y pongamosle el valor de emails que obtenemos con r de un valor ya normalizado

    }


    // AQUI LO QUE VAMOS A HACER ES AGREGAR CITAS AL HISRTORIAL DEL PACIENTE QUE YA TENEMOS
    historiesByEmail.get(r.patientEmail).appointment.push({ 

        // este objeto representa una cita medica y se inserta el valor normalizado que tenemos del csv
        appointmentId: r.appointmentId,
        date: r.appointmentDate,
        doctorName: r.doctorName,
        specialty: r.specialty,
        treatmentCode: r.treatmentCode,
        treatmentDescription: r.treatmentDescription,
        treatmentCost: r.treatmentCost,
        insuranceProvider: r.insuranceProvider,
        coveragePercentage: r.coveragePercentage,
        amountPaid: r.amountPaid
    });
    //historiesByEmail.get(r.patientEmail) historiesByEmail es el map donde guardamos los historiales, accedemos a la lista de citas  y metemeos la cita actual dentro de esa lista

    //asi/
    // historiesByEmail = Map {
//   "juan@mail.com" => {
//      patientEmail: "juan@mail.com",
//      appointment: [
//         { cita1 },
//         { cita2 }
//      ]
//   },
//   "ana@mail.com" => {
//      patientEmail: "ana@mail.com",
//      appointment: [
//         { cita1 }
//      ]
//   }
// }

// historiesByEmail es un organizador temporal.

// Cada valor dentro del Map es el historial del paciente.

// Y appointment es simplemente la lista de citas dentro de ese historial


// aqui lo que debemos hacer es gaurdar el historial em mongo, confirmar postgres, devvolver el resumen y manejar errores
    const col = db.collection("patient_histories"); // aqui quiere decir que vamos trabjar con la cdoleccion de mongo de patients 
    for (const doc of historiesByEmail.values()) { // recorre todos los historiales que contruimos en memeoria
        await col.replaceOne({patientEmail: doc.patientEmail},doc,{upsert: true}); // guarda cada hostorial en mongo crear o actualziar
        }

        await client.query("COMMIT"); // con esto confirmamos todo lo de postgress
// ahora costruiremos un resumen para decir,cuántos pacientes únicos se procesaron, cuántos doctores únicos, cuantois seguros unicos, cuantas citas,(filas del csv), cuantos historiales, y de donde se leyo
    return {
      ok: true,
      message: "Migration completed successfully",
      result: {
        patients: patientsByEmail.size,
        doctors: doctorsByEmail.size,
        insurances: insByName.size,
        appointments: normalizedRows.length,
        histories: historiesByEmail.size,
        csvPath,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err; // si algo falla deshacer el postgres y lanzar un error 
  } finally { // pase lo que pase vas a hacer lo siguiente que seria 
    client.release(); // devulve la conexion de postgress
  }


