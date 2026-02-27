import { readFile } from "fs/promises";
import { resolve } from "path";
import { parse } from "csv-parse/sync";
import { pool } from "../config/postgres.js";
import { env } from "../config/env.js";
import { getMongoDb } from "../config/mongodb.js";
import crypto from "crypto";

console.log(" MIGRATION FILE LOADED:", import.meta.url);

const normEmail = (v) => String(v ?? "").trim().toLowerCase();
const normText = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const toInt = (v) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
};
const toNumber = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const normDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};
const pick = (obj, keys) => {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  return undefined;
};
const genAppointmentId = (r, idx) => {
  const base = [
    r.patient_email,
    r.patientEmail,
    r.doctor_email,
    r.doctorEmail,
    r.appointment_Date,
    r.appointment_date,
    r.appointmentDate,
    idx,
    Date.now(),
  ]
    .map((x) => String(x ?? ""))
    .join("|");
  return `APT-${crypto.createHash("sha1").update(base).digest("hex").slice(0, 12)}`;
};

export async function migration(clearBefore = false) {
  console.log("MIGRATION() CALLED - clearBefore =", clearBefore);

  const csvpath = resolve(env.SIMULACRO_CSV_PATH);
  const csv = await readFile(csvpath, "utf-8");

  const rows = parse(csv, {
    columns: true,
    trim: true,
    skip_empty_lines: true,
  });

  console.log("CSV HEADERS =", Object.keys(rows[0] ?? {}));

  const normalizedRows = rows.map((r, idx) => {
    const appointmentIdRaw = normText(
      pick(r, ["appointment_Id", "appointment_id", "appointmentId", "id"])
    );
    const appointmentDateRaw = normDate(
      pick(r, ["appointment_Date", "appointment_date", "appointmentDate", "date"])
    );

    return {
      appointmentId: appointmentIdRaw || genAppointmentId(r, idx),
      appointmentDate: appointmentDateRaw,

      patientName: normText(pick(r, ["patient_name", "patientName", "patient"])),
      patientEmail: normEmail(pick(r, ["patient_email", "patientEmail", "email"])),
      patientPhone: normText(pick(r, ["patient_phone", "patientPhone", "phone"])),
      patientAddress: normText(pick(r, ["patient_address", "patientAddress", "address"])),

      doctorName: normText(pick(r, ["doctor_name", "doctorName", "doctor"])),
      doctorEmail: normEmail(pick(r, ["doctor_email", "doctorEmail"])),
      specialty: normText(pick(r, ["specialty", "doctor_specialty"])),

      treatmentCode: normText(pick(r, ["treatment_code", "treatmentCode"])),
      treatmentDescription: normText(pick(r, ["treatment_description", "treatmentDescription"])),
      treatmentCost: toNumber(pick(r, ["treatment_cost", "treatmentCost"])),

      insuranceProvider: normText(pick(r, ["insurance_provider", "insuranceProvider", "insurance"])),
      coveragePercentage: toInt(pick(r, ["coverage_percentage", "coveragePercentage"])),

      amountPaid: toNumber(pick(r, ["amount_paid", "amountPaid"])),
    };
  });

  console.log("normalizedRows =", normalizedRows.length);
  console.log("sample row 0 =", normalizedRows[0]);

  const patientsByEmail = new Map();
  const doctorsByEmail = new Map();
  const insByName = new Map();

  for (const r of normalizedRows) {
    if (r.patientEmail) {
      patientsByEmail.set(r.patientEmail, {
        name: r.patientName,
        email: r.patientEmail,
        phone: r.patientPhone || null,
        address: r.patientAddress || null,
      });
    }
    if (r.doctorEmail) {
      doctorsByEmail.set(r.doctorEmail, {
        name: r.doctorName,
        email: r.doctorEmail,
        specialty: r.specialty || null,
      });
    }
    if (r.insuranceProvider) {
      insByName.set(r.insuranceProvider, {
        name: r.insuranceProvider,
        coverage_percentage: r.coveragePercentage,
      });
    }
  }

  const client = await pool.connect();
  const db = getMongoDb();

  try {
    await client.query("BEGIN");

    if (clearBefore) {
      await client.query("TRUNCATE appointments, patients, doctors, insurances RESTART IDENTITY CASCADE");
      await db.collection("patient_histories").deleteMany({});
    }

    const patientIdByEmail = new Map();
    for (const p of patientsByEmail.values()) {
      const q = `
        INSERT INTO patients (name, email, phone)
        VALUES ($1,$2,$3)
        ON CONFLICT (email) DO UPDATE
          SET name = EXCLUDED.name,
              phone = EXCLUDED.phone
        RETURNING id;
      `;
      const { rows: out } = await client.query(q, [p.name, p.email, p.phone]);
      patientIdByEmail.set(p.email, out[0].id);
    }

    const doctorIdByEmail = new Map();
    for (const d of doctorsByEmail.values()) {
      const q = `
        INSERT INTO doctors(name, email, specialty)
        VALUES ($1,$2,$3)
        ON CONFLICT (email) DO UPDATE
          SET name = EXCLUDED.name,
              specialty = EXCLUDED.specialty
        RETURNING id;
      `;
      const { rows: out } = await client.query(q, [d.name, d.email, d.specialty]);
      doctorIdByEmail.set(d.email, out[0].id);
    }

    const insuranceIdByName = new Map();
    for (const i of insByName.values()) {
      const q = `
        INSERT INTO insurances (name, coverage_percentage)
        VALUES ($1,$2)
        ON CONFLICT (name) DO UPDATE
          SET coverage_percentage = EXCLUDED.coverage_percentage
        RETURNING id;
      `;
      const { rows: out } = await client.query(q, [i.name, i.coverage_percentage]);
      insuranceIdByName.set(i.name, out[0].id);
    }

const qAppointments = `
  INSERT INTO appointments (
    appointment_id,
    appointment_date,
    patient_id,
    doctor_id,
    insurance_id,
    treatment_code,
    treatment_description,
    treatment_cost,
    amount_paid
  )
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
  ON CONFLICT (appointment_id) DO UPDATE SET
    appointment_date = EXCLUDED.appointment_date,
    patient_id = EXCLUDED.patient_id,
    doctor_id = EXCLUDED.doctor_id,
    insurance_id = EXCLUDED.insurance_id,
    treatment_code = EXCLUDED.treatment_code,
    treatment_description = EXCLUDED.treatment_description,
    treatment_cost = EXCLUDED.treatment_cost,
    amount_paid = EXCLUDED.amount_paid
  RETURNING id;
`;

    let withDate = 0;
    let insertedAppointments = 0;
    let missingFK = 0;

    for (const r of normalizedRows) {
      if (!r.appointmentDate) continue;
      withDate++;

      const patientId = patientIdByEmail.get(r.patientEmail);
      const doctorId = doctorIdByEmail.get(r.doctorEmail);
      const insuranceId = r.insuranceProvider ? (insuranceIdByName.get(r.insuranceProvider) ?? null) : null;

      if (!patientId || !doctorId) {
        missingFK++;
        continue;
      }

 const res = await client.query(qAppointments, [
  r.appointmentId,       
  r.appointmentDate,     
  patientId,             
  doctorId,              
  insuranceId,           
  r.treatmentCode,
  r.treatmentDescription,
  r.treatmentCost,
  r.amountPaid,
]);

      insertedAppointments += res.rowCount ?? 0;
    }

    const { rows: c1 } = await client.query("SELECT COUNT(*)::int AS c FROM appointments;");
    const appointmentsCountDb = c1[0].c;

    console.log("withDate =", withDate, "insertedAppointments =", insertedAppointments, "missingFK =", missingFK);
    console.log("COUNT appointments BEFORE COMMIT =", appointmentsCountDb);

    const historiesByEmail = new Map();
    for (const r of normalizedRows) {
      const patientEmailKey = r.patientEmail?.trim().toLowerCase();
      if (!patientEmailKey) continue;

      if (!historiesByEmail.has(patientEmailKey)) {
        historiesByEmail.set(patientEmailKey, { patientEmail: patientEmailKey, appointment: [] });
      }

      historiesByEmail.get(patientEmailKey).appointment.push({
        appointmentId: r.appointmentId,
        date: r.appointmentDate,
        doctorName: r.doctorName,
        doctorEmail: r.doctorEmail, //  NUEVO
        specialty: r.specialty,
        treatmentCode: r.treatmentCode,
        treatmentDescription: r.treatmentDescription,
        treatmentCost: r.treatmentCost,
        insuranceProvider: r.insuranceProvider,
        coveragePercentage: r.coveragePercentage,
        amountPaid: r.amountPaid,
      });
    }

    const col = db.collection("patient_histories");
    for (const doc of historiesByEmail.values()) {
      await col.replaceOne({ patientEmail: doc.patientEmail }, doc, { upsert: true });
    }

    await client.query("COMMIT");

    return {
      ok: true,
      message: "Migration completed successfully",
      result: {
        patients: patientsByEmail.size,
        doctors: doctorsByEmail.size,
        insurances: insByName.size,
        appointments: insertedAppointments,
        histories: historiesByEmail.size,
        csvPath: csvpath,
        appointments_withDate: withDate,
        appointments_missingFK: missingFK,
        appointments_count_db: appointmentsCountDb,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}