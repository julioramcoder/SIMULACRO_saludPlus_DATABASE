import { Router } from "express"; 
// aqui importamos Router desde express, lo usamos para crear un modulo de rutas separado y mantener organizado el proyecto

import { listDoctors, getDoctorById, updateDoctor } from "../services/doctorServices.js";
// aqui traemos las funciones del servicio de doctores, el router solo maneja http, la logica real vive en el service


const router = Router();
// aqui creamos una instancia de Router, esto nos permite definir rutas como si fuera una mini aplicacion
router.get("/", async (req, res, next) => {
  // aqui definimos la ruta GET /doctors, esta ruta sirve para listar doctores y opcionalmente filtrar por especialidad

  try {
    const specialty = req.query.specialty;
    // leemos el query param specialty si viene en la url, ejemplo /doctors?specialty=Cardiology

    const doctors = await listDoctors({ specialty });
    // llamamos al service y le pasamos la especialidad, el service se encarga de consultar la base de datos

    res.json({ ok: true, doctors });
    // respondemos en formato json con una estructura clara, ok true indica que todo salio bien
  } catch (e) {
    next(e);
    // si ocurre cualquier error lo enviamos al middleware global de errores
  }
});
router.get("/:id", async (req, res, next) => {
  // aqui definimos GET /doctors/:id
  // esta ruta sirve para obtener un doctor especifico por su id

  try {
    const doctor = await getDoctorById(req.params.id);
    // tomamos el id desde la url y lo enviamos al service para buscarlo en la base de datos
    res.json({ ok: true, doctor });
    // devolvemos el doctor encontrado
  } catch (e) {
    next(e);
    // si no existe o el id es invalido el service lanza error y aqui lo pasamos al manejador global
  }
});
router.put("/:id", async (req, res, next) => {
  // aqui definimos PUT /doctors/:id
  // esta ruta nos permite actualizar un doctor existente

  try {
    const doctor = await updateDoctor(req.params.id, req.body);
    // enviamos el id desde la url y los datos nuevos desde el body
    // el service se encarga de validar, actualizar en postgres y sincronizar mongo si hace falta

    res.json({ ok: true, message: "Doctor updated successfully", doctor });
    // devolvemos mensaje de confirmacion junto con el doctor actualizado
  } catch (e) {
    next(e);
    // cualquier error lo enviamos al middleware de errores
  }
});
export default router;
// exportamos el router para poder montarlo en app.js o server.js como /doctors