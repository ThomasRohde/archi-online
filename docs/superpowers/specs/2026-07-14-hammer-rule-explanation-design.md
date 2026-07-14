# Hammer Rule Explanation Copy

## Goal

Explain Hammer rules briefly in plain language without referring to a specific Archi Desktop version.

## Approved change

Replace the validator configuration introduction with:

> Hammer rules are configurable checks that flag common modelling problems. Model-integrity checks always run separately.

Only the dialog copy and its focused UI assertion change. Rule behavior, labels, severities, persistence, and documentation remain unchanged.

## Verification

Update the validator panel test to assert the new explanation and continue verifying that integrity checks are not presented as Hammer rules.
