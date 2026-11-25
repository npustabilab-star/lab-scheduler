begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select tests.create_user('t@x.com', 'teacher', 'active', true) as t \gset
select tests.create_user('a@x.com', 'grad', 'active', true) as a \gset
select tests.create_user('a2@x.com', 'grad', 'active', true) as a2 \gset
select tests.create_user('g@x.com', 'grad') as g \gset

select tests.login_as(:'a'::uuid);
select throws_ok(format($$select set_admin(%L, true)$$, :'g'), 'ONLY_TEACHER', 'non-teacher admin cannot grant admin');
select throws_ok(format($$select set_admin(%L, false)$$, :'a2'), 'ONLY_TEACHER', 'non-teacher admin cannot revoke admin');
select throws_ok(format($$select set_account_status(%L, 'disabled', true)$$, :'t'), 'ONLY_TEACHER', 'non-teacher admin cannot disable the teacher');
select throws_ok(format($$select set_account_status(%L, 'disabled', true)$$, :'a2'), 'ONLY_TEACHER', 'non-teacher admin cannot disable another admin');
select lives_ok(format($$select set_account_status(%L, 'disabled', true)$$, :'g'), 'non-teacher admin can disable an ordinary grad');
select tests.logout();

select tests.login_as(:'t'::uuid);
select lives_ok(format($$select set_admin(%L, true)$$, :'g'), 'teacher can grant admin');
select lives_ok(format($$select set_admin(%L, false)$$, :'a2'), 'teacher can revoke admin');
select lives_ok(format($$select set_account_status(%L, 'disabled', true)$$, :'a'), 'teacher can disable an admin');
select tests.logout();

select * from finish();
rollback;
