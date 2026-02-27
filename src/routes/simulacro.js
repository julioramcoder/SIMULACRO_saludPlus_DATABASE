// router es una herramienta de express que nos permite crear un conjunto de rutas organizadas, para que sirve router, esto nos permite devidir una API en mnodulos, con el fin de evitar poner todas las rutas en app.js

import { Router } from "express"; 
const router = Router(); // esto crea una instancia, es comoc crear un mini-servidor dentro del servidor principal, esto nos sirve para organizar todas las rutas, debido a que cada ruta debe estar separada
import { migration } from "../../src/services/migrationServices.js";

// cuandoi alguien haga una peticion a router, enviales el mensaje de que estamos trabajando 
router.get ("/", (req, res) => {
    res.json({ok: true, message: "simulacro SaludPlus API running"});

});

// este end point dispara la migracion,AQUI SE CREA UNA RUTA EN API, CUANDO ALGUIEN HAGA UNA PETICION EN HTTP TIPO POST, ESTO SE EHJECUTA CON LA FUNCION MIGRATION 

router.post("/migrate", async (req, res) => { // la peticion migrate esta hecha para leet csv, insertar pacientes, insertar doctores, insertar citas, crear historial en mongo, es un bonton que dice corre todo el proceso de migracion ahora, CLEAR BEFORE ESTA para preguntar, antes de migrar quiero borrar todo o no? es true la migracion  hace TRUNCATE
  try { // intentamos ejecutar la migracion
    const clearBefore = Boolean(req.body?.clearBefore); // lee el req lo convierte en true o false lo guarda en clearbefore 
    const out = await migration(clearBefore); // usa la respuesta y llama la fucnion migration y se hace lo que se pidio y lo que devulve se guarda en out
    res.json(out); // devulve al cliente la respuesta el formato json
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;