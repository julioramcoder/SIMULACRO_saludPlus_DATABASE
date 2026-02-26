// router es una herramienta de express que nos permite crear un conjunto de rutas organizadas, para que sirve router, esto nos permite devidir una API en mnodulos, con el fin de evitar poner todas las rutas en app.js

import { Router } from "express"; 
const router = Router(); // esto crea una instancia, es comoc crear un mini-servidor dentro del servidor principal, esto nos sirve para organizar todas las rutas, debido a que cada ruta debe estar separada


// cuandoi alguien haga una peticion a router, enviales el mensaje de que estamos trabajando 
router.get ("/", (req, res) => {
    res.json({ok: true, message: "simulacro SaludPlus API running"});

});
export default router;