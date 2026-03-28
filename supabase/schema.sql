-- e-vacc: run in Supabase SQL Editor (or split into migrations)
-- After run: create first admin with:
-- update public.profiles set role = 'admin' where id = '<your-auth-user-uuid>';

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  cnic text unique,
  dob date,
  role text not null default 'citizen' check (role in ('admin', 'manager', 'citizen')),
  created_at timestamptz not null default now()
);

create table public.vaccines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  doses_required int not null check (doses_required >= 1),
  interval_days int not null default 0 check (interval_days >= 0),
  doses_remaining int not null default 0 check (doses_remaining >= 0),
  min_age_years int not null default 12 check (min_age_years >= 0),
  created_at timestamptz not null default now()
);

create table public.centers (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.profiles (id) on delete restrict,
  name text not null,
  address text,
  lat double precision not null,
  lng double precision not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected')),
  created_at timestamptz not null default now()
);

create index centers_manager_id_idx on public.centers (manager_id);
create index centers_status_idx on public.centers (status);

create table public.slots (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  vaccine_id uuid not null references public.vaccines (id) on delete restrict,
  slot_date date not null,
  slot_time time not null,
  slot_end_time time not null,
  room_label text not null default 'Main',
  capacity int not null default 10 check (capacity >= 1),
  check (slot_end_time > slot_time),
  created_at timestamptz not null default now(),
  unique (center_id, slot_date, slot_time, room_label)
);

create index slots_center_date_idx on public.slots (center_id, slot_date);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  citizen_id uuid not null references public.profiles (id) on delete cascade,
  slot_id uuid not null references public.slots (id) on delete cascade,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  batch_number text,
  created_at timestamptz not null default now(),
  unique (citizen_id, slot_id)
);

create index appointments_slot_idx on public.appointments (slot_id) where status = 'scheduled';
create index appointments_citizen_idx on public.appointments (citizen_id);

create table public.vax_records (
  id uuid primary key default gen_random_uuid(),
  citizen_id uuid not null references public.profiles (id) on delete cascade,
  vaccine_id uuid not null references public.vaccines (id) on delete restrict,
  dose_number int not null check (dose_number >= 1),
  batch_number text not null,
  administered_at timestamptz not null default now(),
  appointment_id uuid references public.appointments (id) on delete set null,
  center_id uuid references public.centers (id) on delete set null,
  created_at timestamptz not null default now()
);

create index vax_records_citizen_vaccine_idx on public.vax_records (citizen_id, vaccine_id);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  citizen_id uuid not null references public.profiles (id) on delete cascade,
  vaccine_id uuid not null references public.vaccines (id) on delete cascade,
  pdf_url text,
  created_at timestamptz not null default now(),
  unique (citizen_id, vaccine_id)
);

create index certificates_citizen_idx on public.certificates (citizen_id);

-- ---------------------------------------------------------------------------
-- Auth: profile on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r text;
begin
  r := coalesce(new.raw_user_meta_data->>'role', 'citizen');
  if r not in ('citizen', 'manager') then
    r := 'citizen';
  end if;

  insert into public.profiles (id, full_name, role, cnic, dob)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    r,
    nullif(trim(coalesce(new.raw_user_meta_data->>'cnic', '')), ''),
    case
      when new.raw_user_meta_data->>'dob' is null or new.raw_user_meta_data->>'dob' = '' then null
      else (new.raw_user_meta_data->>'dob')::date
    end
  );
  return new;
end;
$$;

create or replace function public.prevent_identity_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'citizen' and old.id = auth.uid() then
    if old.cnic is not null and new.cnic is distinct from old.cnic then
      raise exception 'CNIC_IMMUTABLE';
    end if;
    if old.dob is not null and new.dob is distinct from old.dob then
      raise exception 'DOB_IMMUTABLE';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists protect_profile_identity on public.profiles;
create trigger protect_profile_identity
  before update on public.profiles
  for each row execute function public.prevent_identity_mutation();

-- ---------------------------------------------------------------------------
-- RPC: book_slot
-- ---------------------------------------------------------------------------

create or replace function public.book_slot(p_slot_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_slot public.slots%rowtype;
  v_vaccine public.vaccines%rowtype;
  v_center public.centers%rowtype;
  v_age int;
  v_verified int;
  v_last_dose date;
  v_booked int;
  v_appt_id uuid;
  v_eligible_from date;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
  if v_profile.role <> 'citizen' then
    raise exception 'CITIZENS_ONLY';
  end if;
  if v_profile.dob is null or length(trim(coalesce(v_profile.cnic, ''))) < 5 then
    raise exception 'PROFILE_INCOMPLETE';
  end if;

  select * into v_slot from public.slots where id = p_slot_id;
  if not found then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  if v_slot.slot_date < current_date then
    raise exception 'SLOT_EXPIRED';
  end if;

  if v_slot.slot_date = current_date and localtime not between v_slot.slot_time and v_slot.slot_end_time then
    raise exception 'BOOKING_WINDOW_CLOSED';
  end if;

  select * into v_center from public.centers where id = v_slot.center_id;
  if v_center.status is distinct from 'active' then
    raise exception 'CENTER_NOT_ACTIVE';
  end if;

  select * into v_vaccine from public.vaccines where id = v_slot.vaccine_id;

  v_age := extract(year from age (current_date, v_profile.dob))::int;
  if v_age < v_vaccine.min_age_years then
    raise exception 'TOO_YOUNG';
  end if;

  select count(*)::int into v_verified
  from public.vax_records
  where citizen_id = v_uid and vaccine_id = v_vaccine.id;

  if v_verified >= v_vaccine.doses_required then
    raise exception 'DOSE_1_ALREADY_TAKEN';
  end if;

  if v_verified > 0 then
    select max((administered_at at time zone 'utc')::date) into v_last_dose
    from public.vax_records
    where citizen_id = v_uid and vaccine_id = v_vaccine.id;

    v_eligible_from := v_last_dose + (v_vaccine.interval_days || ' days')::interval;
    if current_date < v_eligible_from then
      raise exception 'COOLDOWN_ACTIVE';
    end if;
  end if;

  select count(*)::int into v_booked
  from public.appointments
  where slot_id = p_slot_id and status = 'scheduled';

  if v_booked >= v_slot.capacity then
    raise exception 'SLOT_FULL';
  end if;

  if exists (
    select 1
    from public.appointments a
    join public.slots s on s.id = a.slot_id
    where a.citizen_id = v_uid
      and a.status = 'scheduled'
      and s.vaccine_id = v_vaccine.id
  ) then
    raise exception 'ALREADY_BOOKED_THIS_VACCINE';
  end if;

  insert into public.appointments (citizen_id, slot_id, status)
  values (v_uid, p_slot_id, 'scheduled')
  returning id into v_appt_id;

  return v_appt_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: verify_dose (atomic: complete appt, vax_record, stock -1, cert + notify)
-- ---------------------------------------------------------------------------

create or replace function public.verify_dose(p_appointment_id uuid, p_batch_number text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_actor public.profiles%rowtype;
  v_appt public.appointments%rowtype;
  v_slot public.slots%rowtype;
  v_center public.centers%rowtype;
  v_vaccine public.vaccines%rowtype;
  v_dose_num int;
  v_total_after int;
  v_batch text := trim(coalesce(p_batch_number, ''));
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if length(v_batch) < 3 then
    raise exception 'INVALID_BATCH';
  end if;

  select * into v_actor from public.profiles where id = v_uid;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;
  if v_appt.status is distinct from 'scheduled' then
    raise exception 'INVALID_APPOINTMENT_STATE';
  end if;

  select * into v_slot from public.slots where id = v_appt.slot_id;
  select * into v_center from public.centers where id = v_slot.center_id;

  if v_actor.role = 'admin' then
    null;
  elsif v_actor.role = 'manager' and v_center.manager_id = v_uid then
    null;
  else
    raise exception 'NOT_YOUR_CENTER';
  end if;

  select * into v_vaccine from public.vaccines where id = v_slot.vaccine_id;

  select coalesce(max(dose_number), 0) + 1 into v_dose_num
  from public.vax_records
  where citizen_id = v_appt.citizen_id and vaccine_id = v_vaccine.id;

  if v_dose_num > v_vaccine.doses_required then
    raise exception 'UNEXPECTED_DOSE';
  end if;

  if v_vaccine.doses_remaining < 1 then
    raise exception 'OUT_OF_STOCK';
  end if;

  insert into public.vax_records (
    citizen_id,
    vaccine_id,
    dose_number,
    batch_number,
    appointment_id,
    center_id
  )
  values (
    v_appt.citizen_id,
    v_vaccine.id,
    v_dose_num,
    v_batch,
    p_appointment_id,
    v_center.id
  );

  update public.appointments
  set status = 'completed', batch_number = v_batch
  where id = p_appointment_id;

  update public.vaccines
  set doses_remaining = doses_remaining - 1
  where id = v_vaccine.id and doses_remaining > 0;

  if not found then
    raise exception 'OUT_OF_STOCK';
  end if;

  select count(*)::int into v_total_after
  from public.vax_records
  where citizen_id = v_appt.citizen_id and vaccine_id = v_vaccine.id;

  if v_total_after >= v_vaccine.doses_required then
    insert into public.certificates (citizen_id, vaccine_id, pdf_url)
    values (v_appt.citizen_id, v_vaccine.id, null)
    on conflict (citizen_id, vaccine_id) do nothing;

    perform pg_notify(
      'certificate_ready',
      json_build_object(
        'citizen_id', v_appt.citizen_id,
        'vaccine_id', v_vaccine.id,
        'appointment_id', p_appointment_id
      )::text
    );
  end if;
end;
$$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.book_slot(uuid) to authenticated;
grant execute on function public.verify_dose(uuid, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.vaccines enable row level security;
alter table public.centers enable row level security;
alter table public.slots enable row level security;
alter table public.appointments enable row level security;
alter table public.vax_records enable row level security;
alter table public.certificates enable row level security;

-- Helper: is admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- is_admin is SECURITY DEFINER so it does not recurse through profiles RLS when evaluated from policies.

-- profiles
create policy profiles_select_self_or_admin
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy profiles_select_manager_linked_citizens
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles me
      where me.id = auth.uid() and me.role = 'manager'
    )
    and (
      exists (
        select 1
        from public.appointments a
        join public.slots s on s.id = a.slot_id
        join public.centers c on c.id = s.center_id
        where a.citizen_id = profiles.id
          and c.manager_id = auth.uid()
      )
      or exists (
        select 1
        from public.vax_records vr
        join public.centers c on c.id = vr.center_id
        where vr.citizen_id = profiles.id
          and c.manager_id = auth.uid()
      )
    )
  );

create policy profiles_update_self
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

create policy profiles_admin_update
  on public.profiles for update
  using (public.is_admin());

-- vaccines: all read; admin write
create policy vaccines_read_authenticated
  on public.vaccines for select
  to authenticated
  using (true);

create policy vaccines_admin_all
  on public.vaccines for all
  using (public.is_admin())
  with check (public.is_admin());

-- centers: one SELECT policy (OR of admin | manager-own | citizen+active)
create policy centers_select
  on public.centers for select
  to authenticated
  using (
    public.is_admin()
    or manager_id = auth.uid()
    or (
      status = 'active'
      and exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'citizen')
    )
  );

create policy centers_manager_insert
  on public.centers for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'manager')
    and manager_id = auth.uid()
    and status = 'pending'
  );

create policy centers_admin_update
  on public.centers for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy centers_admin_delete
  on public.centers for delete
  to authenticated
  using (public.is_admin());

-- slots: readable if center visible
create policy slots_select
  on public.slots for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.centers c
      where c.id = slots.center_id
        and (
          (c.manager_id = auth.uid())
          or (c.status = 'active' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'citizen'))
        )
    )
  );

create policy slots_manager_write
  on public.slots for insert
  to authenticated
  with check (
    exists (
      select 1 from public.centers c
      where c.id = center_id
        and c.manager_id = auth.uid()
        and c.status = 'active'
    )
    or public.is_admin()
  );

create policy slots_manager_update
  on public.slots for update
  to authenticated
  using (
    exists (
      select 1 from public.centers c
      where c.id = center_id and c.manager_id = auth.uid()
    )
    or public.is_admin()
  );

create policy slots_manager_delete
  on public.slots for delete
  to authenticated
  using (
    exists (
      select 1 from public.centers c
      where c.id = center_id and c.manager_id = auth.uid()
    )
    or public.is_admin()
  );

-- appointments
create policy appt_citizen_own
  on public.appointments for select
  to authenticated
  using (
    citizen_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1
      from public.slots s
      join public.centers c on c.id = s.center_id
      where s.id = appointments.slot_id and c.manager_id = auth.uid()
    )
  );

create policy appt_citizen_insert
  on public.appointments for insert
  to authenticated
  with check (false);

create policy appt_citizen_update
  on public.appointments for update
  to authenticated
  using (citizen_id = auth.uid() and status = 'scheduled')
  with check (citizen_id = auth.uid());

create policy appt_admin_update
  on public.appointments for update
  to authenticated
  using (public.is_admin());

-- vax_records
create policy vax_select
  on public.vax_records for select
  to authenticated
  using (
    citizen_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.centers c
      where c.id = vax_records.center_id and c.manager_id = auth.uid()
    )
  );

-- certificates
create policy cert_citizen
  on public.certificates for select
  to authenticated
  using (citizen_id = auth.uid() or public.is_admin());

create policy cert_insert_system
  on public.certificates for insert
  to authenticated
  with check (false);

create policy cert_update_admin_or_service
  on public.certificates for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Realtime: add tables to supabase_realtime publication (Dashboard → Database → Replication)
-- SQL:
-- alter publication supabase_realtime add table public.vaccines;
-- alter publication supabase_realtime add table public.centers;
-- alter publication supabase_realtime add table public.slots;
-- alter publication supabase_realtime add table public.appointments;
-- alter publication supabase_realtime add table public.vax_records;
-- alter publication supabase_realtime add table public.certificates;

comment on function public.book_slot(uuid) is 'Citizen books a slot; enforces age, doses, cooldown, capacity, and time window.';
comment on function public.verify_dose(uuid, text) is 'Manager/admin verifies dose; completes appointment, vax_record, decrements national stock, certificate row + pg_notify when fully vaccinated.';

create or replace function public.ensure_my_certificate(p_vaccine_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_required int;
  v_verified int;
  v_cert_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select doses_required into v_required
  from public.vaccines
  where id = p_vaccine_id;

  if v_required is null then
    raise exception 'VACCINE_NOT_FOUND';
  end if;

  select count(*)::int into v_verified
  from public.vax_records
  where citizen_id = v_uid and vaccine_id = p_vaccine_id;

  if v_verified < v_required then
    raise exception 'NOT_ELIGIBLE';
  end if;

  insert into public.certificates (citizen_id, vaccine_id, pdf_url)
  values (v_uid, p_vaccine_id, null)
  on conflict (citizen_id, vaccine_id) do update
    set vaccine_id = excluded.vaccine_id
  returning id into v_cert_id;

  return v_cert_id;
end;
$$;

create or replace function public.verify_certificate(p_certificate_id uuid)
returns table (
  valid boolean,
  certificate_id uuid,
  citizen_name text,
  cnic text,
  vaccine_name text,
  doses_verified int,
  doses_required int,
  last_batch_number text,
  last_administered_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with cert as (
    select c.id, c.citizen_id, c.vaccine_id
    from public.certificates c
    where c.id = p_certificate_id
  ), vr as (
    select
      r.citizen_id,
      r.vaccine_id,
      count(*)::int as cnt,
      (array_agg(r.batch_number order by r.administered_at desc nulls last))[1] as latest_batch,
      max(r.administered_at) as latest_at
    from public.vax_records r
    join cert c on c.citizen_id = r.citizen_id and c.vaccine_id = r.vaccine_id
    group by r.citizen_id, r.vaccine_id
  )
  select
    (coalesce(vr.cnt, 0) >= v.doses_required) as valid,
    c.id as certificate_id,
    p.full_name as citizen_name,
    p.cnic,
    v.name as vaccine_name,
    coalesce(vr.cnt, 0) as doses_verified,
    v.doses_required,
    vr.latest_batch as last_batch_number,
    vr.latest_at as last_administered_at
  from cert c
  join public.profiles p on p.id = c.citizen_id
  join public.vaccines v on v.id = c.vaccine_id
  left join vr on vr.citizen_id = c.citizen_id and vr.vaccine_id = c.vaccine_id;
end;
$$;

grant execute on function public.ensure_my_certificate(uuid) to authenticated;
grant execute on function public.verify_certificate(uuid) to anon, authenticated;

comment on function public.ensure_my_certificate(uuid)
  is 'Creates certificate row for authenticated citizen if completed required doses.';
comment on function public.verify_certificate(uuid)
  is 'Public verification of certificate validity and latest dose metadata for QR scans.';
