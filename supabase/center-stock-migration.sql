-- Run this on an EXISTING database.
-- It adds center-level stock + requests without recreating base tables.

create table if not exists public.center_vaccine_stock (
  center_id uuid not null references public.centers (id) on delete cascade,
  vaccine_id uuid not null references public.vaccines (id) on delete cascade,
  doses_remaining int not null default 0 check (doses_remaining >= 0),
  updated_at timestamptz not null default now(),
  primary key (center_id, vaccine_id)
);

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

drop trigger if exists protect_profile_identity on public.profiles;
create trigger protect_profile_identity
  before update on public.profiles
  for each row execute function public.prevent_identity_mutation();

create table if not exists public.center_dose_requests (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id) on delete cascade,
  vaccine_id uuid not null references public.vaccines (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  requested_doses int not null check (requested_doses > 0),
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists center_stock_vaccine_idx on public.center_vaccine_stock (vaccine_id);
create index if not exists center_dose_requests_center_idx on public.center_dose_requests (center_id);
create index if not exists center_dose_requests_status_idx on public.center_dose_requests (status);

alter table public.center_vaccine_stock enable row level security;
alter table public.center_dose_requests enable row level security;

drop policy if exists center_stock_select on public.center_vaccine_stock;
create policy center_stock_select
  on public.center_vaccine_stock for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.centers c
      where c.id = center_vaccine_stock.center_id and c.manager_id = auth.uid()
    )
    or exists (
      select 1
      from public.centers c
      join public.profiles p on p.id = auth.uid()
      where c.id = center_vaccine_stock.center_id
        and c.status = 'active'
        and p.role = 'citizen'
    )
  );

drop policy if exists center_stock_admin_write on public.center_vaccine_stock;
create policy center_stock_admin_write
  on public.center_vaccine_stock for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists center_dose_req_select on public.center_dose_requests;
create policy center_dose_req_select
  on public.center_dose_requests for select
  to authenticated
  using (
    public.is_admin()
    or requested_by = auth.uid()
    or exists (
      select 1 from public.centers c
      where c.id = center_dose_requests.center_id and c.manager_id = auth.uid()
    )
  );

drop policy if exists center_dose_req_insert_manager on public.center_dose_requests;
create policy center_dose_req_insert_manager
  on public.center_dose_requests for insert
  to authenticated
  with check (
    exists (
      select 1 from public.centers c
      join public.profiles p on p.id = auth.uid()
      where c.id = center_id
        and c.manager_id = auth.uid()
        and c.status = 'active'
        and p.role = 'manager'
    )
    and requested_by = auth.uid()
    and status = 'pending'
  );

drop policy if exists center_dose_req_admin_update on public.center_dose_requests;
create policy center_dose_req_admin_update
  on public.center_dose_requests for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists centers_admin_delete on public.centers;
create policy centers_admin_delete
  on public.centers for delete
  to authenticated
  using (public.is_admin());

create or replace function public.can_manager_view_citizen_profile(p_citizen_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
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
      where a.citizen_id = p_citizen_id
        and c.manager_id = auth.uid()
    )
    or exists (
      select 1
      from public.vax_records vr
      join public.centers c on c.id = vr.center_id
      where vr.citizen_id = p_citizen_id
        and c.manager_id = auth.uid()
    )
  );
$$;

grant execute on function public.can_manager_view_citizen_profile(uuid) to authenticated;

drop policy if exists profiles_select_manager_linked_citizens on public.profiles;
create policy profiles_select_manager_linked_citizens
  on public.profiles for select
  to authenticated
  using (public.can_manager_view_citizen_profile(id));

create or replace function public.allocate_center_stock(
  p_center_id uuid,
  p_vaccine_id uuid,
  p_doses int,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;
  if p_doses is null or p_doses <= 0 then
    raise exception 'INVALID_DOSE_QUANTITY';
  end if;

  update public.vaccines
  set doses_remaining = doses_remaining - p_doses
  where id = p_vaccine_id and doses_remaining >= p_doses;

  if not found then
    raise exception 'NATIONAL_STOCK_LOW';
  end if;

  insert into public.center_vaccine_stock (center_id, vaccine_id, doses_remaining)
  values (p_center_id, p_vaccine_id, p_doses)
  on conflict (center_id, vaccine_id)
  do update
    set doses_remaining = center_vaccine_stock.doses_remaining + excluded.doses_remaining,
        updated_at = now();
end;
$$;

create or replace function public.request_center_stock(
  p_center_id uuid,
  p_vaccine_id uuid,
  p_doses int,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_doses is null or p_doses <= 0 then
    raise exception 'INVALID_DOSE_QUANTITY';
  end if;

  if not exists (
    select 1
    from public.centers c
    join public.profiles p on p.id = v_uid
    where c.id = p_center_id
      and c.manager_id = v_uid
      and c.status = 'active'
      and p.role = 'manager'
  ) then
    raise exception 'NOT_YOUR_CENTER';
  end if;

  insert into public.center_dose_requests (
    center_id,
    vaccine_id,
    requested_by,
    requested_doses,
    note,
    status
  )
  values (
    p_center_id,
    p_vaccine_id,
    v_uid,
    p_doses,
    nullif(trim(coalesce(p_note, '')), ''),
    'pending'
  )
  returning id into v_req_id;

  return v_req_id;
end;
$$;

create or replace function public.review_center_stock_request(
  p_request_id uuid,
  p_approve boolean,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.center_dose_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;

  select * into v_req
  from public.center_dose_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'REQUEST_ALREADY_REVIEWED';
  end if;

  if p_approve then
    perform public.allocate_center_stock(v_req.center_id, v_req.vaccine_id, v_req.requested_doses, p_review_note);

    update public.center_dose_requests
    set status = 'approved',
        reviewed_by = v_uid,
        review_note = nullif(trim(coalesce(p_review_note, '')), ''),
        reviewed_at = now()
    where id = v_req.id;
  else
    update public.center_dose_requests
    set status = 'rejected',
        reviewed_by = v_uid,
        review_note = nullif(trim(coalesce(p_review_note, '')), ''),
        reviewed_at = now()
    where id = v_req.id;
  end if;
end;
$$;

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
  v_center_booked int;
  v_center_stock int;
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

  select * into v_center from public.centers where id = v_slot.center_id;
  if v_center.status is distinct from 'active' then
    raise exception 'CENTER_NOT_ACTIVE';
  end if;

  select * into v_vaccine from public.vaccines where id = v_slot.vaccine_id;

  select cvs.doses_remaining into v_center_stock
  from public.center_vaccine_stock cvs
  where cvs.center_id = v_center.id and cvs.vaccine_id = v_vaccine.id;

  if coalesce(v_center_stock, 0) < 1 then
    raise exception 'OUT_OF_CENTER_STOCK';
  end if;

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

  select count(*)::int into v_center_booked
  from public.appointments a
  join public.slots s on s.id = a.slot_id
  where s.center_id = v_center.id
    and s.vaccine_id = v_vaccine.id
    and a.status = 'scheduled';

  if v_center_booked >= v_center_stock then
    raise exception 'OUT_OF_CENTER_STOCK';
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

  update public.center_vaccine_stock
  set doses_remaining = doses_remaining - 1,
      updated_at = now()
  where center_id = v_center.id
    and vaccine_id = v_vaccine.id
    and doses_remaining > 0;

  if not found then
    raise exception 'OUT_OF_CENTER_STOCK';
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
      (
        array_agg(r.batch_number order by r.administered_at desc nulls last)
      )[1] as latest_batch,
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

grant execute on function public.allocate_center_stock(uuid, uuid, int, text) to authenticated;
grant execute on function public.request_center_stock(uuid, uuid, int, text) to authenticated;
grant execute on function public.review_center_stock_request(uuid, boolean, text) to authenticated;
grant execute on function public.book_slot(uuid) to authenticated;
grant execute on function public.verify_dose(uuid, text) to authenticated;
grant execute on function public.ensure_my_certificate(uuid) to authenticated;
grant execute on function public.verify_certificate(uuid) to anon, authenticated;

alter table public.slots
  add column if not exists slot_end_time time;

update public.slots
set slot_end_time = case
  when slot_time <= time '22:59:59' then (slot_time + interval '1 hour')::time
  when slot_time <= time '23:58:59' then (slot_time + interval '1 minute')::time
  else time '23:59:59'
end
where slot_end_time is null;

alter table public.slots
  alter column slot_end_time set not null;

alter table public.slots
  drop constraint if exists slots_time_window_check;

alter table public.slots
  add constraint slots_time_window_check check (slot_end_time > slot_time);

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
  v_center_booked int;
  v_center_stock int;
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

  if v_slot.slot_date = current_date and localtime > v_slot.slot_time then
    raise exception 'BOOKING_WINDOW_CLOSED';
  end if;

  select * into v_center from public.centers where id = v_slot.center_id;
  if v_center.status is distinct from 'active' then
    raise exception 'CENTER_NOT_ACTIVE';
  end if;

  select * into v_vaccine from public.vaccines where id = v_slot.vaccine_id;

  select cvs.doses_remaining into v_center_stock
  from public.center_vaccine_stock cvs
  where cvs.center_id = v_center.id and cvs.vaccine_id = v_vaccine.id;

  if coalesce(v_center_stock, 0) < 1 then
    raise exception 'OUT_OF_CENTER_STOCK';
  end if;

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

  select count(*)::int into v_center_booked
  from public.appointments a
  join public.slots s on s.id = a.slot_id
  where s.center_id = v_center.id
    and s.vaccine_id = v_vaccine.id
    and a.status = 'scheduled';

  if v_center_booked >= v_center_stock then
    raise exception 'OUT_OF_CENTER_STOCK';
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
