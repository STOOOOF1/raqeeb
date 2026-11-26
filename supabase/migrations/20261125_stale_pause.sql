-- الإيقاف المؤقت لا يتجاوز يومه (بتوقيت الرياض):
-- إيقاف من يوم سابق كان يبقى معلّقًا فيجمّد كل وقت يكسبه الطفل بعده، واستئنافه يرحّل الأوقات أيامًا.
-- الآن: الاستئناف بعد يوم سابق يمسح الإيقاف دون ترحيل، والإيقاف الجديد يحل محل القديم، وبدء وقت جاهز يمسح القديم.

create or replace function public.pause_is_stale(p_pa timestamptz)
returns boolean language sql stable set search_path to 'public' as $$
  select p_pa is not null and (p_pa at time zone 'Asia/Riyadh')::date < (now() at time zone 'Asia/Riyadh')::date
$$;

create or replace function public.pause_time(p_pause boolean, p_at timestamp with time zone default null::timestamp with time zone, p_op uuid default null::uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare c uuid := my_child(); pa timestamptz; at timestamptz; delta interval;
begin
  if c is null then raise exception 'not a child device'; end if;
  if p_op is not null then
    insert into client_ops (id, child_id) values (p_op, c) on conflict do nothing;
    if not found then return; end if;
  end if;
  at := least(greatest(coalesce(p_at, now()), now() - interval '36 hours'), now());
  select paused_at into pa from children where id = c for update;
  -- إيقاف من يوم سابق: لا أثر له، أوقاته انتهت
  if pause_is_stale(pa) then
    update children set paused_at = case when p_pause then at else null end where id = c;
    return;
  end if;
  if p_pause then
    if pa is null then update children set paused_at = at where id = c; end if;
    return;
  end if;
  if pa is null then return; end if;
  delta := greatest(at - pa, interval '0');
  -- إذن الوالدين الذي أُعطي بعد الإيقاف لا يُرحَّل (لم يكن موقوفًا)
  update grants set ends_at = ends_at + delta,
         starts_at = case when starts_at > pa then starts_at + delta else starts_at end
   where child_id = c and status = 'active' and ends_at > pa
     and not (source = 'parent' and starts_at >= pa);
  update children set paused_at = null where id = c;
end $function$;

create or replace function public.start_grant(p_id uuid, p_start timestamp with time zone default null::timestamp with time zone)
 returns grants
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare g grants; s timestamptz;
begin
  select * into g from grants where id = p_id and child_id = my_child() for update;
  if g.id is null or g.status = 'cancelled' then raise exception 'الوقت غير متاح'; end if;
  if g.status = 'active' then return g; end if;
  update children set paused_at = null where id = g.child_id and pause_is_stale(paused_at);
  s := clamp_start(p_start, g.child_id);
  update grants set status = 'active', starts_at = s, ends_at = s + make_interval(mins => g.minutes) where id = p_id returning * into g;
  return g;
end $function$;

-- علاج البيانات الحالية: مسح الإيقافات المعلّقة من أيام سابقة
update children set paused_at = null where pause_is_stale(paused_at);
