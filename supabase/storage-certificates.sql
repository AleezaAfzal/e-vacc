-- Public bucket for certificate PDFs (optional; edge function uploads here)
insert into storage.buckets (id, name, public)
values ('certificates', 'certificates', true)
on conflict (id) do nothing;

-- Allow authenticated read; service role uploads via edge function
create policy "certificates_public_read"
  on storage.objects for select
  using (bucket_id = 'certificates');
