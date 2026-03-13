#!/bin/bash
set -e

# Seed exercises + create E2E test user via SQL (no service role key needed)
E2E_SEED=true npm run db:seed

echo "Seed complete."
