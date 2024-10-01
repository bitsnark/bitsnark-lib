-- Database: bitsnark

DROP DATABASE IF EXISTS bitsnark;

CREATE DATABASE bitsnark
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1;

-- Table: public.transaction_templates

DROP TABLE IF EXISTS public.transaction_templates;

CREATE TABLE IF NOT EXISTS public.transaction_templates
(
    "agentId" character varying COLLATE pg_catalog."default" NOT NULL,
    "setupId" character varying COLLATE pg_catalog."default" NOT NULL,
    name character varying COLLATE pg_catalog."default" NOT NULL,
    object json NOT NULL,
    "txId" character varying COLLATE pg_catalog."default",
    ordinal integer,
    CONSTRAINT transaction_template_pkey PRIMARY KEY ("agentId", "setupId", name)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.transaction_templates
    OWNER to postgres;

