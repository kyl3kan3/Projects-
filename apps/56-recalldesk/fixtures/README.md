# PMS export fixtures

Sanitised, entirely fictional sample exports in the shape each system actually
writes, used to build and test the import recipes (`src/lib/pms.ts`) and to try
the import wizard without a real roster.

| File | Shape it exercises |
|---|---|
| `dentrix-patients.csv` | One row per patient, US month-first dates, zero-padded `Continuing Care Interval`, `Y`/`N` consent, a `Home Phone` column that must lose to `Mobile Phone`. |
| `eaglesoft-patients.txt` | Tab-delimited, `"Last, First"` in one column, `.txt` extension. |
| `opendental-appointments.csv` | One row per appointment, ISO datetimes, `PatNum` grouping, a future appointment, and non-hygiene procedures mixed in. |

Every name is invented, every number is inside the 555-01xx reserved range and
every address is on `example.com`. No real patient data is in this repository.
