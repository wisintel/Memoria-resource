# Integration Tests

These tests use a real Postgres database through `TEST_DATABASE_URL`.

`npm test` drops and recreates the `public` schema at `TEST_DATABASE_URL`, applies `data/migrations/*.sql`, seeds the registry, then runs Vitest. Use a dedicated local database or disposable Neon branch. The script refuses to run if `TEST_DATABASE_URL` is missing or exactly matches `DATABASE_URL` / `DIRECT_URL`.

Local Docker example:

```sh
docker run --name memoria-test-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=memoria_test \
  -p 54329:5432 \
  -d postgres:16

TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54329/memoria_test npm test
```
