#!/usr/bin/env sh
# Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE
#
# Generate a dev RSA keypair for Berth token issuance.
# Writes:
#   docker/token/dev-signing-key.pem  (private key — dev only)
#   docker/registry/certs/rootcert.pem (public cert bundle for registry trust)

set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
KEY_PATH="${ROOT_DIR}/token/dev-signing-key.pem"
CERT_PATH="${ROOT_DIR}/registry/certs/rootcert.pem"

mkdir -p "$(dirname "$KEY_PATH")" "$(dirname "$CERT_PATH")"

openssl genrsa -out "$KEY_PATH" 2048
openssl req -new -x509 \
  -key "$KEY_PATH" \
  -out "$CERT_PATH" \
  -days 3650 \
  -subj "/CN=berth-dev-token-issuer" \
  -sha256

chmod 644 "$KEY_PATH" "$CERT_PATH"

echo "Wrote signing key: $KEY_PATH"
echo "Wrote registry root cert bundle: $CERT_PATH"
