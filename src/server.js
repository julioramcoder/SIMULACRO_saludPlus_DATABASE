import app from "./app.js";
import {env} from "./config/env.js";
import {connectMongo} from "./config/mongodb.js";
import {pool} from "./config/postgres.js";
import { migration } from "./services/migrationServices.js";

async function main() {
    await pool.query("SELECT 1") // con await solamente hacemos una consulta siemple en POSTGRES, no busquemos datos solo validemos conexiones
    await connectMongo(); // validacion del funcionamiento de mongo

    //await migration()

    // aqui comenzamos a escuchar peticiones en el puerto 
    app.listen(env.PORT, ()=> {
        console.log(`API running on htttp://localhost:${env.PORT}`); // {env.port...} esto seria el puerto seleccionado 
    });
    
}

//si algo sale mal en la main, manejamos el error aqui
main().catch((err)=> {
console.error("fatal error", err); 
process.exit(1); // esta parte de process dice, apaga la aplicacion de inmediato 
});


