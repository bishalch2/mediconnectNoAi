# Hospital Expo Backend (Express + MongoDB)

A starter backend rebuilt from `expo.docx` for an Expo hospital-management app. It includes role-based login, appointment slots and bookings, medicine inventory, patient medical records, protected file downloads, and an optional connection to the separate FastAPI pneumonia model described in the document.

> **Medical note:** the pneumonia result is an AI-assisted screening output, not a diagnosis. It is returned only if your separate FastAPI service and its actual weights/configuration are available and running.

## 1. Requirements

- Node.js 20 or newer
- MongoDB running locally or a MongoDB Atlas connection string
- Postman
- Optional: the separate Python/FastAPI ML service and its model files

## 2. Install and run

Open a terminal in this project folder:

```bash
npm install
```

Copy `.env.example` to `.env`. On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env`, especially `MONGODB_URI`, `JWT_SECRET`, and the admin credentials. Use a private JWT secret with at least 32 characters. The `.env` file is ignored by Git and must not be shared.

Start MongoDB, then create the first administrator:

```bash
npm run seed:admin
```

Start the API:

```bash
npm run dev
```

Health check: `GET http://localhost:5000/api/health`

The API will not start if MongoDB is unavailable or `JWT_SECRET` is missing/too short. Uploaded files are saved in the local `uploads/` folder and are only served through an authenticated, permission-checked download endpoint. Back up that folder along with the database if you need to preserve uploaded reports.

## 3. Roles

Allowed role values are exact and case-sensitive:

- `patient` — the public registration default; book/cancel own appointments and view own medical records.
- `doctor` — publish availability, inspect own bookings, cancel own future bookings, create prescriptions, and view patient history by ID card number.
- `medicine_manager` — create/update/delete medicine inventory and update stock.
- `diagnosis_lab_manager` — upload and update lab reports, and inspect patient history.
- `admin` — look up users by email, change a user's role, and enable/disable accounts.

Public registration **always** creates a patient account. To create a doctor, medicine manager, or lab account, register it first, sign in as the seeded admin, then change that user's role. Role changes take effect on the next request because authorization reads the user role from MongoDB.

Login requires all three values from the document: `email`, `password`, and the **string** `idCardNumber`. Passwords are hashed; the ID card number and password are not returned in user API responses.

## 4. Postman quick start

Import `postman/Hospital-Expo-Backend.postman_collection.json` into Postman. The collection has variables for the API URL, admin credentials, demo accounts, tokens, IDs, and appointment times. Change the demo values if they already exist in your database. The admin values must match your private `.env` values.

Run or send requests in this order for the main workflow:

1. **Health**
2. **Register Patient** → **Login Patient**
3. **Register Doctor**
4. **Login Admin** (after `npm run seed:admin`) → **Promote Doctor**
5. **Login Doctor** → **Doctor Create Availability**
6. **Patient List Doctors** → **Patient List Doctor Slots** → **Patient Book First Slot** → **Patient My Bookings**
7. Register/promote/login a medicine manager, then **Medicine Create** and **Medicine List**.
8. Register/promote/login diagnosis lab staff. Send **Lab Upload Report** after selecting a local PDF/JPG/PNG for its `file` form-data field. Then test **Lab Update Latest Report By Card**.
9. **Doctor Create Prescription** and **Patient My Medical Records**.

Requests involving file upload need a local file selected in Postman. Choose **Body → form-data**; the file field name is exactly `file`. For a basic end-to-end test, a non-sensitive demo report image or PDF is enough. Do not upload a real person's medical record to a public or untrusted server.

## 5. API reference

All routes except `GET /api/health`, `POST /api/auth/register`, and `POST /api/auth/login` require:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

### Auth and admin

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | API health check |
| POST | `/api/auth/register` | Public | Register a patient |
| POST | `/api/auth/login` | Public | Login with email, password, ID card number |
| GET | `/api/auth/me` | Any logged-in user | Current account summary |
| GET | `/api/admin/users?email=person%40example.com` | Admin | Exact email lookup |
| PATCH | `/api/admin/users/role` | Admin | Body: `{ "email": "doctor@example.com", "role": "doctor" }` |
| PATCH | `/api/admin/users/active` | Admin | Body: `{ "email": "person@example.com", "isActive": false }` |

### Appointment slots and bookings

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/slots/doctors` | Any logged-in user | Find doctors |
| POST | `/api/slots/availability` | Doctor | Publish a future availability window; creates configurable slots (5, 10, 15, 20, 30, or 60 minutes) |
| GET | `/api/slots/doctors/:doctorId/slots` | Any logged-in user (visibility rules apply) | List available slots, optionally with `from`, `to`, `status` query parameters |
| PATCH | `/api/slots/slots/:slotId` | Doctor who owns slot | Move an unbooked future slot; interval must be 5, 10, 15, 20, 30, or 60 minutes and must not overlap another slot |
| DELETE | `/api/slots/slots/:slotId` | Doctor who owns slot | Delete an unbooked future slot |
| POST | `/api/bookings` | Patient | Body: `{ "slotId": "..." }` |
| GET | `/api/bookings/my` | Patient or doctor | Patient's bookings or that doctor's bookings |
| PATCH | `/api/bookings/:slotId/cancel` | Patient | Cancel own future booking |
| PATCH | `/api/bookings/:slotId/doctor-cancel` | Doctor who owns slot | Cancel own future appointment and reopen slot |

Availability example (send ISO datetimes with timezone offsets; start and end must use the same offset):

```json
{
  "startTime": "2027-01-15T09:00:00+05:30",
  "endTime": "2027-01-15T11:00:00+05:30",
  "slotDurationMinutes": 10
}
```

Choose a date/time in the future when testing. The sample above is illustrative. `slotDurationMinutes` is optional and defaults to 30 for backward compatibility; supported values are 5, 10, 15, 20, 30, and 60. A two-hour window creates 12 ten-minute slots with the example value. The window length must be an exact multiple of the selected duration, and one request may create at most 500 slots. Booking is an atomic MongoDB update so concurrent requests cannot both win the same slot.

### Medicine inventory

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/medicines` | Medicine manager or admin | Create medicine |
| GET | `/api/medicines` | Any logged-in user | List/search; query `search` and/or `category` |
| GET | `/api/medicines/low-stock` | Any logged-in user | Medicines where quantity ≤ reorder level |
| GET | `/api/medicines/expired` | Any logged-in user | Expired medicines |
| GET | `/api/medicines/:id` | Any logged-in user | One medicine |
| PATCH | `/api/medicines/:id` | Medicine manager or admin | Update whitelisted medicine fields |
| PATCH | `/api/medicines/:id/stock` | Medicine manager or admin | Body: `{ "type": "add", "amount": 5 }` or `remove` |
| DELETE | `/api/medicines/:id` | Medicine manager or admin | Delete medicine |

`availabilityStatus` is calculated as `INACTIVE`, `EXPIRED`, `OUT_OF_STOCK`, `LOW_STOCK`, or `AVAILABLE`, in that priority order, following your document.

Example medicine:

```json
{
  "name": "Paracetamol 500mg",
  "genericName": "Paracetamol",
  "category": "Analgesic",
  "batchNumber": "BATCH-2027-001",
  "quantity": 100,
  "reorderLevel": 20,
  "expiryDate": "2028-12-31T00:00:00.000Z",
  "isActive": true,
  "unit": "tablet",
  "manufacturer": "Example Pharma"
}
```

### Lab reports, prescriptions, and patient history

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/records/lab-reports` | Diagnosis lab manager or admin | Multipart form-data: `idCardNumber`, `reportType`, `title`, `diagnosis`, `notes`, optional `recordedAt`, and required file field `file` |
| PATCH | `/api/records/lab-reports/by-card/:idCardNumber` | Diagnosis lab manager or admin | Update the latest lab report for that ID card; replacement file optional |
| PATCH | `/api/records/lab-reports/:recordId` | Diagnosis lab manager or admin | Update a specific lab report; replacement file optional |
| POST | `/api/records/prescriptions` | Doctor or admin | Prescription JSON or multipart form-data; use `idCardNumber`, `diagnosis`, `notes`, and `medicines` array; optional file field `file` |
| GET | `/api/records/my` | Patient | See own lab reports, prescriptions, and AI result if available |
| GET | `/api/records/patient/:idCardNumber` | Doctor, diagnosis lab manager, admin | See that patient's historical records |
| GET | `/api/records/:recordId/file` | Record owner patient, doctor, diagnosis lab manager, admin | Download/view an attached file after permission checks |

Prescription JSON example:

```json
{
  "idCardNumber": "PAT-10001",
  "title": "Consultation prescription",
  "diagnosis": "Example diagnosis",
  "notes": "Take as instructed by the clinician.",
  "medicines": [
    {
      "name": "Paracetamol 500mg",
      "dosage": "1 tablet",
      "frequency": "As prescribed",
      "duration": "3 days",
      "instructions": "After food"
    }
  ]
}
```

For `reportType`, use `chest_xray` to request the pneumonia service. JPG and PNG reports can be sent to the model; PDF files are stored as reports but are not sent to the image model.

### Pneumonia model integration

The provided document's FastAPI app exposes `POST http://127.0.0.1:8000/predict` with multipart file field `file`. Set `PNEUMONIA_API_URL=http://127.0.0.1:8000/predict` in `.env` and run the Python service separately. The weights referenced in the document must exist in that service's expected paths. If it is not running, the lab report is still saved and `aiPrediction.status` is `unavailable`; the Express server does not fabricate predictions.

## 6. Security and demo notes

- Change all example secrets/passwords before using real data.
- Keep `.env`, uploaded files, and MongoDB credentials private.
- This is a local/testing starter. Before deployment, add rate limiting, formal audit logs, cloud/private file storage, backups, encryption-at-rest controls, and jurisdiction-specific healthcare/privacy compliance review.
- Login requires the ID card number as requested in your document. Since it is sensitive, it is never returned in public user responses. Avoid sending it in screenshots or logs.
- Role names use underscores exactly as listed above; the previous document did not provide existing auth code or a prescribed route naming scheme, so the API paths here are a consistent implementation for testing.
