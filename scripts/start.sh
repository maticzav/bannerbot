#!/bin/bash

echo "DB url: $DATABASE_URL"
export POSTGRESQL_URL="${DATABASE_URL/postgres\:\/\//postgresql://}?sslaccept=accept_invalid_certs"
echo "Fixed URL: $POSTGRESQL_URL"

echo "DEPLOYING... ($PORT)"

node ./server/dist/index.js
