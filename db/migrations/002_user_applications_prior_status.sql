-- Workflow status captured at soft delete (before status becomes 'terminated'); used for OKR completion when users remove completed apps from the dashboard.

ALTER TABLE user_applications
    ADD COLUMN IF NOT EXISTS prior_status VARCHAR(50) NULL;
