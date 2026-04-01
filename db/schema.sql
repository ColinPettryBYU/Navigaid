-- Benefits guidance platform schema
-- Core tables:
--   login
--   users
--   applications
--   user_applications
--   chat_threads
--   chat_messages
--   required_documents

DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS chat_threads;
DROP TABLE IF EXISTS user_applications;
DROP TABLE IF EXISTS required_documents;
DROP TABLE IF EXISTS login;
DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    user_id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name           VARCHAR(100) NOT NULL,
    last_name            VARCHAR(100) NOT NULL,
    email                VARCHAR(255) NOT NULL UNIQUE,
    phone                VARCHAR(25),
    date_of_birth        DATE,
    city                 VARCHAR(100),
    state                VARCHAR(50),
    zip_code             VARCHAR(15),
    household_size       INTEGER,
    income_range         INTEGER,
    employment_status    VARCHAR(100),
    housing_status       VARCHAR(100),
    disability_status    VARCHAR(100),
    veteran_status       VARCHAR(100),
    preferred_language   VARCHAR(50) DEFAULT 'English',
    created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE login (
    user_id              INTEGER PRIMARY KEY,
    username             VARCHAR(100) NOT NULL UNIQUE,
    password_hash        VARCHAR(255) NOT NULL,
    last_login_at        TIMESTAMP,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_login_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);

CREATE TABLE applications (
    application_id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_name       VARCHAR(150) NOT NULL UNIQUE,
    category               VARCHAR(100) NOT NULL,
    description            TEXT NOT NULL,
    qualification_summary  TEXT,
    official_url           VARCHAR(500) NOT NULL,
    application_steps      TEXT NOT NULL
);

CREATE TABLE user_applications (
    user_application_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id               INTEGER NOT NULL,
    application_id        INTEGER NOT NULL,
    status                VARCHAR(50) NOT NULL,
    date_started          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_updated          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes                 TEXT,
    steps_completed       JSONB NOT NULL DEFAULT '[]',
    prior_status          VARCHAR(50) NULL,
    CONSTRAINT fk_user_applications_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_user_applications_application
        FOREIGN KEY (application_id)
        REFERENCES applications(application_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_user_application UNIQUE (user_id, application_id),
    CONSTRAINT chk_user_application_status
        CHECK (
            status IN (
                'recommended',
                'likely_match',
                'documents_needed',
                'ready_to_apply',
                'official_application_started',
                'submitted',
                'follow_up_requested',
                'approved',
                'denied',
                'closed',
                'active',
                'terminated',
                'completed'
            )
        )
);

CREATE TABLE chat_threads (
    thread_id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id               INTEGER NOT NULL,
    title                 VARCHAR(255) NOT NULL,
    created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_archived           BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_chat_threads_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);

CREATE TABLE chat_messages (
    message_id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    thread_id             INTEGER NOT NULL,
    sender_type           VARCHAR(20) NOT NULL,
    message_text          TEXT NOT NULL,
    created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sequence_number       INTEGER NOT NULL,
    CONSTRAINT fk_chat_messages_thread
        FOREIGN KEY (thread_id)
        REFERENCES chat_threads(thread_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_thread_sequence UNIQUE (thread_id, sequence_number),
    CONSTRAINT chk_sender_type
        CHECK (sender_type IN ('user', 'assistant', 'system'))
);

CREATE TABLE required_documents (
    document_id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id        INTEGER NOT NULL,
    document_name         VARCHAR(150) NOT NULL,
    description           TEXT,
    required_flag         BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_required_documents_application
        FOREIGN KEY (application_id)
        REFERENCES applications(application_id)
        ON DELETE CASCADE
);

CREATE INDEX idx_user_applications_user_id
    ON user_applications (user_id);

CREATE INDEX idx_user_applications_application_id
    ON user_applications (application_id);

CREATE INDEX idx_chat_threads_user_id
    ON chat_threads (user_id);

CREATE INDEX idx_chat_messages_thread_id
    ON chat_messages (thread_id);

CREATE INDEX idx_required_documents_application_id
    ON required_documents (application_id);
