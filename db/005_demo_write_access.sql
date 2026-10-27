-- Demo agent: CRUD access to application data, including future tables.
BEGIN;
GRANT USAGE ON SCHEMA public TO agent_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO agent_writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO agent_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO agent_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO agent_writer;
ALTER ROLE agent_writer SET statement_timeout = '15s';
COMMIT;
