-- A draining worker must never overwrite the readiness of its replacement.
ALTER TABLE worker_health ADD COLUMN instance_id uuid NOT NULL DEFAULT gen_random_uuid();
-- Require a new worker to register after this upgrade.
UPDATE worker_health SET ready=false;
