import { Router } from "express";
// aqui traemos Router desde express porque vamos a crear un modulo de rutas para pacientes y mantener el proyecto organizado por responsabilidades

import { getPatientHistoryByEmail } from "../services/patientsServices.js";
// aqui importamos la funcion que contiene la logica real para obtener el historial del pacient, el router solo maneja la parte http, la consulta a mongo y el resumen viven en el service

const router = Router();
// creamos una instancia del router para definir rutas relacionadas con pacientes


router.get("/:email/history", async (req, res, next) => {
  // aqui definimos la ruta GET /patients/:email/history
  // esta ruta nos permite obtener el historial completo de un paciente usando su email como identificador unico

  try {
    const { patient, appointments, summary } = await getPatientHistoryByEmail(req.params.email);
    // tomamos el email desde los parametros de la url, llamamos al service que valida el email, consulta mongo y construye el resumen del historial

    res.json({ ok: true, patient, appointments, summary });
    // devolvemos una respuesta estructurada con:
    // los datos basicos del paciente, la lista completa de citas y el resumen calculado
  } catch (e) {
    next(e);
    // si el email es invalido o el paciente no existe enviamos el error al middleware global
  }
});


export default router;
// exportamos el router para montarlo en la aplicacion principal bajo una ruta base como /patients