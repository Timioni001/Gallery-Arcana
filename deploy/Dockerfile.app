# API, wallet worker, migrations and operator scripts share one image.
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY packages ./packages
RUN npm ci --no-audit --no-fund && npm run crypto:build && npm cache clean --force
COPY src ./src
COPY db ./db
COPY scripts ./scripts
COPY deploy/entrypoint.sh /usr/local/bin/arcana-entrypoint
RUN chmod 755 /usr/local/bin/arcana-entrypoint && mkdir -p /data/storage /data/secrets && chown -R node:node /data
USER node
ENV STORAGE_DIR=/data/storage \
    ATTESTATION_SIGNING_KEY_FILE=/data/secrets/arcana_ed25519_private.pem \
    ATTESTATION_VERIFY_KEY_FILE=/data/secrets/arcana_ed25519_public.pem
ENTRYPOINT ["arcana-entrypoint"]
CMD ["api"]
