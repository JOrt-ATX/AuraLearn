"""Authentication boundary (RF-ID-09).

Implemented in phase 2. The rest of the application only ever sees a ``user_id`` and roles, so
the stage-1 local accounts can be swapped for Keycloak OIDC without touching anything else.
"""
