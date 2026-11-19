
do $$
declare r record; idx text; cols text;
begin
  for r in
    select c.oid, c.conrelid, c.conname,
           string_agg(format('%I', a.attname), ', ' order by u.ord) as cols,
           string_agg(a.attname, '_' order by u.ord) as colnames
    from pg_constraint c
    join lateral unnest(c.conkey) with ordinality u(attnum,ord) on true
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=u.attnum
    where c.contype='f' and c.connamespace='public'::regnamespace
    group by c.oid,c.conrelid,c.conname
  loop
    idx := left(r.conname || '_idx', 63);
    execute format('create index if not exists %I on %s (%s)', idx, r.conrelid::regclass, r.cols);
  end loop;
end $$;
