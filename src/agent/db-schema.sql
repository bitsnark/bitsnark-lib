

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

CREATE TABLE IF NOT EXISTS public.transmitted_transactions
(
    "setupId" character varying NOT NULL,
    "txId" character varying NOT NULL,
    "blockHeight" character varying NOT NULL,
    "rawTransaction" json NOT NULL,
    CONSTRAINT transmitted_transaction_pkey PRIMARY KEY ("txId")
);
