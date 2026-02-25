begin; -- esto significa que empieza una trasaccion, hace que todo el scrip se ejecute en un solo bloque

create table if not exists  patients (
	id BIGSERIAL primary key, -- id  unico, todos se llaman igual 
	name text not null,
	email text not null unique,
	phone text,
	adress text
);

create table if not exists doctors (
	id BIGSERIAL primary key,
	name text not null,
	email text not null unique,
	specialty text not null
);

create table if not exists insurance (
	id BIGSERIAL primary key,
	name text not null,
	coverage_percentage INT not null check (coverage_percentage >=0 and coverage_percentage <= 100)
);  -- check significa que solo acepta valores entre 0 y 100 esto es el porcentaje de convertura 


-- tabla appoitment es la mas importante, aqui se crean las relaciones
create table if not exists appointment (
	id BIGSERIAL primary key,
	appointment_id text not null unique,
	appointment_date date not null, 
	patient_id BIGINT not null references patients (id) on update cascade on delete restrict, -- BIGINT NUMERO ENTERO GRANDE integridad referencial, en appoitnemnt se crean las tablas id para gaurdar dicho id 
	-- referecnes patients dice que lo que xista en esta tabla tambien debe existir en la tabla patients, si haya ctualziacion en la tabla padre aqui se actulzia el numro si si intentan borrrar el  numro en tabla padre se restringe  
	doctor_id BIGINT not null references doctors (id) on update cascade on delete restrict, -- no puede existir una cita sin doctor valido 
	insurance BIGINT not null references insurance (id) on update cascade on delete restrict, 
	treatment_code text not null,
	treatment_description text not null,
	treatment_cost numeric(12,2) not null check (treatment_cost  >=0), -- (12,2 significa numeros decimales exactos), check es como una condicion, debe vigilar que no existan numeros negativos 
	amount_paid numeric(12,2) not null check (amount_paid >=0)
);

-- indices extrategicos 
-- solo se haran los indixes en este caso para las columnas que se van a usar mucho para buscar o filtrar datos en esye caso
-- emails, especialidades, fechas, etc
CREATE INDEX IF NOT EXISTS idx_patients_email ON patients(email);
CREATE INDEX IF NOT EXISTS idx_doctors_specialty ON doctors(specialty);
CREATE INDEX IF NOT EXISTS idx_appointment_date ON appointment(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointment_patient ON appointment(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointment_doctor ON appointment(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointment_insurance ON appointment(insurance); -- aqui significa que e crea el indice sobre la tabla de appointment que ya existe 
	
commit;