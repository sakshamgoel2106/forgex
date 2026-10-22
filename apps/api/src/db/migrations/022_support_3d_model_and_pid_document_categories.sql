-- ============================================================================
-- ForgeX AI — Add 3D Model and P&ID Diagram Document Categories
-- Migration: 015_support_3d_model_and_pid_document_categories.sql
-- ============================================================================

DO $$
BEGIN
    -- Drop existing check constraint if present
    ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_category_check;

    -- Add updated check constraint supporting 3D_MODEL and PID_DIAGRAM
    ALTER TABLE documents ADD CONSTRAINT documents_category_check CHECK (
        category IN (
            'SOP',
            'OEM_MANUAL',
            'SCHEMATIC_PID',
            'PID_DIAGRAM',
            '3D_MODEL',
            'WIRING_DIAGRAM',
            'FAULT_CODE_INDEX',
            'SAFETY_DATA_SHEET'
        )
    );
EXCEPTION
    WHEN undefined_table THEN
        NULL;
END $$;
