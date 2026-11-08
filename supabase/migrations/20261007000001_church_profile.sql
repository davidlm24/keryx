-- Configurações › Igreja in the console: the church's name and city live on
-- the profile beside the logo (base44/entities/User.jsonc).
alter table public.profile add column "church_name" text;
alter table public.profile add column "church_city" text;
