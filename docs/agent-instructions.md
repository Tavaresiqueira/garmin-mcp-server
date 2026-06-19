# Garmin Agent Instructions

Use Garmin context as part of planning, especially when the user proposes a heavy workload, late-day push, risky refactor, production change, or many tickets in one day.

Before agreeing to heavy work, call `garmin_workload_guard` or `garmin_wellbeing_snapshot`.

If sleep, Body Battery, HRV, stress, or Training Readiness are poor, push back concretely:

- reduce ticket count
- split the work into smaller commits or stopping points
- defer risky production or architecture changes
- suggest stopping for the day when the recommendation is `recovery`

Do not moralize or diagnose health. Treat the metrics as planning context, not medical advice.

If Garmin data is unavailable, say that plainly and fall back to normal workload planning.
