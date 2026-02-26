import pg from "pg"; // aqui estamos importando la libreria pg para que nuestro Node.js se conecte con postgreSQl, basicamente esto es lo que traduce de idioma postgrest a java script

import { env } from "./env.js"; //esto se importa para poder usar las variables, especialmente DATABASE_url


// resulta que para que postgreSQL y Node.js se puedan comunicar necesitas un traductor, por ende necesita conexiones para poder interactuar con la base de datos 
const { Pool } = pg;


// ahora lo que vamos a hacer es crear un pool de conexiones hacia postgreSQL y guardala en pool, con esto podremos hacer consultas en mi postgres
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

