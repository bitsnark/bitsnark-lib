

CREATE TABLE IF NOT EXISTS public.transaction_templates
(
    "agentId" character varying NOT NULL,
    "setupId" character varying NOT NULL,
    name character varying NOT NULL,
    object json NOT NULL,
    "txId" character varying,
    ordinal integer,
    CONSTRAINT transaction_template_pkey PRIMARY KEY ("agentId", "setupId", name)
);
