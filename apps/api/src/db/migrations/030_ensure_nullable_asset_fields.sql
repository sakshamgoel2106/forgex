-- ForgeX AI Migration 030: Ensure nullable asset identity fields and area
-- Guarantees assets can be registered even before field nameplate verification

ALTER TABLE assets ALTER COLUMN serial_number DROP NOT NULL;
ALTER TABLE assets ALTER COLUMN model_number DROP NOT NULL;
ALTER TABLE assets ALTER COLUMN manufacturer DROP NOT NULL;
ALTER TABLE assets ALTER COLUMN area DROP NOT NULL;
