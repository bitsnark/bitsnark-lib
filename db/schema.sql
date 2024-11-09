CREATE TYPE public.setup_status AS ENUM ( 'PENDING', 'READY', 'SIGNED', 'FAILED', 'FINISHED' );

CREATE TABLE public.setups (
    setup_id CHARACTER VARYING PRIMARY KEY,
    protocol_version CHARACTER VARYING NOT NULL,
    status public.setup_status NOT NULL DEFAULT 'PENDING'
);

CREATE INDEX setups_status_idx ON public.setups (status);


CREATE TYPE public.role AS ENUM ( 'PROVER', 'VERIFIER' );

CREATE TABLE public.templates (
    template_id SERIAL PRIMARY KEY,
    name CHARACTER VARYING NOT NULL,
    setup_id CHARACTER VARYING NOT NULL REFERENCES public.setups(setup_id),
    agent_id CHARACTER VARYING NOT NULL,
    role public.role NOT NULL,
    is_external BOOLEAN NOT NULL DEFAULT FALSE,
    ordinal INTEGER NOT NULL,
    object JSONB NOT NULL,
    UNIQUE (name, setup_id, agent_id)
);

CREATE INDEX templates_name_setup_id_agent_id_idx ON public.templates (name, setup_id, agent_id);


CREATE TYPE public.outgoing_status AS ENUM ( 'PENDING', 'READY', 'PUBLISHED', 'REJECTED' );

CREATE TABLE public.outgoing (
    template_id INTEGER PRIMARY KEY REFERENCES public.templates(template_id),
    transaction_id CHARACTER VARYING NOT NULL,
    raw_tx JSONB NOT NULL,
    data JSONB NOT NULL,
    status CHARACTER VARYING NOT NULL DEFAULT 'PENDING',
    updated TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX outgoing_transaction_id_idx ON public.outgoing (transaction_id);
CREATE INDEX outgoing_status_idx ON public.outgoing (status);
CREATE INDEX outgoing_updated_idx ON public.outgoing (updated);

CREATE TABLE public.incoming (
    template_id INTEGER PRIMARY KEY REFERENCES public.templates(template_id),
    transaction_id CHARACTER VARYING NOT NULL,
    raw_tx JSONB NOT NULL,
    block_height INTEGER NOT NULL
);

CREATE INDEX incoming_transaction_id_idx ON public.incoming (transaction_id);
