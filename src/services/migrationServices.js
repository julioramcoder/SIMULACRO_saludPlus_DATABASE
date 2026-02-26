
import {readFile} from  "fs/promises"; // viene de node.js y nos permite leer docuemntos de mi pc
import {resolve} from "path"; // viene de node.js, nos permite poder construir la ruta correcta del archivo csv
import {parse} from "csv-parse/sync"; // viene de una libreria externa, toma el formato de csv y lo convierte en un texto legible en js como un arrye de objetos
import {pool} from "../config/postgres.js"; // llaamos el pool para las conexiones con la base de datos de postgreSQl, para poder inser, gaurdar datos en la base de datos
import { env } from "../config/env.js"; // aqui gaurdamos las variables de entorno
import { getMongoDb } from "../config/mongodb.js";// con esta funcion devolvemos la conexion a mongo db
import { ReturnDocument } from "mongodb";
import { migration } from "./migration.js";
import { clear } from "console";
import { read } from "fs";

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
        doctorByEmail.set(d.email, out[0].id);
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
}
