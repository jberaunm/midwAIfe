-- Baby names module schema
-- Applied to Supabase directly; this file is the source of truth for reference.

CREATE TABLE public.name_preferences (
  user_id uuid NOT NULL,
  gender text NOT NULL DEFAULT 'either'
    CHECK (gender = ANY (ARRAY['boy'::text, 'girl'::text, 'either'::text])),
  notes text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT name_preferences_pkey PRIMARY KEY (user_id),
  CONSTRAINT name_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE TABLE public.name_candidates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  origin text,
  meaning text,
  notes text,
  status text NOT NULL
    CHECK (status = ANY (ARRAY['top'::text, 'shortlisted'::text, 'rejected'::text])),
  rank integer,
  source text NOT NULL
    CHECK (source = ANY (ARRAY['parent'::text, 'ai'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT name_candidates_pkey PRIMARY KEY (id),
  CONSTRAINT name_candidates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE UNIQUE INDEX name_candidates_user_lower_name_idx
  ON public.name_candidates (user_id, LOWER(name));

CREATE INDEX name_candidates_user_status_rank_idx
  ON public.name_candidates (user_id, status, rank);
