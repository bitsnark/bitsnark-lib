CREATE TABLE setups (
    id CHARACTER VARYING PRIMARY KEY,
    wots_salt CHARACTER VARYING,
    protocol_version CHARACTER VARYING NOT NULL,
    status CHARACTER VARYING NOT NULL,
    last_checked_block_height INTEGER NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    payload_txid CHARACTER VARYING,
    payload_output_index INTEGER, 
    payload_amount INTEGER,
    stake_txid CHARACTER VARYING, 
    stake_output_index INTEGER, 
    stake_amount INTEGER
);

CREATE INDEX setups_status_idx ON setups (status);

CREATE TABLE templates (
    id SERIAL PRIMARY KEY,
    txid CHARACTER VARYING,
    setup_id CHARACTER VARYING NOT NULL REFERENCES setups ON DELETE CASCADE,
    name CHARACTER VARYING NOT NULL,
    role CHARACTER VARYING NOT NULL,
    is_external BOOLEAN NOT NULL,
    unknown_txid BOOLEAN DEFAULT FALSE,
    ordinal INTEGER NOT NULL,
    inputs JSONB NOT NULL,
    outputs JSONB NOT NULL,
    status CHARACTER VARYING NOT NULL,
    data JSONB NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (setup_id, name)
);
CREATE INDEX templates_setup_id_idx ON templates (setup_id);
CREATE INDEX ordinals_idx ON templates (ordinal);
CREATE INDEX templates_status_idx ON templates (status);

CREATE TABLE received (
    template_id INTEGER NOT NULL PRIMARY KEY REFERENCES templates ON DELETE CASCADE,
    txid CHARACTER VARYING NOT NULL,
    block_hash CHARACTER VARYING NOT NULL,
    block_height INTEGER NOT NULL,
    raw_transaction JSONB NOT NULL,
    detected_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX received_template_id_idx ON received (template_id);
