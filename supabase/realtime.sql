-- Enable Realtime for e-vacc (run after schema.sql)
alter publication supabase_realtime add table public.vaccines;
alter publication supabase_realtime add table public.centers;
alter publication supabase_realtime add table public.slots;
alter publication supabase_realtime add table public.appointments;
alter publication supabase_realtime add table public.vax_records;
alter publication supabase_realtime add table public.certificates;
