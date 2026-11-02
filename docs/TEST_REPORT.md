# AHCL 360 – automated test report

Generated 2/11/2026, 2:11:36 pm IST by `npm run test:report` (Node v24.13.1).

**Result: 41 / 41 tests passed.** Overall coverage: `86.66 / 65.90 / 73.01` (line % / branch % / function %).

Each test starts a fresh in-memory MongoDB, loads the demo data and calls the real HTTP API.
Tests prefixed **T01–T11** map to the QA sign-off cases in section 11 of the AHCL review; **P0** to its mandatory fixes.

## Tests

| Result | Test |
|---|---|
| ✅ pass | OTP login flow |
| ✅ pass | OTP accepts any mobile format and throttles resends |
| ✅ pass | panel separation |
| ✅ pass | sensitive fields are masked and encrypted at rest |
| ✅ pass | blocked user loses access immediately |
| ✅ pass | attendance check-in / check-out |
| ✅ pass | GPS pings, route and visits |
| ✅ pass | leave apply + manager approval |
| ✅ pass | expense auto-calculated from GPS distance |
| ✅ pass | DSO, targets, performance, work report |
| ✅ pass | payslip pdf and reports |
| ✅ pass | offline sync is idempotent |
| ✅ pass | visit started AND finished offline syncs in one batch |
| ✅ pass | system status and test push |
| ✅ pass | place order with server-side pricing |
| ✅ pass | order lifecycle -> invoice -> stock in |
| ✅ pass | stock adjustment, reorder suggestions, insufficient stock |
| ✅ pass | retailer onboarding + claims |
| ✅ pass | partner cannot see another distributor |
| ✅ pass | dashboards |
| ✅ pass | uploads are stored encrypted in MongoDB and read back intact |
| ✅ pass | KYC field encryption works with a non-hex generated key |
| ✅ pass | T01 wrong / expired OTP rejected, unknown number gets the same reply |
| ✅ pass | T01 logout revokes the session |
| ✅ pass | P0 account locks after repeated wrong passwords |
| ✅ pass | P0 forgotten password reset by OTP signs out other sessions |
| ✅ pass | P0 admin panel requires password + OTP (MFA) |
| ✅ pass | T02 partner B cannot read partner A order, invoice, claim or file (404, not 403) |
| ✅ pass | T02 server ignores client-supplied prices and discounts |
| ✅ pass | T03 mock (fake GPS) locations are flagged on attendance and visits |
| ✅ pass | T03 GPS points outside office hours are not stored |
| ✅ pass | T04 the same offline op uploaded twice at the same time creates exactly one record |
| ✅ pass | T05 two simultaneous stock-outs for the last unit: one succeeds, stock never negative |
| ✅ pass | T05 two simultaneous "packed" clicks create one invoice |
| ✅ pass | T06 processing -> packed -> shipped -> delivered -> return issues a GST credit note and moves stock |
| ✅ pass | T08 invoice arithmetic is exact (paise): taxable + tax + round-off = total |
| ✅ pass | T07 no self-approval – not even for admins; status history is kept |
| ✅ pass | T07 a manager cannot approve their own leave |
| ✅ pass | uploads are checked by content, not by the declared type |
| ✅ pass | T10 backup restores into another database with identical data and readable encrypted files |
| ✅ pass | T11 blocking ends an active session immediately |

## Coverage by file

```
file             | line % | branch % | funcs % | uncovered lines
src              |        |          |         | 
 app.js          |  94.87 |    33.33 |   33.33 | 70-73
 config          |        |          |         | 
  db.js          | 100.00 |    75.00 |  100.00 | 
  env.js         | 100.00 |    36.36 |  100.00 | 
  roles.js       | 100.00 |   100.00 |   50.00 | 
 middleware      |        |          |         | 
  auth.js        |  94.87 |    66.67 |  100.00 | 16-17
  error.js       |  66.67 |    16.67 |   33.33 | 6-7 16-18 20-21 23-24 26-27
  validate.js    |  82.35 |    60.00 |   66.67 | 12-14
 models          |        |          |         | 
  auth.js        | 100.00 |   100.00 |  100.00 | 
  expense.js     | 100.00 |   100.00 |  100.00 | 
  field.js       | 100.00 |   100.00 |  100.00 | 
  File.js        | 100.00 |   100.00 |  100.00 | 
  hr.js          | 100.00 |   100.00 |  100.00 | 
  index.js       | 100.00 |   100.00 |  100.00 | 
  misc.js        | 100.00 |   100.00 |  100.00 | 
  orders.js      | 100.00 |    60.00 |  100.00 | 
  sales.js       | 100.00 |   100.00 |  100.00 | 
  User.js        | 100.00 |    62.50 |  100.00 | 
 routes          |        |          |         | 
  admin.js       |  64.59 |    60.00 |   15.79 | 37-42 45-54 58-60 64-71 75-92 113-117 126-128 131-133 148-150 153-155 158-159 180-189
  analytics.js   |  98.06 |    43.33 |   90.00 | 42-43
  attendance.js  |  71.09 |    78.79 |   66.67 | 31-40 95-115 120-125
  auth.js        |  88.16 |    76.47 |   75.00 | 74-77 153-154 196-202 206-207 211-220 224-225
  common.js      |  62.39 |   100.00 |   10.00 | 27-32 39-41 45-47 65-75 80-82 86-88 92-99 103-106
  expenses.js    |  82.11 |    40.91 |   50.00 | 36-39 44-46 69-74 78-82 86-89
  files.js       |  97.73 |    48.65 |   90.00 | 63-64
  hr.js          |  76.82 |    33.33 |   29.41 | 20-21 32-33 58-60 64-71 75-79 114-118 127-132 139-140 154-161 170-172 210-216
  partner.js     |  87.98 |    60.00 |   73.33 | 26-27 65-70 147-149 164-166 246-249 253-259 263-267 298-300 307 312-318
  reports.js     |  70.83 |    61.76 |   83.33 | 95-107 113-125 129-147 155-156 162-163
  sales.js       |  79.25 |    61.54 |   55.56 | 19-24 43-45 51-54 58-61 81-83 86-89 123-125 133-138 149-152 168-170 187-191 233-237
  sync.js        |  92.41 |    78.26 |   46.15 | 69-74
  team.js        |  87.84 |    40.74 |   72.73 | 18-23 59-64 140-145
  tracking.js    |  78.75 |    85.71 |   71.43 | 17-22 67-77
  visits.js      |  90.91 |    63.89 |   83.33 | 52-55 92-94 115-118
 scripts         |        |          |         | 
  backup.js      |  73.26 |    76.19 |   70.00 | 64-86
 seed.js         |  90.91 |    87.50 |  100.00 | 25-27 144-154
 services        |        |          |         | 
  billing.js     |  98.10 |    81.08 |  100.00 | 105-107
  documents.js   |  97.35 |    63.64 |  100.00 | 49-51 77-78
  fileStore.js   | 100.00 |    75.00 |   72.73 | 
  messaging.js   |  57.14 |    60.00 |   66.67 | 19-29 41-60 76-77 81-83
  otpDelivery.js |  50.99 |    33.33 |   33.33 | 22-24 32 37-49 53-61 66-72 76-85 89-94 103-124 133-135
  stock.js       |  95.54 |    63.89 |  100.00 | 29-31 44-45
  tokens.js      |  91.30 |    83.33 |  100.00 | 32-35
  tracking.js    | 100.00 |    70.00 |  100.00 | 
 utils           |        |          |         | 
  crypto.js      | 100.00 |    85.00 |  100.00 | 
  dates.js       | 100.00 |    81.25 |  100.00 | 
  format.js      | 100.00 |    75.00 |  100.00 | 
  geo.js         | 100.00 |    83.33 |  100.00 | 
  http.js        |  85.71 |    92.31 |   90.91 | 34-39
  scope.js       |  97.26 |    86.84 |  100.00 | 71-72
all files        |  86.66 |    65.90 |   73.01 | 
```

## Not covered by automated tests (manual / device)

* T03 device part (location permission denied on the phone), T09 (force close, reboot, poor network, battery saver) and T12 (pilot load) – run on real Android devices during the pilot.
* Visual layout of the mobile app and admin panel – reviewed on device/browser during the recorded demo.
