-- Baby essentials module schema
-- Applied to Supabase directly; this file is the source of truth for reference.

CREATE TABLE public.essential_preferences (
  user_id           uuid NOT NULL,
  accept_secondhand text NOT NULL DEFAULT 'no_preference'
    CHECK (accept_secondhand = ANY (ARRAY['yes'::text, 'no'::text, 'no_preference'::text])),
  notes             text,
  updated_at        timestamp with time zone DEFAULT now(),
  CONSTRAINT essential_preferences_pkey PRIMARY KEY (user_id),
  CONSTRAINT essential_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE TABLE public.essential_items (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  name            text NOT NULL,
  category        text NOT NULL
    CHECK (category = ANY (ARRAY[
      'Sleep'::text, 'Feeding'::text, 'Clothing'::text, 'Bath'::text,
      'Gear'::text, 'Health'::text, 'Travel'::text, 'Nursery'::text
    ])),
  status          text NOT NULL
    CHECK (status = ANY (ARRAY['needed'::text, 'bought'::text, 'skipped'::text])),
  is_must_have    boolean NOT NULL DEFAULT false,
  is_hospital_bag boolean NOT NULL DEFAULT false,
  estimated_cost  numeric(8, 2),
  purchase_url    text,
  notes           text,
  source          text NOT NULL
    CHECK (source = ANY (ARRAY['parent'::text, 'ai'::text])),
  created_at      timestamp with time zone DEFAULT now(),
  updated_at      timestamp with time zone DEFAULT now(),
  CONSTRAINT essential_items_pkey PRIMARY KEY (id),
  CONSTRAINT essential_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE UNIQUE INDEX essential_items_user_lower_name_idx
  ON public.essential_items (user_id, LOWER(name));

CREATE INDEX essential_items_user_status_idx
  ON public.essential_items (user_id, status);
