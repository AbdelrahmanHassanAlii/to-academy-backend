# MongoDB transaction setup (host, no Docker)

Phase 2.4 requires MongoDB 7+ configured as an initialized replica set (or Atlas). Standalone mongod cannot provide the atomic registration/capacity transaction. Runtime startup checks `hello` topology before listening; a standalone configuration fails rather than silently weakening capacity guarantees. Existing `.env` is never rewritten automatically. Add the matching `replicaSet` query parameter to MONGODB_URI and TEST_MONGODB_URI after configuring your server. Do not convert or restart an existing application database during testing.

For a fresh, isolated local development/test server, from the backend directory create a data directory and run MongoDB in a separate terminal:

```powershell
New-Item -ItemType Directory -Force .tools/mongo-phase24
& 'C:/Program Files/MongoDB/Server/7.0/bin/mongod.exe' --replSet toacademyTest --port 27024 --bind_ip 127.0.0.1 --dbpath .tools/mongo-phase24
```

Initialize **that new instance only**, once, from mongosh (installed separately) connected to localhost:27024:

```javascript
rs.initiate({ _id: 'toacademyTest', members: [{ _id: 0, host: '127.0.0.1:27024' }] });
rs.status();
```

Wait until PRIMARY. In the application terminal set a dedicated local database and run the normal checks:

```powershell
$env:MONGODB_URI='mongodb://127.0.0.1:27024/to_academy?replicaSet=toacademyTest'
$env:TEST_MONGODB_URI='mongodb://127.0.0.1:27024/to_academy_test?replicaSet=toacademyTest'
npm run db:check
npm run test:integration
npm run dev
```

Use your existing generated SESSION_SECRET and allowed origins. Integration fixtures require a dedicated database named to_academy_test or to_academy_test_<suffix>; they clean only owned records. Tests include real transactions, limited-seat concurrent requests, duplicate-key rollback, insert failure rollback and concurrent cancellation/reactivation/capacity edits. They do not skip when the database is unavailable or standalone. The insert-failure test temporarily applies a collection validator in the dedicated test database and removes it in finally; never point this test command at shared/production data or run it alongside other test suites on the same database.

For an existing service, an operator must deliberately configure replication in its mongod configuration and initialize it after backing up data; that operation is not part of this implementation. For production use Atlas or an appropriately secured replica set, database authentication/TLS, restricted network access and least database-scoped application privileges. A single-member local set enables transactions for testing but provides no failover. Use a separate test database and credentials. The app creates declared indexes at startup and never drops indexes or resets databases. Production transaction operations require normal read/write privileges; the failure-injection test needs collMod only on its isolated test database.

Reference: [MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/).
