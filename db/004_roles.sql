-- Least-privilege database roles. Run as the Neon project owner.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_ro') THEN
    CREATE ROLE agent_ro NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_writer') THEN
    CREATE ROLE agent_writer NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gt_owner') THEN
    CREATE ROLE gt_owner NOLOGIN;
  END IF;
END
$$;

ALTER ROLE agent_ro SET statement_timeout = '5s';
ALTER ROLE agent_writer SET statement_timeout = '5s';

-- Keep the project owner able to run privilege tests without giving the agent
-- roles any additional rights. Production deployments can omit these two
-- memberships after validating the roles with separate login credentials.
GRANT agent_ro, agent_writer TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO agent_ro, agent_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO agent_ro;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO agent_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO agent_writer;
GRANT INSERT ON alerts, actions, investigation_runs TO agent_writer;
GRANT UPDATE (status, verdict, confidence, updated_at) ON cases TO agent_writer;
GRANT USAGE ON SCHEMA gt TO gt_owner;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA gt TO gt_owner;

REVOKE ALL ON SCHEMA gt FROM PUBLIC, agent_ro, agent_writer;
REVOKE ALL ON ALL TABLES IN SCHEMA gt FROM PUBLIC, agent_ro, agent_writer;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA gt FROM PUBLIC, agent_ro, agent_writer;

ALTER DEFAULT PRIVILEGES IN SCHEMA gt REVOKE ALL ON TABLES FROM PUBLIC, agent_ro, agent_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO agent_ro;

COMMIT;
