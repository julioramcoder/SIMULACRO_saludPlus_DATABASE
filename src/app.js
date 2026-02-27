import express from "express"; // traemos a la herramienta que nos permite crear un servidor, esta es la que va a recibir peticiones 

import simulacroRouter from "./routes/simulacro.js"; // aqui lo que hacemos es llamar al minirecepcionista, que nos ayudara a organizar 
import doctorsRouter from "./routes/doctors.js"; // este minirecepcionista se encargara de todo lo relacionado a doctores
import reportsRouter from "./routes/reports.js"; // este se encargara de las rutas de reportes como ingresos
import patientsRouter from "./routes/patients.js"; // este organiza todo lo relacionado a pacientes e historiales

import { errorHandler } from "./middlewares/errorHandler.js"; // este es el manejador global de errores, centraliza todos los errores del sistema


const app = express(); // crreamos con express un servidor principal 
app.use(express.json()); // cuando alguien me mande datos tipo json, conviertelos en algo que yo pueda usar dentro de req.body


app.get("/health",(req, res)=> res.json({ok:true})); 
// creamos una ruta para validar que el servicio este activo y este funcionando 
// si responde ok true significa que el servidor esta levantado correctamente


app.use("/api/simulacro", simulacroRouter); 
// aqui damos una orden y es que todo lo que comience con /api/simulacro sera enviado al minirecepcionista simulacroRouter

app.use("/api/doctors", doctorsRouter); 
// aqui indicamos que todo lo que comience con /api/doctors sera manejado por el router de doctores

app.use("/api/reports", reportsRouter); 
// aqui conectamos las rutas de reportes, por ejemplo /api/reports/revenue

app.use("/api/patients", patientsRouter); 
// aqui conectamos las rutas relacionadas con pacientes y sus historiales


// siempre al final
app.use(errorHandler); 
// este middleware debe ir al final porque captura cualquier error que haya ocurrido en las rutas anteriores
// centraliza el manejo de errores y evita que el servidor se caiga


export default app; // exportamos por default a app