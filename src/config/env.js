import dotenv from "dotenv";
dotenv.config(); //carga las variables del archivo .env en process.env y esto para pder usar las varibales de entorno que tenemos en .env

// Este bloque contiene todad las variables importantes, para centralizar la configuracion del proyecto en un solo lugar 

export const env = {
    PORT: process.env.PORT || 3000, // el || significa que si lo de la drecha no existe usa lo de la izquierda 

    DATABASE_URL: process.env.DATABASE_URL, // con esto conectamos la aplicacion con la base de datos 
    MONGODB_URI: process.env.MONGODB_URI, // direccion para conectarse a mongo 
    MONGODB_DB: process.env.MONGODB_DB, // define que base dentro de mongo usar 
    SIMULACRO_CSV_PATH: process.env.SIMULACRO_CSV_PATH //guarda la ruta del archivo csv
};

// acontinuacion se hara una validacion de seguridad, recorre una lista de nombres de variables importantes y verifica la dxistencia de cada una
for(const k of ["DATABASE_URL","MONGODB_DB","SIMULACRO_CSV_PATH"]) {if (!env[k]) throw new Error(`Missing env var: ${k}`)}