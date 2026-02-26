import { MongoClient } from "mongodb"; // mongo client es el contenedor oficial para comunicarnos con MongoDB
import {env} from "./env.js" // aqui tenemos nuestras variables de entorno 

// lo que hacemos es crear la conexion a mongo usando la URL que definimos en .env.js

let client; // el cliente que se conecta a mongo
let db; // la base de datos que ya se selecciono de 


//esta forma guardamos la conexion y podemos reutilizarla 


// aqui estamos creando una funcion que se conecta a mongodb, async porque las conexiones toman tiempo
export async function connectMongo() {
    if (db) return db; // si existe una conexion la devuelve inmediato

// aqui creamos un cliente usando la direccion de mongo y esto crea la conexion al servidor
    client = new MongoClient(env.MONGODB_URI);
    await client.connect();

    db = client.db(env.MONGODB_DB); //seleccionamos la base de datos que vamos a usar 

    await db.collection("patient_histories").  createIndex(
        {patientEmail: 1},
        {unique: true}
    ); // creamos un indice en el campo, para realizar busquedas por email mas rapido
    
    // await db.collection es comod ecir, voy a trabajar con la siguiente coleccion 
    return db; 
}

// con esto devolvemos la base de datos que ya fue conectada y que pueda ser importada en cualquier lado, pero antes VALIDA la conexion 
export function getMongoDb() {
    if (!db) throw new Error ("MongoDB not connected yet");
    return db;
} // si alguien intenta usar mongo antes de que carge lanza un error