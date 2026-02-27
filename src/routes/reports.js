import { Router } from "express";
// aqui traemos Router desde express porque vamos a crear un modulo de rutas separado para los reportes y mantener la aplicacion organizada

import { getRevenueReport } from "../services/reportServices.js";
// aqui importamos la funcion que contiene la logica real del reporte de ingresos, el router solo maneja http, el calculo y acceso a base de datos viven en el service

const router = Router();
// aqui creamos nuestro router, esto nos permite definir rutas relacionadas entre si y luego montarlas en la app principal


router.get("/revenue", async (req, res, next) => {
  // aqui definimos la ruta GET /reports/revenue o como la montemos en app.js
  // esta ruta nos permite obtener un reporte de ingresos total y por seguro, podemos enviar filtros de fecha usando query params

  try {
    const { startDate, endDate } = req.query;
    // leemos los parametros que pueden venir en la url
    // ejemplo /revenue?startDate=2025-01-01&endDate=2025-01-31

    const report = await getRevenueReport({ startDate, endDate });
    // llamamos al service y le pasamos las fechas
    // el service valida, construye el sql, consulta postgres y arma el resultado

    res.json({ ok: true, report });
    // devolvemos el resultado en formato json, usamos ok true para mantener estructura consistente en la api
  } catch (e) {
    next(e);
    // si ocurre cualquier error lo enviamos al middleware global de errores
    // esto mantiene el router limpio y centraliza el manejo de errores
  }
});

export default router;
// exportamos el router para poder usarlo en el archivo principal y montarlo bajo una ruta base como /reports