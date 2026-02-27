// manejo de errores en EXPRESS, EN ESTE CASO CAPTURA LOS ERRORES QUE OCURRAN EN LA APP, DECIDE QUECODIGO HTTP DEVOLVER Y DECICIR QUE MENSAJE ENVIAR AL USUARIO

import { HttpError } from "../utils/httpError.js"; // trae la clase de http error para pdoer validar si el error es uno que nosotros hayamos creado

export function errorHandler(err, req, res, next) { //  en express, un midddleware de error tiene 4 parametros

    // aqui continua la validacion de errores por ejemplo 
  const status = err instanceof HttpError ? err.status : 500;
//  err instanceof HttpError ? lo que hace es preguntar si el error fue creado, si no fue asi entonces lanzamos el error 500
  // Mensaje seguro (no filtrar internals)
  const message = // aqui se decique que se mostrara un error al cliente
    err instanceof HttpError // este es un error que yo cree? si es si, usamos el mensaje creado si es no 
      ? err.message
      : "Internal server error"; // MANDAMOS ESTE MENSAJE

  res.status(status).json({ ok: false, error: message }); // mandamos el error al cliente con esto
}