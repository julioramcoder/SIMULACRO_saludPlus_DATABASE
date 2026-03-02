import { pool } from "../config/postgres.js"; 
// pool viene de postgres, es el encargado de manejar la conexion con la base de datos
// sirve para ejecutar consultas sql como select sum group by etc

import { HttpError } from "../utils/httpError.js"; 
// HttpError es una clase que creamos nosotros sirve para lanzar errores con codigo como 400 o 404, esto ayuda a que la api responda correctamente al cliente

import { isValidISODate } from "../utils/validators.js"; 
// isValidISODate es una funcion que valida que la fecha venga en formato correcto, ejemplo valido 2025-01-31
// ejemplo invalido 31-01-2025 o hola


export async function getRevenueReport({ startDate, endDate } = {}) {   
  // esta funcion genera un REPORTE DE INGRESOS, puede recibir fechas opcionales para filtrar por periodo
  // si no recibe nada calcula todo el historial

  // ============================
  // 1 VALIDAR FECHAS SI EXISTEN
  // ============================

  if (startDate && !isValidISODate(startDate)) 
    throw new HttpError(400, "Invalid startDate (YYYY-MM-DD)");
  // si mandan startDate pero no tiene formato correcto lanzamos error 400
  // 400 significa que el cliente envio datos incorrectos

  if (endDate && !isValidISODate(endDate)) 
    throw new HttpError(400, "Invalid endDate (YYYY-MM-DD)");

  const params = []; 
  // params es un arreglo donde guardamos los valores que iran en el sql, esto se usa junto con $1 $2 para evitar inyeccion sql

  let where = ""; 
  // where empieza vacio, aqui vamos a construir el filtro de fechas dependiendo de lo que venga


  // ============================
  // 2 CONSTRUIR FILTRO DE FECHAS
  // ============================

  if (startDate && endDate) {
    // si vienen las dos fechas usamos BETWEEN, between significa entre una fecha y otra

    params.push(startDate, endDate);
    // startDate sera $1, endDate sera $2

    where = `WHERE a.appointment_date BETWEEN $1 AND $2`;
    // filtramos citas entre esas fechas
  } 
  else if (startDate) {
    // si solo viene startDate

    params.push(startDate);
    // aqui solo existe $1

    where = `WHERE a.appointment_date >= $1`;
    // traemos citas desde esa fecha hacia adelante
  } 
  else if (endDate) {
    // si solo viene endDate

    params.push(endDate);

    where = `WHERE a.appointment_date <= $1`;
    // traemos citas hasta esa fecha
  }


  // ============================
  // 3 CALCULAR TOTAL DE INGRESOS
  // ============================

  const totalSql = `
    SELECT COALESCE(SUM(a.amount_paid), 0) AS total_revenue
    FROM appointments a
    ${where};
  `;
  // SUM suma todos los amount_paid, amount_paid es el dinero que realmente se pago, COALESCE sirve para que si no hay datos devuelva 0 y no null
  // ${where} agrega el filtro si existe

  const totalRes = await pool.query(totalSql, params);
  // ejecutamos el sql en postgres, params llena los $1 $2 si existen

  const totalRevenue = Number(totalRes.rows[0]?.total_revenue ?? 0);
  // postgres a veces devuelve numeros como texto, por eso convertimos a Number, si por alguna razon viene null usamos 0
  // aqui estamos diciendo pool.query(totalSql, params) ejecuta la consulta que esta guardada en la variable


  // ============================
  // 4 INGRESOS AGRUPADOS POR SEGURO
  // ============================
 
  // del dinero que entro ¿cuanto de ese dinero vino de cada seguro y cuantas citas aporto cada uno
  
  const bySql = `
    SELECT
      COALESCE(i.name, 'SinSeguro') AS insurance_name,
      COALESCE(SUM(a.amount_paid), 0) AS total_amount,
      COUNT(*) AS appointment_count
    FROM appointments a
    LEFT JOIN insurances i ON i.id = a.insurance_id
    ${where}
    GROUP BY COALESCE(i.name, 'SinSeguro')
    ORDER BY total_amount DESC;
  `;
  // LEFT JOIN conecta appointments con insurances, left join significa que aunque no tenga seguro la cita no se pierde, si insurance_id es null entonces i.name sera null
  // por eso usamos COALESCE para mostrar SinSeguro
  // GROUP BY agrupa por nombre de seguro, COUNT cuenta cuantas citas hay por seguro, ORDER BY ordena de mayor ingreso a menor

  const byRes = await pool.query(bySql, params);
  // ejecutamos el query agrupado, usamos los mismos params para que el filtro sea igual que en el total


  // ============================
  // 5 DEVOLVER RESULTADO FINAL
  // ============================

  return {
    totalRevenue, 
    // total general de ingresos

    byInsurance: byRes.rows.map((r) => ({
      insuranceName: r.insurance_name,
      // nombre del seguro o SinSeguro

      totalAmount: Number(r.total_amount),
      // total que genero ese seguro

      appointmentCount: r.appointment_count,
      // cuantas citas aportaron a ese total
    })),

    period: {
      startDate: startDate || null,
      endDate: endDate || null,
      // esto sirve para que el cliente sepa que filtro se aplico
    },
  };
}