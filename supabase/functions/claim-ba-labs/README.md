# claim-ba-labs Edge Function

This source is the version-controlled implementation for the Supabase Edge Function
currently named `claim-ba-labs`.

## Existing behavior

- Only `ba.labs.redev@gmail.com` may bootstrap the `BA-LABS` organization.
- Empty request body preserves the original admin bootstrap flow.
- Ordinary users cannot self-enroll or grant themselves a role.

## Controlled member addition

After the target person has created their own Supabase Auth account, the administrator
can invoke the function with the administrator's authenticated session:

```json
{
  "action": "add_member",
  "email": "the-existing-account@example.com"
}
```

The function searches Auth users, adds the matching account to `BA-LABS` with the
least-privileged `member` role, and leaves existing roles unchanged. It returns
`404` if no matching account exists. It does not create accounts, send invitations,
or grant `owner`/ `admin` roles.

## Deployment safety

This repository change does not deploy the function. Before deployment, validate it
against a non-production Supabase environment and test:
- unauthenticated request is rejected;
- non-admin cannot add members;
- admin can add an existing account as `member`;
- repeat addition is idempotent;
- malformed email and unknown email are rejected;
- existing member role is never escalated or overwritten.

Never place a service-role/secret key in browser code or source control.
