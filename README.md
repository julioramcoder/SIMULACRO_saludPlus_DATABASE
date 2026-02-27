# SALUDPLUS API
---

## 1. Overview
---

SaludPlus API is a healthcare backend system built with **Node.js** and **Express**.

It manages:

- Doctors  
- Patients  
- Appointments  
- Revenue reports  
- Patient medical histories  

The system uses a hybrid database architecture combining **PostgreSQL** and **MongoDB**.

---

## 2. System Architecture
---

The application follows a layered architecture:

Client (Postman)
        │
        ▼
Routes Layer (Express)
        │
        ▼
Services Layer (Business Logic)
        │
        ▼
Data Layer
 ├─ PostgreSQL (Relational)
 └─ MongoDB (Document)

---

## 3. Database Design
---

### PostgreSQL (Relational Database)

Used for structured master data:

- Doctors
- Patients
- Treatments
- Insurances
- Appointments

Why PostgreSQL?

- ACID compliance
- Referential integrity (Foreign Keys)
- Strong consistency
- Structured schema
- Transaction support

---

### MongoDB (Document Database)

Used for patient medical histories.

Collection:

patient_histories

Example structure:

{
  patientEmail: "valeria.g@mail.com",
  appointment: [
    {
      appointmentId: "APT-1001",
      date: "2024-01-07",
      doctorName: "Dr. Carlos Ruiz",
      treatmentDescription: "Skin Treatment",
      amountPaid: 80000
    }
  ]
}

Why MongoDB?

- Optimized for read-heavy queries
- Embedded appointment arrays
- Avoids complex JOIN operations
- Fast retrieval of complete patient timeline

---

## 4. Migration Process
---

Endpoint:

POST /api/simulacro/migrate

The migration:

- Reads data from a CSV file
- Inserts relational data into PostgreSQL
- Aggregates appointments per patient into MongoDB
- Maintains referential integrity
- Prevents duplicate insertions

---

## 5. Idempotency
---

The migration process is idempotent.

Running it multiple times:

- Does NOT duplicate data
- Keeps database counts stable
- Uses constraints and upsert logic
- Ensures safe re-execution

---

## 6. API Endpoints
---

### Migration

POST /api/simulacro/migrate

---

### Doctors

GET    /api/doctors  
GET    /api/doctors/:id  
PUT    /api/doctors/:id  

---

### Reports

GET /api/reports/revenue  
GET /api/reports/revenue?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD  

---

### Patients

GET /api/patients/:email/history  

Returns complete medical history from MongoDB.

---

## 7. Project Structure
---

SALUDPLUS/

│  
├── data/  
│   └── simulation_saludplus_data.csv  

├── scripts/  
│   └── scripts_saludplus...  

├── src/  
│   ├── config/  
│   │   ├── env.js  
│   │   ├── mongodb.js  
│   │   └── postgres.js  
│   │  
│   ├── middlewares/  
│   │   └── errorHandler.js  
│   │  
│   ├── routes/  
│   │   ├── doctors.js  
│   │   ├── patients.js  
│   │   ├── reports.js  
│   │   └── simulacro.js  
│   │  
│   ├── services/  
│   │   ├── doctorServices.js  
│   │   ├── patientServices.js  
│   │   ├── reportServices.js  
│   │   └── migrationService.js  
│   │  
│   ├── utils/  
│   │   ├── httpError.js  
│   │   └── validators.js  
│   │  
│   ├── app.js  
│   └── server.js  

├── postman/  
│   └── SaludPlus_API.postman_collection.json  

├── .env.example  
├── .gitignore  
├── package.json  
└── README.md  

---

## 8. How to Run the Project
---

### Step 1 – Install Dependencies

npm install

---

### Step 2 – Configure Environment Variables

Create a .env file based on .env.example

Example:

PORT=3000

POSTGRES_HOST=localhost  
POSTGRES_PORT=5432  
POSTGRES_USER=your_user  
POSTGRES_PASSWORD=your_password  
POSTGRES_DB=saludplus  

MONGO_URI=mongodb://localhost:27017/saludplus  

---

### Step 3 – Start the Server

Development mode:

npm run dev

Production mode:

npm start

Server runs at:

http://localhost:3000

---

## 9. Postman Collection
---

The Postman collection is located at:

/postman/SaludPlus_API.postman_collection.json

Import it into Postman to test all endpoints.

---

## 10. Technical Decisions
---

- Express for scalable API structure  
- Layered architecture (Routes → Services → Data)  
- PostgreSQL for transactional consistency  
- MongoDB for optimized history retrieval  
- CSV-based reproducible migration  
- Idempotent data migration  
- Environment-based configuration  
- No hardcoded credentials  

---