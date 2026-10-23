-- ForgeX AI Migration 031: Widen processing_jobs.current_step
-- Allows detailed descriptive step messages without character varying(64) overflow

ALTER TABLE processing_jobs ALTER COLUMN current_step TYPE VARCHAR(255);
