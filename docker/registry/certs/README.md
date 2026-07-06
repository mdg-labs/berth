# Dev token signing material (spec §3.3, §9.2).
# Generate with: ./docker/token/generate-keypair.sh
# - docker/token/dev-signing-key.pem — app signing key (dev only; mount via compose)
# - docker/registry/certs/rootcert.pem — registry trust bundle (may hold multiple PEM certs for rotation)
